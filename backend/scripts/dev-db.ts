/**
 * Local development database (embedded PostgreSQL). Data lives in ~/.globalantic/dev-db —
 * deliberately outside the OneDrive-synced project folder (sync would lock DB files).
 *
 *   npm --workspace backend run dev:db            # start + migrate, keep running
 *   npm --workspace backend run dev:db -- --seed  # also load clearly-labelled [DEMO] data
 *
 * Then run the API against it in another terminal:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54320/globalantic_dev npm --workspace backend run dev
 *
 * It never touches Supabase.
 */
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { migrate, startLocalPg } from './embedded-pg';

const PORT = 54320;
// DEV_DB_NAME picks another database in the same cluster (e.g. a fresh UTF-8 one next to an older WIN1252 one).
const DB = process.env.DEV_DB_NAME || 'globalantic_dev';

async function main() {
  const root = path.resolve(__dirname, '..');
  const pg = await startLocalPg({ dir: path.join(os.homedir(), '.globalantic', 'dev-db'), port: PORT, persistent: true });
  // UTF-8 like production (Supabase). Databases created by older versions of this script use the
  // Windows default WIN1252 and reject characters such as ₹ — recreate them or set DEV_DB_NAME.
  await pg.createDatabase(DB, undefined, { utf8: true });
  const url = pg.url(DB);
  migrate(url, root);
  console.log(`✓ local database ready: ${url}`);
  if (process.argv.includes('--seed')) {
    execSync('npx tsx ../prisma/seed-training-dev.ts', { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
  }
  console.log('Press Ctrl+C to stop.');
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
