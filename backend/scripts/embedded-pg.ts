/**
 * Local, throwaway PostgreSQL for tests and local development (dev dependency
 * `embedded-postgres`). It never touches Supabase: every URL produced here
 * points at 127.0.0.1.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface LocalPg {
  port: number;
  url(db: string): string;
  /** utf8: force a UTF-8 database (like production) — needed for real data such as ₹. */
  createDatabase(name: string, template?: string, opts?: { utf8?: boolean }): Promise<void>;
  stop(): Promise<void>;
}

const USER = 'postgres';
const PASSWORD = 'postgres';

export async function startLocalPg(opts: { dir?: string; port: number; persistent: boolean }): Promise<LocalPg> {
  const dir = opts.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'globalantic-pg-'));
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: USER,
    password: PASSWORD,
    port: opts.port,
    persistent: opts.persistent,
    onLog: () => {},
    onError: () => {},
  });
  if (fresh) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  return {
    port: opts.port,
    url: (db) => `postgresql://${USER}:${PASSWORD}@127.0.0.1:${opts.port}/${db}`,
    async createDatabase(name, template, opts) {
      if (!/^[a-z0-9_]+$/.test(name)) throw new Error('bad db name');
      const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (exists.rowCount) return;
      if (opts?.utf8) {
        // Production (Supabase) is UTF-8; the Windows cluster default (WIN1252) cannot store e.g. ₹.
        // Prefer an en-US collation (same ordering as before); fall back to C where it is unavailable.
        try {
          await client.query(`CREATE DATABASE ${name} WITH ENCODING 'UTF8' LC_COLLATE 'en-US' LC_CTYPE 'en-US' TEMPLATE template0`);
        } catch {
          await client.query(`CREATE DATABASE ${name} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
        }
      }
      else await client.query(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ''}`);
    },
    async stop() {
      await client.end().catch(() => {});
      await pg.stop();
    },
  };
}

/** Applies every committed migration to `url` (same command production uses). */
export function migrate(url: string, cwd: string): void {
  execSync('npx prisma migrate deploy', {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}
