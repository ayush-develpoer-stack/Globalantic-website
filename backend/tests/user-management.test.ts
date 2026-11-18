/**
 * Admin user management: creating every account type, Super Admin rules for ADMIN
 * accounts, status changes, and that each new account reaches only its own portal.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, createUser, login, prisma, staff, tokenFromOutbox, uniq, phone, type Api, startApi } from './helpers';
import { SUPER_ADMIN_PERMISSION, effectivePermissions } from '../src/lib/permissions';
import { cookieDomainFor } from '../src/controllers/auth.controller';
import { EXPIRY_PREFIX, expiryMarker } from '../src/lib/access-expiry';

let api: Api;
let admin: Client;
let superAdmin: Client;
let superAdminId: string;
let hr: Client;
let editor: Client;

const NEW_PASSWORD = 'N3wAccount!pass';

async function grantSuper(userId: string) {
  await prisma.userPermissionGrant.create({ data: { userId, permission: SUPER_ADMIN_PERMISSION, grantedById: userId } });
}

/** Completes the emailed set-password link and signs in with the new password. */
async function activate(email: string): Promise<Client> {
  const token = tokenFromOutbox(email, 'reset-password');
  const r = await new Client(api.base).req('POST', '/api/auth/reset-password', { token, password: NEW_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return login(api.base, email, NEW_PASSWORD);
}

const employeeDetails = { department: 'Engineering', designation: 'Developer', employmentType: 'FULL_TIME', joiningDate: '2026-11-01' };

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  const s = await staff(api.base, 'ADMIN');
  superAdminId = s.user.id;
  await grantSuper(superAdminId);
  superAdmin = await login(api.base, s.user.email);
  hr = (await staff(api.base, 'HR')).client;
  editor = (await staff(api.base, 'EDITOR')).client;
});
after(() => api.close());

test('static: Super Admin is only honoured on an ADMIN account and is not part of any role', () => {
  assert.equal(effectivePermissions('ADMIN', []).includes(SUPER_ADMIN_PERMISSION), false);
  assert.equal(effectivePermissions('ADMIN', [SUPER_ADMIN_PERMISSION]).includes(SUPER_ADMIN_PERMISSION), true);
  for (const role of ['HR', 'EDITOR', 'FINANCE', 'SALES', 'EMPLOYEE', 'TRAINER', 'STUDENT']) {
    assert.equal(effectivePermissions(role, [SUPER_ADMIN_PERMISSION]).includes(SUPER_ADMIN_PERMISSION), false, role);
  }
});

test('cookie Domain is only sent when the request host is inside COOKIE_DOMAIN', () => {
  assert.equal(cookieDomainFor('api.globalantic.com', '.globalantic.com'), '.globalantic.com');
  assert.equal(cookieDomainFor('globalantic.com', '.globalantic.com'), '.globalantic.com');
  assert.equal(cookieDomainFor('localhost', '.globalantic.com'), undefined);
  assert.equal(cookieDomainFor('127.0.0.1', '.globalantic.com'), undefined);
  assert.equal(cookieDomainFor('evilglobalantic.com', '.globalantic.com'), undefined);
  assert.equal(cookieDomainFor('api.globalantic.com', undefined), undefined);
});

test('the roles endpoint tells each caller which roles they may create', async () => {
  const pick = async (c: Client) => {
    const r = await c.req('GET', '/api/platform/roles');
    assert.equal(r.status, 200);
    return (r.body.data as { role: string; creatable: boolean }[]).filter((x) => x.creatable).map((x) => x.role).sort();
  };
  assert.deepEqual(await pick(admin), ['EDITOR', 'EMPLOYEE', 'FINANCE', 'HR', 'SALES', 'STUDENT', 'TRAINER']);
  assert.deepEqual(await pick(superAdmin), ['ADMIN', 'EDITOR', 'EMPLOYEE', 'FINANCE', 'HR', 'SALES', 'STUDENT', 'TRAINER']);
  assert.deepEqual(await pick(hr), ['EMPLOYEE']);
  assert.equal((await editor.req('GET', '/api/platform/roles')).status, 403);
});

test('admin creates employee, intern and trainer accounts that each reach only their own portal', async () => {
  const mk = async (role: string, extra: Record<string, unknown> = {}) => {
    const email = `${uniq(role.toLowerCase())}@example.test`;
    const r = await admin.req('POST', '/api/platform/users', { name: `New ${role}`, email, phone: phone(), role, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.role, role);
    assert.equal(r.body.data.email, email);
    assert.equal(r.body.data.passwordHash, undefined);
    assert.equal(typeof r.body.data.portalUrl, 'string');
    return { id: r.body.data.id as string, email };
  };
  const emp = await mk('EMPLOYEE', { employee: employeeDetails });
  const intern = await mk('STUDENT', { student: { institution: 'Test College', city: 'Bhopal' } });
  const trainer = await mk('TRAINER');

  // Stored in the database with the right profile rows; password is unusable until set.
  const empRow = await prisma.user.findUniqueOrThrow({ where: { id: emp.id }, include: { employeeProfile: true } });
  assert.equal(empRow.employeeProfile?.department, 'Engineering');
  const internRow = await prisma.user.findUniqueOrThrow({ where: { id: intern.id }, include: { studentProfile: true } });
  assert.equal(internRow.studentProfile?.institution, 'Test College');
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: emp.email, password: NEW_PASSWORD })).status, 401);

  const empC = await activate(emp.email);
  const internC = await activate(intern.email);
  const trainerC = await activate(trainer.email);

  assert.equal((await empC.req('GET', '/api/auth/me')).body.data.user.role, 'EMPLOYEE');
  assert.equal((await empC.req('GET', '/api/employee/profile')).status, 200);
  assert.equal((await internC.req('GET', '/api/training/student/profile')).status, 200);
  assert.equal((await trainerC.req('GET', '/api/training/trainer/dashboard')).status, 200);

  // Cross-portal access is denied.
  assert.equal((await internC.req('GET', '/api/employee/profile')).status, 403);
  assert.equal((await empC.req('GET', '/api/training/student/profile')).status, 403);
  assert.equal((await trainerC.req('GET', '/api/employee/profile')).status, 403);
  for (const c of [empC, internC, trainerC]) {
    assert.equal((await c.req('GET', '/api/platform/users')).status, 403);
    assert.equal((await c.req('POST', '/api/platform/users', { name: 'Nope', email: `${uniq('x')}@example.test`, role: 'ADMIN' })).status, 403);
  }

  // Logout ends the session.
  assert.equal((await empC.req('POST', '/api/auth/logout')).status, 200);
  assert.equal((await empC.req('GET', '/api/auth/me')).status, 401);
});

test('staff roles (HR, editor, finance, sales) can be created; validation and duplicates are rejected', async () => {
  for (const role of ['HR', 'EDITOR', 'FINANCE', 'SALES']) {
    const r = await admin.req('POST', '/api/platform/users', { name: `Staff ${role}`, email: `${uniq(role.toLowerCase())}@example.test`, role });
    assert.equal(r.status, 201, `${role} ${JSON.stringify(r.body)}`);
  }
  const hrWithProfile = await admin.req('POST', '/api/platform/users', { name: 'HR With Profile', email: `${uniq('hr')}@example.test`, role: 'HR', employee: { ...employeeDetails, department: 'People' } });
  assert.equal(hrWithProfile.status, 201);
  assert.equal((await prisma.employeeProfile.findUniqueOrThrow({ where: { userId: hrWithProfile.body.data.id } })).department, 'People');

  const email = `${uniq('dup')}@example.test`;
  assert.equal((await admin.req('POST', '/api/platform/users', { name: 'First', email, role: 'EDITOR' })).status, 201);
  assert.equal((await admin.req('POST', '/api/platform/users', { name: 'Second', email: email.toUpperCase(), role: 'EDITOR' })).status, 409);
  assert.equal((await admin.req('POST', '/api/platform/users', { name: 'No details', email: `${uniq('e')}@example.test`, role: 'EMPLOYEE' })).status, 422);
  assert.equal((await admin.req('POST', '/api/platform/users', { name: 'Bad', email: 'not-an-email', role: 'EDITOR' })).status, 422);
  assert.equal((await admin.req('POST', '/api/platform/users', { name: 'Bad role', email: `${uniq('e')}@example.test`, role: 'ROOT' })).status, 422);
  // The SALES role filter on the user list works.
  const list = await admin.req('GET', '/api/platform/users?role=SALES');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.every((u: { role: string }) => u.role === 'SALES'));
});

test('only a Super Admin can create administrators; HR may only create employees; editors nothing', async () => {
  const adminEmail = `${uniq('newadmin')}@example.test`;
  const denied = await admin.req('POST', '/api/platform/users', { name: 'Escalation', email: adminEmail, role: 'ADMIN' });
  assert.equal(denied.status, 403);
  assert.equal(await prisma.user.count({ where: { email: adminEmail } }), 0);

  const ok = await superAdmin.req('POST', '/api/platform/users', { name: 'Second Admin', email: adminEmail, role: 'ADMIN' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const newAdmin = await activate(adminEmail);
  assert.equal((await newAdmin.req('GET', '/api/platform/users')).status, 200);
  // A new admin is not a Super Admin.
  assert.equal((await newAdmin.req('POST', '/api/platform/users', { name: 'Another Admin', email: `${uniq('a')}@example.test`, role: 'ADMIN' })).status, 403);

  assert.equal((await hr.req('POST', '/api/platform/users', { name: 'Emp', email: `${uniq('emp')}@example.test`, role: 'EMPLOYEE', employee: employeeDetails })).status, 201);
  assert.equal((await hr.req('POST', '/api/platform/users', { name: 'Trn', email: `${uniq('trn')}@example.test`, role: 'TRAINER' })).status, 403);
  assert.equal((await hr.req('POST', '/api/platform/users', { name: 'Int', email: `${uniq('int')}@example.test`, role: 'STUDENT' })).status, 403);
  assert.equal((await hr.req('POST', '/api/platform/users', { name: 'Adm', email: `${uniq('adm')}@example.test`, role: 'ADMIN' })).status, 403);
  assert.equal((await editor.req('POST', '/api/platform/users', { name: 'Emp', email: `${uniq('emp')}@example.test`, role: 'EMPLOYEE', employee: employeeDetails })).status, 403);
});

test('status, role and reset rules for administrator and Super Admin accounts', async () => {
  const other = await createUser('ADMIN');
  const otherC = await login(api.base, other.email);

  // A regular admin cannot touch another admin.
  assert.equal((await admin.req('PATCH', `/api/platform/users/${other.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status, 403);
  assert.equal((await admin.req('PATCH', `/api/platform/users/${other.id}/role`, { role: 'EDITOR', reason: 'test' })).status, 403);
  assert.equal((await admin.req('PUT', `/api/platform/users/${other.id}`, { name: 'Renamed', reason: 'test' })).status, 403);
  assert.equal((await admin.req('POST', `/api/platform/users/${other.id}/password-reset`, { reason: 'test' })).status, 403);

  // A Super Admin can suspend (sessions end) and reactivate it.
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${other.id}/status`, { status: 'SUSPENDED', reason: 'left the company' })).status, 200);
  assert.equal((await otherC.req('GET', '/api/auth/me')).status, 401);
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: other.email, password: other.password })).status >= 400, true);
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${other.id}/status`, { status: 'ACTIVE', reason: 'returned' })).status, 200);
  assert.equal((await superAdmin.req('PUT', `/api/platform/users/${other.id}`, { name: 'Renamed Admin', reason: 'typo' })).status, 200);
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${other.id}/role`, { role: 'EDITOR', reason: 'moved to content' })).status, 200);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).role, 'EDITOR');
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${other.id}/role`, { role: 'ADMIN', reason: 'back to admin' })).status, 200);
  assert.equal((await admin.req('PATCH', `/api/platform/users/${(await createUser('EDITOR')).id}/role`, { role: 'ADMIN', reason: 'escalate' })).status, 403);

  // Nobody can suspend, re-role or strip a Super Admin through the API, nor change themselves.
  const super2 = await createUser('ADMIN');
  await grantSuper(super2.id);
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${super2.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status, 403);
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${super2.id}/role`, { role: 'EDITOR', reason: 'test' })).status, 403);
  assert.equal((await admin.req('DELETE', `/api/platform/users/${superAdminId}/permissions/${SUPER_ADMIN_PERMISSION}?reason=takeover`)).status, 403);
  assert.equal((await admin.req('POST', `/api/platform/users/${(await createUser('HR')).id}/permissions`, { permission: SUPER_ADMIN_PERMISSION, reason: 'test' })).status, 422);
  assert.equal((await superAdmin.req('PATCH', `/api/platform/users/${superAdminId}/status`, { status: 'SUSPENDED', reason: 'test' })).status, 403);
  assert.equal(await prisma.userPermissionGrant.count({ where: { userId: superAdminId, permission: SUPER_ADMIN_PERMISSION } }), 1);
});

test('a regular admin suspends and reactivates non-admin accounts via the platform endpoint', async () => {
  const emp = await createUser('EMPLOYEE');
  const empC = await login(api.base, emp.email);
  assert.equal((await admin.req('PATCH', `/api/platform/users/${emp.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status, 200);
  assert.equal((await empC.req('GET', '/api/auth/me')).status, 401);
  assert.equal((await admin.req('PATCH', `/api/platform/users/${emp.id}/status`, { status: 'ACTIVE', reason: 'test' })).status, 200);
  assert.equal((await login(api.base, emp.email)).cookie.length > 0, true);
  assert.equal((await admin.req('PATCH', `/api/platform/users/${emp.id}/status`, { status: 'SUSPENDED' })).status, 422);
  assert.equal((await hr.req('PATCH', `/api/platform/users/${emp.id}/status`, { status: 'SUSPENDED', reason: 'test' })).status, 403);
  const audit = await prisma.auditLog.findMany({ where: { entityId: emp.id, action: { in: ['user.suspended', 'user.reactivated'] } } });
  assert.equal(audit.length, 2);
});

test('temporary access: works until the expiry, then the account is suspended on its next request or login', async () => {
  const temp = await createUser('ADMIN');
  await prisma.userPermissionGrant.create({ data: { userId: temp.id, permission: expiryMarker(new Date(Date.now() + 3_600_000)), grantedById: temp.id } });
  const c = await login(api.base, temp.email);
  assert.equal((await c.req('GET', '/api/platform/users')).status, 200);
  const me = (await c.req('GET', '/api/auth/me')).body.data.user;
  assert.ok(!me.permissions.some((p: string) => p.startsWith(EXPIRY_PREFIX)), 'the marker is not a permission');
  const detail = await superAdmin.req('GET', `/api/platform/users/${temp.id}`);
  assert.ok(detail.body.data.accessExpiresAt);
  assert.equal(detail.body.data.permissionGrants.length, 0, 'the marker is not listed as a grant');

  // Expire it: the open session stops working and the account is suspended (audited).
  await prisma.userPermissionGrant.updateMany({ where: { userId: temp.id, permission: { startsWith: EXPIRY_PREFIX } }, data: { permission: expiryMarker(new Date(Date.now() - 1000)) } });
  assert.equal((await c.req('GET', '/api/platform/users')).status, 401);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: temp.id } })).status, 'SUSPENDED');
  assert.equal(await prisma.session.count({ where: { userId: temp.id, revokedAt: null } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { entityId: temp.id, action: 'user.access_expired' } }), 1);
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: temp.email, password: temp.password })).status, 403);

  // Reactivating through the API does not bypass the expiry.
  await prisma.user.update({ where: { id: temp.id }, data: { status: 'ACTIVE' } });
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: temp.email, password: temp.password })).status, 403);
});

test('temporary access: an already-expired account cannot log in, and role changes keep the expiry', async () => {
  const temp = await createUser('HR');
  await prisma.userPermissionGrant.create({ data: { userId: temp.id, permission: expiryMarker(new Date(Date.now() + 3_600_000)), grantedById: temp.id } });
  assert.equal((await admin.req('PATCH', `/api/platform/users/${temp.id}/role`, { role: 'EMPLOYEE', reason: 'test' })).status, 200);
  assert.equal(await prisma.userPermissionGrant.count({ where: { userId: temp.id, permission: { startsWith: EXPIRY_PREFIX } } }), 1);
  const marker = (await prisma.userPermissionGrant.findFirstOrThrow({ where: { userId: temp.id } })).permission;
  assert.equal((await admin.req('DELETE', `/api/platform/users/${temp.id}/permissions/${encodeURIComponent(marker)}?reason=test`)).status, 422);

  const expired = await createUser('ADMIN');
  await prisma.userPermissionGrant.create({ data: { userId: expired.id, permission: expiryMarker(new Date(Date.now() - 60_000)), grantedById: expired.id } });
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: expired.email, password: expired.password })).status, 403);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: expired.id } })).status, 'SUSPENDED');
  assert.equal((await new Client(api.base).req('POST', '/api/auth/login', { email: expired.email, password: 'wrong-password-1' })).status, 401, 'no status leak before the password is proven');
});
