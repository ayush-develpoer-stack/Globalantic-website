#!/usr/bin/env node
/**
 * Copies the committed source of each app repo (admin, backend, ...) into this main repo's
 * index, so the main repo holds the full codebase. Run after committing in the app repos:
 *
 *   node scripts/sync-apps.mjs            # stage every app
 *   node scripts/sync-apps.mjs admin      # stage one app
 *   git commit -m "Sync apps" && git push
 *
 * Each app folder keeps its own .git, so `git add admin` would store a pointer instead of
 * files; this script reads the app's last commit instead. Secrets and build output tracked
 * by an app repo (backend/.env, backend/dist) are never copied.
 */
import { execFileSync } from 'node:child_process';

const APPS = ['admin', 'backend', 'employee', 'frontend', 'intern', 'trainer', 'training'];
const EXCLUDE = /(^|\/)\.env(\.local)?$|(^|\/)node_modules\/|(^|\/)\.next\/|^backend\/dist\//;

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }).trim();

const picked = process.argv.slice(2);
for (const app of picked.length ? picked : APPS) {
  if (!APPS.includes(app)) throw new Error(`Unknown app "${app}". Choose from: ${APPS.join(', ')}`);
  if (git(['-C', app, 'status', '--porcelain'])) {
    console.error(`! ${app}: has uncommitted changes; commit them in ${app}/ first (skipped)`);
    continue;
  }
  git(['fetch', '-q', `./${app}`, 'HEAD']);
  const head = git(['rev-parse', '--short', 'FETCH_HEAD']);
  git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', app]);
  git(['read-tree', `--prefix=${app}/`, 'FETCH_HEAD']);
  const drop = git(['ls-files', app]).split('\n').filter((f) => EXCLUDE.test(f));
  for (let i = 0; i < drop.length; i += 200) git(['rm', '-q', '--cached', ...drop.slice(i, i + 200)]);
  console.log(`✓ ${app} @ ${head}: ${git(['ls-files', app]).split('\n').length} files staged${drop.length ? ` (${drop.length} secret/build files skipped)` : ''}`);
}
