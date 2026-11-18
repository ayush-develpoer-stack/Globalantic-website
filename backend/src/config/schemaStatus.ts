import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

/**
 * Compares the migrations shipped with this build against the ones recorded as applied
 * in the database. A reachable database whose schema is older than the code makes most
 * routes fail with P2021/P2022 (→ 503), so readiness must report it, not just `SELECT 1`.
 *
 * src/config and dist/config are both two levels below backend/, which ships its own
 * prisma/ copy so the standalone backend repo (Render) has it.
 */
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../../prisma/migrations');

export type SchemaState = 'current' | 'behind' | 'unknown';
export interface SchemaStatus {
  state: SchemaState;
  pending: string[];
}

let shipped: string[] | null | undefined;

function shippedMigrations(): string[] | null {
  if (shipped !== undefined) return shipped;
  try {
    shipped = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    shipped = null; // migrations folder not deployed with this build
  }
  return shipped;
}

export async function getSchemaStatus(prisma: PrismaClient): Promise<SchemaStatus> {
  const expected = shippedMigrations();
  if (!expected) return { state: 'unknown', pending: [] };
  let applied: Set<string>;
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = new Set(rows.map((r) => r.migration_name));
  } catch (err) {
    // No _prisma_migrations table means nothing was ever migrated.
    if ((err as { meta?: { code?: string } }).meta?.code === '42P01') applied = new Set();
    else throw err;
  }
  const pending = expected.filter((n) => !applied.has(n));
  return { state: pending.length ? 'behind' : 'current', pending };
}
