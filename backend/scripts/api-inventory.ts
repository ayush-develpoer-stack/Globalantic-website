/**
 * Lists every endpoint actually registered on the Express app (not what docs claim).
 *
 *   npx tsx scripts/api-inventory.ts [out.json] [coverage.log] [out.md]
 *
 * Walks createApp()'s router stack, reads the access rule from requireAuth/requireAdmin/
 * requirePermission metadata and request fields from validate() metadata, and maps each
 * router back to its file in src/routes. With a coverage log (written by the test suite
 * when API_COVERAGE_FILE is set) it also reports which routes the tests exercised.
 * Needs no database: nothing is queried.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app';
import { requireAuth, requireAdmin } from '../src/middleware/auth.middleware';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Layer = { route?: any; handle: any; regexp: RegExp & { fast_slash?: boolean }; name: string };

export interface Endpoint {
  method: string;
  path: string;
  file: string;
  line: number | null;
  auth: 'public' | 'session' | 'secret';
  access: string;
  validates: string[];
}

const ROUTES_DIR = path.resolve(__dirname, '../src/routes');

// Router object -> route file, by comparing each route module's exports with mounted routers.
const routerFile = new Map<unknown, string>();
for (const f of fs.readdirSync(ROUTES_DIR).filter((n) => n.endsWith('.ts'))) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(path.join(ROUTES_DIR, f));
  for (const v of Object.values(mod)) if (typeof v === 'function' && Array.isArray((v as any).stack)) routerFile.set(v, f);
}
const sources = new Map<string, string[]>();
const fileLines = (f: string) => {
  if (!sources.has(f)) sources.set(f, fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8').split('\n'));
  return sources.get(f)!;
};

function mountPath(layer: Layer): string {
  if (layer.regexp.fast_slash) return '';
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/')
    .replace(/\\\./g, '.');
}

function zodFields(schema: any): string[] {
  let s = schema;
  while (s?._def?.schema) s = s._def.schema; // unwrap ZodEffects (refine/transform)
  const shape = typeof s?._def?.shape === 'function' ? s._def.shape() : s?.shape;
  if (!shape) return [];
  return Object.entries(shape).map(([k, v]: [string, any]) => (v?.isOptional?.() ? `${k}?` : k));
}

/** Locates `.<method>(` followed by the path literal (same or next line) in the route file. */
function findLine(file: string, method: string, routePath: string): number | null {
  const lines = fileLines(file);
  const lit = new RegExp(`['"\`]${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`\\.${method}\\(`).test(lines[i])) continue;
    if (lit.test(lines[i]) || lit.test(lines[i + 1] ?? '')) return i + 1;
  }
  return null;
}

// Routes guarded by a shared secret in the handler rather than by a session.
const SECRET_ROUTES: Record<string, string> = {
  'POST /api/payments/razorpay/webhook': 'Razorpay HMAC signature (RAZORPAY_WEBHOOK_SECRET)',
  'POST /api/crm/reminders/dispatch': 'x-cron-secret header (CRON_SECRET); 404 otherwise',
  'POST /api/notifications/dispatch': 'x-cron-secret header (CRON_SECRET); 404 otherwise',
};

function describe(chain: any[]): { session: boolean; access: string[]; validates: string[] } {
  const access: string[] = [];
  const validates: string[] = [];
  let session = false;
  for (const fn of chain) {
    if (fn === requireAuth) session = true;
    else if (fn === requireAdmin) access.push('role ADMIN');
    else if (Array.isArray(fn?.permissions)) access.push(`${fn.mode === 'any' ? 'any of' : ''} ${fn.permissions.join(fn.mode === 'any' ? ' | ' : ' + ')}`.trim());
    else if (fn?.schema && fn?.source) validates.push(`${fn.source}{${zodFields(fn.schema).join(', ')}}`);
  }
  return { session, access, validates };
}

function walk(stack: Layer[], prefix: string, inherited: any[], file: string, out: Endpoint[]) {
  const routerLevel: any[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      const chain = [...inherited, ...routerLevel, ...layer.route.stack.map((l: Layer) => l.handle)];
      const d = describe(chain);
      for (const m of methods) {
        const full = `${prefix}${layer.route.path === '/' && prefix ? '' : layer.route.path}` || '/';
        const key = `${m.toUpperCase()} ${full}`;
        out.push({
          method: m.toUpperCase(),
          path: full,
          file,
          line: file === 'app.ts' ? null : findLine(file, m, layer.route.path),
          auth: SECRET_ROUTES[key] ? 'secret' : d.session ? 'session' : 'public',
          access: SECRET_ROUTES[key] ?? (d.access.length ? d.access.join('; ') : d.session ? 'any signed-in user (checks in handler/service)' : '—'),
          validates: d.validates,
        });
      }
    } else if (Array.isArray(layer.handle?.stack)) {
      walk(layer.handle.stack, prefix + mountPath(layer), [...inherited, ...routerLevel], routerFile.get(layer.handle) ?? file, out);
    } else if (mountPath(layer) === '') {
      routerLevel.push(layer.handle); // router.use(mw): applies to the routes after it
    }
  }
}

export function inventory(): Endpoint[] {
  const app: any = createApp();
  const out: Endpoint[] = [];
  walk(app._router.stack, '', [], 'app.ts', out);
  return out;
}

/** Turns a recorded concrete route key into the inventory key (they are identical patterns). */
function loadCoverage(file: string) {
  const hits = new Map<string, Set<number>>();
  const unmatched = new Set<string>();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const [method, route, status] = line.split('\t');
    if (route === '-') {
      unmatched.add(`${method} ${status}`);
      continue;
    }
    const key = `${method} ${route}`;
    if (!hits.has(key)) hits.set(key, new Set());
    hits.get(key)!.add(Number(status));
  }
  return { hits, unmatched };
}

if (require.main === module) {
  const [jsonOut, coverageFile, mdOut] = process.argv.slice(2);
  const eps = inventory();
  const byMethod = eps.reduce<Record<string, number>>((a, e) => ((a[e.method] = (a[e.method] ?? 0) + 1), a), {});
  console.log(`registered endpoints: ${eps.length}`, byMethod);
  const cov = coverageFile && fs.existsSync(coverageFile) ? loadCoverage(coverageFile) : null;
  const rows = eps.map((e) => {
    const statuses = cov ? [...(cov.hits.get(`${e.method} ${e.path}`) ?? [])].sort() : [];
    return { ...e, statuses, success: statuses.some((s) => s >= 200 && s < 300), exercised: statuses.length > 0 };
  });
  if (cov) {
    const exercised = rows.filter((r) => r.exercised).length;
    const success = rows.filter((r) => r.success).length;
    console.log(`exercised by tests: ${exercised}; with a 2xx: ${success}; never called: ${rows.length - exercised}`);
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
  if (mdOut) {
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = r.path.split('/').slice(0, r.path.startsWith('/api/') ? 3 : 2).join('/') || '/';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    }
    const md: string[] = [];
    for (const [g, list] of groups) {
      md.push(`### \`${g}\` (${list.length})`, '', '| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |', '|---|---|---|---|---|---|---|');
      for (const r of list) {
        md.push(
          `| ${r.method} | \`${r.path}\` | ${r.auth} | ${r.access} | ${r.validates.join('<br>').replace(/\|/g, '\\|') || '—'} | ${r.file}${r.line ? `:${r.line}` : ''} | ${cov ? (r.exercised ? r.statuses.join(', ') : '**not tested**') : 'n/a'} |`,
        );
      }
      md.push('');
    }
    fs.writeFileSync(mdOut, md.join('\n'));
  }
  if (cov?.unmatched.size) console.log(`requests that matched no route (404 by design or typos): ${cov.unmatched.size}`);
}
