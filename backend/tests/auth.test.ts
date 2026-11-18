/** Authentication, sessions, registration privacy and route protection. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, createUser, login, phone, prisma, registerStudent, startApi, staff, testOutbox, tokenFromOutbox, uniq, type Api } from './helpers';
import { canonicalEmail, normalizePhone } from '../src/lib/identity';

let api: Api;
before(async () => {
  api = await startApi();
});
after(() => api.close());

test('identity normalisation (duplicate / alias detection)', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizePhone('09876543210'), '919876543210');
  assert.equal(normalizePhone('9876543210'), '919876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(canonicalEmail('A.B+promo@GMail.com'), 'ab@gmail.com');
  assert.equal(canonicalEmail('a.b+x@example.com'), 'a.b@example.com');
});

test('unauthenticated access to every private area is blocked', async () => {
  const anon = new Client(api.base);
  for (const p of ['/api/auth/me', '/api/training/student/dashboard', '/api/training/trainer/dashboard', '/api/training/admin/dashboard', '/api/training/admin/payments', '/api/admin/dashboard']) {
    const r = await anon.get(p);
    assert.equal(r.status, 401, p);
  }
});

test('forged / tampered tokens are rejected', async () => {
  const jwt = await import('jsonwebtoken');
  const anon = new Client(api.base);
  const forged = jwt.default.sign({ sub: 'x', email: 'x@y.z', role: 'ADMIN', sid: 'nope' }, 'wrong-secret');
  const r1 = await anon.req('GET', '/api/training/admin/dashboard', undefined, { Authorization: `Bearer ${forged}` });
  assert.equal(r1.status, 401);
  // Correctly signed, but pointing at a session that does not exist
  const signedNoSession = jwt.default.sign({ sub: 'x', email: 'x@y.z', role: 'ADMIN', sid: '00000000-0000-4000-8000-000000000000' }, process.env.JWT_SECRET!);
  const r2 = await anon.req('GET', '/api/training/admin/dashboard', undefined, { Authorization: `Bearer ${signedNoSession}` });
  assert.equal(r2.status, 401);
});

test('registration does not reveal whether an email or phone is already registered', async () => {
  const { email, phone: ph } = await registerStudent(api.base);
  const anon = new Client(api.base);
  const fresh = await anon.post('/api/auth/register', { fullName: 'New Person', email: `${uniq('n')}@example.test`, phone: phone(), password: PASSWORD, consent: true });
  const dupEmail = await anon.post('/api/auth/register', { fullName: 'Dup Email', email, phone: phone(), password: PASSWORD, consent: true });
  const dupPhone = await anon.post('/api/auth/register', { fullName: 'Dup Phone', email: `${uniq('p')}@example.test`, phone: `+91 ${ph}`, password: PASSWORD, consent: true });
  const alias = await anon.post('/api/auth/register', {
    fullName: 'Alias',
    email: email.replace('@', '+alias@'),
    phone: phone(),
    password: PASSWORD,
    consent: true,
  });
  for (const r of [dupEmail, dupPhone, alias]) {
    assert.equal(r.status, fresh.status);
    assert.equal(r.body.message, fresh.body.message);
  }
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  assert.equal(await prisma.user.count({ where: { phone: `91${ph}` } }), 1, 'duplicate phone must not create an account');
  assert.equal(await prisma.user.count({ where: { email: email.replace('@', '+alias@') } }), 0, 'alias of an existing mailbox must not create an account');
  // The real owner is told by email instead.
  assert.ok(testOutbox.some((m) => m.to === email && /already have an account/i.test(m.html)));
});

test('registration validates input and requires consent', async () => {
  const anon = new Client(api.base);
  const r = await anon.post('/api/auth/register', { fullName: 'X', email: 'not-an-email', phone: '12', password: 'short', consent: false });
  assert.equal(r.status, 422);
  const fields = (r.body.errors ?? []).map((e) => e.field);
  for (const f of ['email', 'password', 'consent']) assert.ok(fields.includes(f), `missing error for ${f}`);
});

test('verification links are single-use; unverified students cannot apply', async () => {
  const email = `${uniq('unv')}@example.test`;
  const anon = new Client(api.base);
  await anon.post('/api/auth/register', { fullName: 'Unverified', email, phone: phone(), password: PASSWORD, consent: true });
  const c = await login(api.base, email);
  const apply = await c.post('/api/training/student/applications', { batchId: '00000000-0000-4000-8000-000000000000', qualification: 'BSc' });
  assert.equal(apply.status, 403);
  const token = tokenFromOutbox(email, 'verify-email');
  assert.equal((await anon.post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await anon.post('/api/auth/verify-email', { token })).status, 400, 'token replay must fail');
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.data.user.emailVerified, true);
});

test('login errors are generic and the session cookie is httpOnly', async () => {
  const u = await createUser('STUDENT');
  const anon = new Client(api.base);
  const wrongPw = await anon.post('/api/auth/login', { email: u.email, password: 'Wrong-pass-1' });
  const noUser = await anon.post('/api/auth/login', { email: `${uniq('ghost')}@example.test`, password: 'Wrong-pass-1' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.body.message, noUser.body.message);

  const res = await fetch(`${api.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: PASSWORD }) });
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('logout revokes the server-side session (a copied token stops working)', async () => {
  const u = await createUser('STUDENT');
  const c = await login(api.base, u.email);
  const stolen = new Client(api.base);
  stolen.cookie = c.cookie;
  assert.equal((await stolen.get('/api/auth/me')).status, 200);
  await c.post('/api/auth/logout');
  assert.equal((await stolen.get('/api/auth/me')).status, 401);
});

test('suspending an account revokes its sessions; reactivation allows login again', async () => {
  const { client: admin } = await staff(api.base, 'ADMIN');
  const u = await createUser('STUDENT');
  const c = await login(api.base, u.email);
  const s = await admin.patch(`/api/training/admin/users/${u.id}/status`, { status: 'SUSPENDED', reason: 'Policy violation test' });
  assert.equal(s.status, 200);
  assert.equal((await c.get('/api/training/student/dashboard')).status, 401);
  const again = await new Client(api.base).post('/api/auth/login', { email: u.email, password: PASSWORD });
  assert.equal(again.status, 403);
  await admin.patch(`/api/training/admin/users/${u.id}/status`, { status: 'ACTIVE', reason: 'Resolved' });
  assert.equal((await new Client(api.base).post('/api/auth/login', { email: u.email, password: PASSWORD })).status, 200);
  const logs = await prisma.auditLog.findMany({ where: { entityId: u.id, action: { in: ['user.suspended', 'user.reactivated'] } } });
  assert.equal(logs.length, 2);
});

test('password reset: generic response, single-use token, revokes sessions', async () => {
  const u = await createUser('STUDENT');
  const c = await login(api.base, u.email);
  const anon = new Client(api.base);
  const known = await anon.post('/api/auth/forgot-password', { email: u.email });
  const unknown = await anon.post('/api/auth/forgot-password', { email: `${uniq('nobody')}@example.test` });
  assert.equal(known.status, 200);
  assert.equal(known.body.message, unknown.body.message);
  // The reset email is sent after the response (constant response time for known/unknown emails).
  for (let i = 0; i < 100 && !testOutbox.some((m) => m.to === u.email && m.html.includes('/reset-password?token=')); i++) await new Promise((r) => setTimeout(r, 50));
  const token = tokenFromOutbox(u.email, 'reset-password');
  assert.equal((await anon.post('/api/auth/reset-password', { token, password: 'NewPassw0rd' })).status, 200);
  assert.equal((await anon.post('/api/auth/reset-password', { token, password: 'NewPassw0rd2' })).status, 400);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'old sessions must be revoked');
  await login(api.base, u.email, 'NewPassw0rd');
});

test('role changes apply immediately (role is read from the DB, not the token)', async () => {
  const u = await createUser('ADMIN');
  const c = await login(api.base, u.email);
  assert.equal((await c.get('/api/training/admin/courses')).status, 200);
  await prisma.user.update({ where: { id: u.id }, data: { role: 'STUDENT' } });
  assert.equal((await c.get('/api/training/admin/courses')).status, 403);
});
