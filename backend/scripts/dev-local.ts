/**
 * Local API + local database in one command. Never touches Supabase or real inboxes.
 *
 *   npm --workspace backend run dev:local            # embedded Postgres (:54320) + API (:4000)
 *   npm --workspace backend run dev:local -- --seed  # also load the [DEMO] accounts and data
 *
 * backend/.env is still read for secrets such as JWT_SECRET and HASH_SALT, but everything that
 * points at production is overridden here for this process only:
 *   - DATABASE_URL / DIRECT_URL  -> local embedded Postgres (data in ~/.globalantic/dev-db)
 *   - FRONTEND_URL, *_URL        -> http://localhost:300x portals, API on :4000
 *   - COOKIE_DOMAIN              -> unset (the browser would reject .globalantic.com on localhost)
 *   - RESEND_API_KEY             -> unset, so no email is ever sent from a local machine; invite
 *                                   and reset links are printed in this console instead and the
 *                                   admin "Add user" dialog shows the set-password link.
 * Set DEV_LOCAL_KEEP_EMAIL=1 to keep RESEND_API_KEY from .env.
 */
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { migrate, startLocalPg } from './embedded-pg';

const PG_PORT = 54320;
const API_PORT = process.env.PORT || '4000';
const DB = process.env.DEV_DB_NAME || 'globalantic_dev';

const PORTALS = {
  MAIN_SITE_URL: 'http://localhost:3000',
  TRAINING_URL: 'http://localhost:3001',
  INTERN_PORTAL_URL: 'http://localhost:3002',
  EMPLOYEE_PORTAL_URL: 'http://localhost:3003',
  ADMIN_PORTAL_URL: 'http://localhost:3004',
  TRAINER_PORTAL_URL: 'http://localhost:3005',
};

async function main() {
  const root = path.resolve(__dirname, '..');
  const pg = await startLocalPg({ dir: path.join(os.homedir(), '.globalantic', 'dev-db'), port: PG_PORT, persistent: true });
  await pg.createDatabase(DB, undefined, { utf8: true });
  const url = pg.url(DB);
  migrate(url, root);
  console.log(`✓ local database ready on 127.0.0.1:${PG_PORT}/${DB} (migrations applied)`);
  if (process.argv.includes('--seed')) {
    execSync('npx tsx ../prisma/seed-training-dev.ts', { cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } });
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: API_PORT,
    DATABASE_URL: url,
    DIRECT_URL: url,
    FRONTEND_URL: Object.values(PORTALS).join(','),
    PUBLIC_API_URL: `http://localhost:${API_PORT}/api`,
    COOKIE_DOMAIN: '',
    UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(os.homedir(), '.globalantic', 'uploads'),
    ...PORTALS,
  };
  if (!process.env.DEV_LOCAL_KEEP_EMAIL) env.RESEND_API_KEY = '';

  console.log(`→ starting API on http://localhost:${API_PORT} (local database, emails ${env.RESEND_API_KEY ? 'ENABLED' : 'disabled'})`);
  const api = spawn('npx tsx watch src/server.ts', { cwd: root, env, stdio: 'inherit', shell: true });

  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    if (!api.killed) api.kill();
    await pg.stop().catch(() => {});
    process.exit(code);
  };
  api.on('exit', (code) => void stop(code ?? 0));
  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
