#!/usr/bin/env node
/**
 * Starts the local API (with its own local database) and the web apps together, each on its
 * fixed port, with prefixed output. Ctrl+C stops everything.
 *
 *   npm run dev:local                       # API + all six apps
 *   npm run dev:local -- admin employee     # API + only the named apps
 *   npm run dev:local -- --seed             # also load the [DEMO] data (first run)
 *
 * Ports: API 4000 · frontend 3000 · training 3001 · intern 3002 · employee 3003 · admin 3004 · trainer 3005
 * The API runs through `backend` → `npm run dev:local` (never the production database).
 */
import { spawn } from 'node:child_process';

const APPS = { frontend: 3000, training: 3001, intern: 3002, employee: 3003, admin: 3004, trainer: 3005 };
const COLORS = [36, 33, 35, 32, 34, 91, 96];

const args = process.argv.slice(2);
const seed = args.includes('--seed');
const picked = args.filter((a) => !a.startsWith('--'));
const unknown = picked.filter((a) => !(a in APPS));
if (unknown.length) {
  console.error(`Unknown app(s): ${unknown.join(', ')}. Choose from: ${Object.keys(APPS).join(', ')}`);
  process.exit(1);
}
const apps = picked.length ? picked : Object.keys(APPS);

const children = [];
function run(name, command, color) {
  const child = spawn(command, { shell: true, env: process.env });
  const tag = `\x1b[${color}m${name.padEnd(9)}\x1b[0m│ `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(tag + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => process.stdout.write(`${tag}exited with code ${code}\n`));
  children.push(child);
}

run('api', `npm --workspace backend run dev:local --${seed ? ' --seed' : ''}`, COLORS[0]);
apps.forEach((app, i) => run(app, `npm --workspace ${app} run dev`, COLORS[(i + 1) % COLORS.length]));

console.log(`Starting API (http://localhost:4000) and: ${apps.map((a) => `${a} (http://localhost:${APPS[a]})`).join(', ')}`);

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // Windows: kill the whole process tree (npm -> node -> next).
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
