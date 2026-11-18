/** Platform administration: users, roles (escalation guards), reports. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, createUser, login, prisma, startApi, staff, type Api } from './helpers';

let api: Api;
let admin: Client;
let adminId: string;

before(async () => {
  api = await startApi();
  const a = await staff(api.base, 'ADMIN');
  admin = a.client;
  adminId = a.user.id;
});
after(() => api.close());

test('users list and roles matrix require users.manage', async () => {
  const r = await admin.get('/api/platform/users?role=ADMIN');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.items.every((u: { role: string }) => u.role === 'ADMIN'));
  assert.ok(!JSON.stringify(r.body.data).includes('passwordHash'));
  assert.equal((await admin.get('/api/platform/users?role=GOD')).status, 422);
  const roles = await admin.get('/api/platform/roles');
  assert.ok(roles.body.data.some((x: { role: string; assignable: boolean }) => x.role === 'ADMIN' && !x.assignable));
  for (const role of ['FINANCE', 'HR', 'EDITOR', 'TRAINER', 'EMPLOYEE', 'STUDENT'] as const) {
    const c = (await staff(api.base, role)).client;
    assert.equal((await c.get('/api/platform/users')).status, 403, role);
  }
});

test('role changes: audited, sessions revoked, escalation blocked', async () => {
  const u = await createUser('TRAINER');
  const c = await login(api.base, u.email);
  assert.equal((await admin.patch(`/api/platform/users/${u.id}/role`, { role: 'FINANCE' })).status, 422, 'reason required');
  const ok = await admin.patch(`/api/platform/users/${u.id}/role`, { role: 'FINANCE', reason: 'Moved to accounts' });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401, 'sessions revoked');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'user.role_changed', entityId: u.id, reason: 'Moved to accounts' } }));

  assert.equal((await admin.patch(`/api/platform/users/${u.id}/role`, { role: 'ADMIN', reason: 'promote' })).status, 403, 'ADMIN only grantable by a Super Admin');
  assert.equal((await admin.patch(`/api/platform/users/${adminId}/role`, { role: 'EDITOR', reason: 'self' })).status, 403);
  const otherAdmin = await createUser('ADMIN');
  assert.equal((await admin.patch(`/api/platform/users/${otherAdmin.id}/role`, { role: 'EDITOR', reason: 'demote' })).status, 403);
  const student = await createUser('STUDENT');
  assert.equal((await admin.patch(`/api/platform/users/${student.id}/role`, { role: 'TRAINER', reason: 'convert' })).status, 409);
});

test('summary report: ADMIN and FINANCE only, aggregates without personal data', async () => {
  const r = await admin.get('/api/platform/reports/summary');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const k of ['admissions', 'enrollmentsByCourse', 'revenueByMonth', 'attendanceByBatch', 'referralRewards', 'leads', 'employeesByDepartment', 'leaveRequests']) {
    assert.ok(k in r.body.data, k);
  }
  assert.doesNotMatch(JSON.stringify(r.body.data), /@example\.test/);
  const finance = (await staff(api.base, 'FINANCE')).client;
  assert.equal((await finance.get('/api/platform/reports/summary')).status, 200);
  const hr = (await staff(api.base, 'HR')).client;
  assert.equal((await hr.get('/api/platform/reports/summary')).status, 403);
});
