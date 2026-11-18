/**
 * Backend test runner.
 *
 * 1. Starts a throwaway embedded PostgreSQL (never Supabase).
 * 2. Applies the committed Prisma migrations to a template database
 *    (this also proves the migrations apply cleanly from scratch).
 * 3. Runs every tests/*.test.ts file in its own fresh database cloned from
 *    the template, with test-only secrets.
 *
 *   npm --workspace backend test            # all files
 *   npm --workspace backend test -- referral # files whose name contains "referral"
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate, startLocalPg } from '../scripts/embedded-pg';

const root = path.resolve(__dirname, '..');
const filter = process.argv[2];

async function main() {
  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.ts') && (!filter || f.includes(filter)))
    .sort();
  if (!files.length) throw new Error('No test files matched');

  const port = 54000 + Math.floor(Math.random() * 900);
  const pg = await startLocalPg({ port, persistent: false });
  let failed = 0;
  try {
    await pg.createDatabase('template_globalantic', undefined, { utf8: true });
    const t0 = Date.now();
    migrate(pg.url('template_globalantic'), root);
    console.log(`✓ migrations applied to a fresh database (${Date.now() - t0} ms)`);

    for (const [i, file] of files.entries()) {
      const db = `t${i}_${file.replace(/\W/g, '_').toLowerCase()}`.slice(0, 60);
      await pg.createDatabase(db, 'template_globalantic');
      // Small fixed pool: PostgreSQL on Windows starts a process per connection, so avoid churn.
      const url = `${pg.url(db)}?connection_limit=4&pool_timeout=30`;
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', path.join('tests', file)], {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: url,
          DIRECT_URL: url,
          JWT_SECRET: 'test-jwt-secret-not-for-production',
          HASH_SALT: 'test-hash-salt',
          RESEND_API_KEY: '',
          RAZORPAY_KEY_ID: 'rzp_test_key',
          RAZORPAY_KEY_SECRET: 'rzp_test_secret',
          RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret',
          FRONTEND_URL: 'http://localhost:3000',
          TRAINING_URL: 'http://localhost:3001',
          INTERN_PORTAL_URL: 'http://localhost:3002',
          UPLOAD_DIR: path.join(os.tmpdir(), `globalantic-test-uploads-${process.pid}-${i}`),
        },
      });
      if (result.status !== 0) failed += 1;
    }
  } finally {
    await pg.stop();
  }
  console.log(failed ? `\n✗ ${failed} test file(s) failed` : `\n✓ all ${files.length} test files passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
