/**
 * API hardening regressions: root/health endpoints, malformed bodies, CORS
 * status codes, minimal login response, revoked admin access, rate-limiter
 * separation, and query validation on admin/public list endpoints.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, createUser, login, prisma, startApi, staff, type Api } from './helpers';
import * as limits from '../src/middleware/rateLimit.middleware';
import { env } from '../src/config/env';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../src/middleware/error.middleware';
import { corsAllowList } from '../src/app';

let api: Api;
let admin: Client;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  await prisma.contactLead.createMany({
    data: [
      { name: 'Lead New', email: 'new@example.test', message: 'Hello there, new lead', status: 'NEW' },
      { name: 'Lead Closed', email: 'closed@example.test', message: 'Hello there, closed lead', status: 'CLOSED' },
    ],
  });
  await prisma.fAQ.create({ data: { question: 'Q?', answer: 'A.', category: 'training' } });
});
after(() => api.close());

const raw = (path: string, init: RequestInit = {}) => fetch(api.base + path, init);

// ---- Root & health ---------------------------------------------------------

test('GET / returns a small API descriptor (not a 404)', async () => {
  const res = await raw('/');
  const body = (await res.json()) as { success: boolean; data: Record<string, string> };
  assert.equal(res.status, 200);
  assert.equal(body.data.health, '/health');
  assert.equal(body.data.apiBase, '/api');
});

test('GET /health checks the database; /health/live does not', async () => {
  const res = await raw('/health');
  const body = (await res.json()) as { success: boolean; data: { status: string; database: string; schema: string; pendingMigrations: number } };
  assert.equal(res.status, 200);
  assert.equal(body.data.database, 'up');
  assert.equal(body.data.schema, 'current');
  assert.equal(body.data.pendingMigrations, 0);
  assert.equal(body.data.status, 'ok');
  assert.doesNotMatch(JSON.stringify(body), /postgres|password|DATABASE_URL/i);
  const live = await raw('/health/live');
  assert.equal(live.status, 200);
});

// Regression (2026-10-17): Supabase was reachable but 3 migrations behind; /health said
// "healthy" while services/blog/portfolio/settings returned 503 "Service temporarily unavailable".
test('GET /health is 503 when the database is reachable but migrations are pending', async () => {
  const [latest] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1`;
  await prisma.$executeRaw`UPDATE _prisma_migrations SET rolled_back_at = now() WHERE id = ${latest.id}`;
  try {
    const res = await raw('/health');
    const body = (await res.json()) as { success: boolean; message: string; data: { status: string; database: string; schema: string; pendingMigrations: number } };
    assert.equal(res.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.data.database, 'up');
    assert.equal(body.data.schema, 'behind');
    assert.equal(body.data.pendingMigrations, 1);
    assert.match(body.message, /schema is out of date/);
    assert.doesNotMatch(JSON.stringify(body), /\d{14}_/); // migration names stay in server logs
  } finally {
    await prisma.$executeRaw`UPDATE _prisma_migrations SET rolled_back_at = NULL WHERE id = ${latest.id}`;
  }
});

test('missing column/table (P2022/P2021) -> 503 with a safe message, never 200 or internals', async () => {
  await prisma.$executeRawUnsafe('ALTER TABLE services RENAME COLUMN "heroVariant" TO "heroVariant_hidden"');
  try {
    const res = await raw('/api/services');
    const body = (await res.json()) as { success: boolean; message: string };
    assert.equal(res.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.message, 'Service temporarily unavailable. Please try again shortly.');
    assert.doesNotMatch(JSON.stringify(body), /heroVariant|services\.|prisma/i);
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE services RENAME COLUMN "heroVariant_hidden" TO "heroVariant"');
  }
  const after = await raw('/api/services');
  assert.equal(after.status, 200);
});

test('transaction timeout / write conflict (P2028/P2034) -> 503 retryable, not a 400 client error', () => {
  for (const code of ['P2028', 'P2034']) {
    let status = 0;
    let sent: { message?: string } = {};
    const res = { status: (s: number) => ((status = s), res), json: (b: typeof sent) => ((sent = b), res) } as unknown as Response;
    const err = new Prisma.PrismaClientKnownRequestError('Transaction already closed', { code, clientVersion: Prisma.prismaVersion.client });
    errorHandler(err, {} as Request, res, () => {});
    assert.equal(status, 503, code);
    assert.equal(sent.message, 'Service temporarily unavailable. Please try again shortly.');
  }
});

// ---- Body parsing & CORS -----------------------------------------------------

test('malformed JSON -> 400 (not 500), oversized body -> 413', async () => {
  const bad = await raw('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
  const body = (await bad.json()) as { message: string };
  assert.equal(bad.status, 400);
  assert.equal(body.message, 'Malformed JSON request body');
  const big = await raw('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(1_100_000) }) });
  assert.equal(big.status, 413);
});

test('CORS: rejected origin -> 403 (not 500); allowed origin gets CORS headers', async () => {
  const evil = await raw('/api/services', { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const ok = await raw('/health/live', { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
});

test('CORS allow-list: an apex origin also allows its www. origin, nothing broader', () => {
  const list = corsAllowList('https://globalantic.com, https://training.globalantic.com,https://admin.globalantic.com/');
  assert.deepEqual(list.sort(), [
    'https://admin.globalantic.com',
    'https://globalantic.com',
    'https://training.globalantic.com',
    'https://www.globalantic.com',
  ]);
  // Subdomain and localhost origins are kept exactly, with no derived variants.
  assert.deepEqual(corsAllowList('http://localhost:3000'), ['http://localhost:3000']);
  assert.ok(!list.includes('https://www.training.globalantic.com'));
  assert.ok(!list.includes('https://evil.globalantic.com'));
});

// ---- Login response & cookie ------------------------------------------------

test('login returns only safe user fields and no token in the body', async () => {
  const u = await createUser('ADMIN');
  const c = new Client(api.base);
  const r = await c.post('/api/auth/login', { email: u.email, password: PASSWORD });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.data).sort(), ['user']);
  assert.deepEqual(Object.keys(r.body.data.user).sort(), ['email', 'emailVerified', 'id', 'name', 'role']);
  assert.doesNotMatch(JSON.stringify(r.body), /passwordHash|token|\$2[aby]\$/);
  // The httpOnly cookie still carries the session
  assert.equal((await c.get('/api/auth/me')).status, 200);
});

test('cookie SameSite defaults to lax (configurable via COOKIE_SAMESITE)', () => {
  assert.equal(env.cookieSameSite, 'lax');
});

// ---- Revoked admin access ---------------------------------------------------

test('deactivated, soft-deleted and deleted admins lose access immediately', async () => {
  for (const change of ['suspend', 'softDelete', 'hardDelete'] as const) {
    const u = await createUser('ADMIN');
    const c = await login(api.base, u.email);
    assert.equal((await c.get('/api/admin/dashboard')).status, 200, change);
    if (change === 'suspend') await prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    if (change === 'softDelete') await prisma.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
    if (change === 'hardDelete') await prisma.user.delete({ where: { id: u.id } });
    assert.equal((await c.get('/api/admin/dashboard')).status, 401, change);
    assert.equal((await c.get('/api/admin/contacts')).status, 401, change);
    // ...and cannot sign in again
    const again = await new Client(api.base).post('/api/auth/login', { email: u.email, password: PASSWORD });
    assert.ok([401, 403].includes(again.status), `${change}: ${again.status}`);
  }
});

test('demoted admin (role changed) loses CMS access on the next request', async () => {
  const u = await createUser('ADMIN');
  const c = await login(api.base, u.email);
  await prisma.user.update({ where: { id: u.id }, data: { role: 'EDITOR' } });
  assert.equal((await c.get('/api/admin/contacts')).status, 403);
});

// ---- Rate limiters --------------------------------------------------------

test('login, auth flows, public forms and lookups use separate limiter instances', () => {
  const instances = [limits.loginLimiter, limits.loginAccountLimiter, limits.authFlowLimiter, limits.formLimiter, limits.lookupLimiter, limits.apiLimiter];
  assert.equal(new Set(instances).size, instances.length);
});

test('global API limit: signed-in callers are counted per session (not per shared office IP); anonymous per IP', () => {
  const req = (cookies: Record<string, string>, ip = '203.0.113.7', authorization?: string) => ({ cookies, ip, headers: authorization ? { authorization } : {} }) as unknown as Parameters<typeof limits.apiClientKey>[0];
  const a = limits.apiClientKey(req({ globalantic_token: 'token-a' }));
  const b = limits.apiClientKey(req({ globalantic_token: 'token-b' }));
  assert.match(a, /^session:[0-9a-f]{32}$/);
  assert.notEqual(a, b, 'two staff on one IP get separate budgets');
  assert.ok(!a.includes('token-a'), 'the raw token is never used as a key');
  assert.equal(limits.apiClientKey(req({}, '203.0.113.7', 'Bearer token-a')), a);
  assert.equal(limits.apiClientKey(req({})), 'ip:203.0.113.7');
  assert.notEqual(limits.apiIpBackstop, limits.apiLimiter);
});

test('per-account login limiter still blocks after 10 attempts', async () => {
  const u = await createUser('ADMIN');
  const c = new Client(api.base);
  let last = 0;
  for (let i = 0; i < 11; i += 1) last = (await c.post('/api/auth/login', { email: u.email, password: 'Wrong-pass-1' })).status;
  assert.equal(last, 429);
  // A different account from the same client is unaffected
  const other = await createUser('ADMIN');
  assert.equal((await c.post('/api/auth/login', { email: other.email, password: PASSWORD })).status, 200);
});

// ---- Admin list validation -------------------------------------------------

for (const path of ['/api/admin/contacts', '/api/admin/training', '/api/admin/careers']) {
  test(`${path}: valid / empty / unknown filters keep working`, async () => {
    for (const q of ['', '?search=', '?status=', '?search=lead', '?unknownFilter=x&page=abc', '?search=%27%3B%20DROP%20TABLE']) {
      const r = await admin.get(path + q);
      assert.equal(r.status, 200, `${path}${q}`);
      assert.ok(Array.isArray(r.body.data));
    }
  });

  test(`${path}: invalid input -> 422 with field errors`, async () => {
    for (const q of ['?status=NOT_A_STATUS', '?status=new', '?status=NEW&status=CLOSED', '?search=a&search=b', `?search=${'x'.repeat(201)}`, '?status[foo]=bar']) {
      const r = await admin.get(path + q);
      assert.equal(r.status, 422, `${path}${q}`);
      assert.equal(r.body.message, 'Validation failed');
      assert.doesNotMatch(JSON.stringify(r.body), /prisma|invocation|\.ts:/i);
    }
  });
}

test('contacts status filter still filters (behaviour preserved)', async () => {
  const r = await admin.get('/api/admin/contacts?status=CLOSED');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.length >= 1);
  assert.ok(r.body.data.every((c: { status: string }) => c.status === 'CLOSED'));
});

test('non-admin staff and anonymous users cannot list leads', async () => {
  const finance = (await staff(api.base, 'FINANCE')).client;
  assert.equal((await finance.get('/api/admin/contacts')).status, 403);
  assert.equal((await new Client(api.base).get('/api/admin/contacts')).status, 401);
});

// ---- Public list validation ------------------------------------------------

test('public FAQ filter: valid works, repeated/oversized category -> 422 (was a Prisma 500)', async () => {
  const anon = new Client(api.base);
  const ok = await anon.get('/api/faqs?category=training');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.length, 1);
  assert.equal((await anon.get('/api/faqs')).status, 200);
  assert.equal((await anon.get('/api/faqs?category=a&category=b')).status, 422);
  assert.equal((await anon.get(`/api/faqs?category=${'x'.repeat(61)}`)).status, 422);
});
