/**
 * Read-only safety checks before applying pending migrations to the live database.
 *
 *   npx tsx scripts/migration-rehearsal.ts
 *
 * 1. Drift check: live schema vs. the migrations already recorded as applied on it
 *    (empty diff = the live DB is exactly what Prisma thinks it is).
 * 2. JSON backup of every row of every table -> ~/.globalantic/backups/ (outside the repo).
 * 3. Rehearsal: a local embedded Postgres at the same migration state, loaded with the
 *    backed-up rows, then `prisma migrate deploy` of ALL migrations; row counts are compared.
 *
 * Nothing is written to the live database. Connection strings are never printed.
 */
import '../src/config/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { migrate, startLocalPg } from './embedded-pg';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(ROOT, '../prisma/migrations');

const redact = (s: string) => s.replace(/postgres(ql)?:\/\/[^\s"']+/g, '<redacted-url>');

/** Folder with only the given migrations (+ lock file and a schema copy). */
function migrationsSubset(names: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-subset-'));
  fs.mkdirSync(path.join(dir, 'migrations'));
  for (const n of names) fs.cpSync(path.join(MIGRATIONS, n), path.join(dir, 'migrations', n), { recursive: true });
  fs.copyFileSync(path.join(MIGRATIONS, 'migration_lock.toml'), path.join(dir, 'migrations', 'migration_lock.toml'));
  fs.copyFileSync(path.resolve(ROOT, '../prisma/schema.prisma'), path.join(dir, 'schema.prisma'));
  return dir;
}

/** A backed-up value as text for `$n::text::<type>` (arrays as Postgres array literals). */
function asText(v: unknown, type: string): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`;
  if (type.endsWith('[]') && Array.isArray(v)) return `{${v.map((x) => `"${String(x).replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
  if (typeof v === 'object' && (v as { constructor?: { name?: string } }).constructor?.name === 'Decimal') return String(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

async function main() {
  const live = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!live) throw new Error('DIRECT_URL / DATABASE_URL not set');
  const prodDb = new PrismaClient({ datasources: { db: { url: live } } });
  const applied = ((await prodDb.$queryRawUnsafe(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at',
  )) as { migration_name: string }[]).map((r) => r.migration_name);
  const all = fs.readdirSync(MIGRATIONS).filter((n) => fs.statSync(path.join(MIGRATIONS, n)).isDirectory()).sort();
  const pending = all.filter((n) => !applied.includes(n));
  console.log(`applied on live: ${applied.length}; pending: ${pending.length ? pending.join(', ') : 'none'}`);
  if (applied.some((n) => !all.includes(n))) throw new Error('live has migrations that are not in this repository');

  const pg = await startLocalPg({ port: 54340, persistent: false });
  try {
    // ---- 1. drift check (live vs applied migrations, via a local shadow DB)
    const baseline = migrationsSubset(applied);
    await pg.createDatabase('shadow', undefined, { utf8: true });
    let drift = '';
    try {
      drift = execSync(
        `npx prisma migrate diff --from-url "${process.platform === 'win32' ? '%LIVE_URL%' : '$LIVE_URL'}" --to-migrations "${path.join(baseline, 'migrations')}" --shadow-database-url "${pg.url('shadow')}" --script`,
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LIVE_URL: live, PRISMA_HIDE_UPDATE_MESSAGE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      throw new Error('drift check failed: ' + redact(String((e as { stderr?: string }).stderr ?? e)));
    }
    const meaningful = drift.split('\n').filter((l) => l.trim() && !l.startsWith('--'));
    console.log(meaningful.length ? `DRIFT: live schema differs from its applied migrations:\n${meaningful.join('\n')}` : 'drift check: live schema == applied migrations (no drift)');

    // ---- 2. backup of every table
    const tables = ((await prodDb.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`,
    )) as { table_name: string }[]).map((r) => r.table_name);
    const backup: Record<string, unknown[]> = {};
    for (const t of tables) backup[t] = await prodDb.$queryRawUnsafe(`SELECT * FROM "${t}"`);
    await prodDb.$disconnect();
    const dir = path.join(os.homedir(), '.globalantic', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `supabase-pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { mode: 0o600 });
    console.log(`backup: ${file}`);
    const nonEmpty = Object.fromEntries(tables.filter((t) => backup[t].length).map((t) => [t, backup[t].length]));
    console.log('live row counts (non-empty tables):', nonEmpty);
    if (!pending.length) return;

    // ---- 3. rehearsal on a local copy at the live state
    await pg.createDatabase('rehearsal', undefined, { utf8: true });
    execSync(`npx prisma migrate deploy --schema "${path.join(baseline, 'schema.prisma')}"`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: pg.url('rehearsal'), DIRECT_URL: pg.url('rehearsal'), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    });
    const local = new PrismaClient({ datasources: { db: { url: pg.url('rehearsal') } } });
    await local.$transaction(async (tx) => {
      // Local superuser only: skip FK triggers so rows can be loaded in any order.
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      for (const t of tables) {
        const typeRows = (await tx.$queryRawUnsafe(
          `SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a
           WHERE a.attrelid = '"${t}"'::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
        )) as { col: string; type: string }[];
        const typeOf = new Map(typeRows.map((r) => [r.col, r.type]));
        for (const row of backup[t] as Record<string, unknown>[]) {
          const cols = Object.keys(row);
          const values = cols.map((c) => asText(row[c], typeOf.get(c) ?? 'text'));
          const placeholders = cols.map((c, i) => `$${i + 1}::text::${typeOf.get(c) ?? 'text'}`);
          await tx.$executeRawUnsafe(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders.join(',')})`, ...values);
        }
      }
    }, { timeout: 300_000 });
    await local.$disconnect();
    migrate(pg.url('rehearsal'), ROOT); // applies the pending migrations on top
    const after = new PrismaClient({ datasources: { db: { url: pg.url('rehearsal') } } });
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = Number(((await after.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`)) as { n: number }[])[0].n);
    const appliedNow = ((await after.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations ORDER BY started_at')) as { migration_name: string }[]).map((m) => m.migration_name);
    // Probes: the queries that fail on an un-migrated DB
    const loginProbe = await after.user.findFirst({ select: { id: true, status: true, role: true } });
    const materialsProbe = await after.learningMaterial.count();
    const examProbe = await after.exam.count();
    await after.$disconnect();
    const preserved = tables.every((t) => counts[t] === backup[t].length);
    console.log('rehearsal migrations applied:', appliedNow.join(', '));
    console.log(preserved ? 'REHEARSAL OK: all existing rows preserved in every table' : `REHEARSAL MISMATCH: ${tables.filter((t) => counts[t] !== backup[t].length).join(', ')}`);
    console.log('probes on migrated copy:', { login: loginProbe ? `works (status=${loginProbe.status})` : 'no users', learningMaterials: materialsProbe, exams: examProbe });
  } finally {
    // Windows can keep the temp data dir locked briefly; cleanup failure must not hide the real result.
    await pg.stop().catch(() => {});
  }
}

main().catch((e) => {
  console.error('FAILED:', redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
