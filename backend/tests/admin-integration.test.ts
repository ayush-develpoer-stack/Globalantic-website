/** Final integration pass: status contract, grants, audit events, notes, overview, reports, info requests, public images, sorting, FAQs. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, applyAndApprove, createUser, login, prisma, registerStudent, seedCourse, startApi, staff, testOutbox, uniq, type Api } from './helpers';

let api: Api;
let admin: Client;
let adminId: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

before(async () => {
  api = await startApi();
  const a = await staff(api.base, 'ADMIN');
  admin = a.client;
  adminId = a.user.id;
});
after(() => api.close());

async function upload(c: Client, purpose: string, body: Buffer, name: string) {
  const res = await fetch(`${api.base}/api/files?purpose=${purpose}`, {
    method: 'POST',
    headers: { Cookie: c.cookie, 'X-Forwarded-For': c.ip, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) },
    body,
  });
  return { status: res.status, body: (await res.json()) as { data: { id: string; url?: string } } };
}

test('status contract: validation 422, malformed JSON 400, unauthenticated 401, forbidden 403, conflict 409', async () => {
  const anon = new Client(api.base);
  const v = await anon.post('/api/auth/register', { email: 'bad' });
  assert.equal(v.status, 422);
  assert.ok((v.body.errors ?? []).length > 0);
  const bad = await fetch(`${api.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await anon.get('/api/platform/users')).status, 401);
  const student = await login(api.base, (await createUser('STUDENT')).email);
  assert.equal((await student.get('/api/platform/users')).status, 403);
  const slug = uniq('dup-').toLowerCase();
  const body = { slug, title: 'Dup course', shortDescription: 'Short description here', description: 'Long description here', category: 'Web', durationLabel: '4 weeks', mode: 'ONLINE', eligibility: 'Anyone', feePaise: 1000 };
  assert.equal((await admin.post('/api/training/admin/courses', body)).status, 201);
  assert.equal((await admin.post('/api/training/admin/courses', body)).status, 409);
});

test('security audit: login success/failure (no raw email), logout, forbidden attempts', async () => {
  const u = await createUser('STUDENT');
  const ghost = `${uniq('ghost')}@example.test`;
  await new Client(api.base).post('/api/auth/login', { email: ghost, password: 'Wrong-pass-1' });
  await new Client(api.base).post('/api/auth/login', { email: u.email, password: 'Wrong-pass-1' });
  const c = await login(api.base, u.email);
  await c.get('/api/training/admin/courses'); // forbidden for a student
  await c.post('/api/auth/logout');
  const logs = await prisma.auditLog.findMany({ where: { OR: [{ actorId: u.id }, { entityId: u.id }, { actorRole: 'ANONYMOUS' }] } });
  const actions = logs.map((l) => l.action);
  for (const a of ['auth.login_failed', 'auth.login_success', 'auth.logout', 'security.forbidden']) assert.ok(actions.includes(a), a);
  assert.ok(!JSON.stringify(logs).includes(ghost), 'unknown emails are stored hashed only');
  assert.ok(logs.some((l) => l.actorRole === 'ANONYMOUS' && l.entityId.startsWith('email:')));
});

test('permission grants: only grantable permissions, only staff roles, take effect immediately, revocable, audited', async () => {
  const fin = await staff(api.base, 'FINANCE');
  const path = `/api/platform/users/${fin.user.id}/permissions`;
  assert.equal((await fin.client.get('/api/training/admin/courses')).status, 403);
  assert.equal((await admin.post(path, { permission: 'users.manage', reason: 'try escalation' })).status, 422);
  assert.equal((await admin.post(path, { permission: 'student.portal', reason: 'portal' })).status, 422);
  assert.equal((await admin.post(path, { permission: 'payments.read', reason: 'already has' })).status, 409);
  assert.equal((await admin.post(path, { permission: 'training.courses.manage', reason: 'Helps with catalogue' })).status, 201);
  assert.equal((await fin.client.get('/api/training/admin/courses')).status, 200, 'grant applies on the next request');
  const me = await fin.client.get('/api/auth/me');
  assert.ok(me.body.data.user.permissions.includes('training.courses.manage'));
  const student = await createUser('STUDENT');
  assert.equal((await admin.post(`/api/platform/users/${student.id}/permissions`, { permission: 'cms.manage', reason: 'not eligible' })).status, 409);
  assert.equal((await admin.post(`/api/platform/users/${adminId}/permissions`, { permission: 'cms.manage', reason: 'self' })).status, 403);
  assert.equal((await fin.client.post(path, { permission: 'cms.manage', reason: 'self-grant' })).status, 403, 'finance cannot grant');
  assert.equal((await admin.del(`${path}/training.courses.manage`)).status, 422, 'reason required');
  assert.equal((await admin.req('DELETE', `${path}/training.courses.manage?reason=No%20longer%20needed`)).status, 200);
  assert.equal((await fin.client.get('/api/training/admin/courses')).status, 403);
  const trail = await prisma.auditLog.findMany({ where: { entityId: fin.user.id, action: { in: ['permission.granted', 'permission.revoked'] } } });
  assert.equal(trail.length, 2);
  const catalog = await admin.get('/api/platform/permissions');
  assert.ok(catalog.body.data.some((p: { permission: string; grantable: boolean }) => p.permission === 'users.manage' && !p.grantable));
});

test('user detail, safe edit, admin-initiated reset link, notes', async () => {
  const t = await createUser('TRAINER');
  const d = await admin.get(`/api/platform/users/${t.id}`);
  assert.equal(d.status, 200);
  assert.ok(!JSON.stringify(d.body.data).includes('passwordHash'));
  assert.ok(Array.isArray(d.body.data.effectivePermissions));
  const other = await createUser('FINANCE', { phone: '919811111111' });
  void other;
  assert.equal((await admin.put(`/api/platform/users/${t.id}`, { phone: '9811111111', reason: 'Update phone' })).status, 409, 'phone in use');
  assert.equal((await admin.put(`/api/platform/users/${t.id}`, { name: 'Renamed Trainer', reason: 'Typo' })).status, 200);
  const before = testOutbox.length;
  const r = await admin.post(`/api/platform/users/${t.id}/password-reset`, { revokeSessions: true, reason: 'User locked out' });
  assert.equal(r.status, 200);
  assert.ok(testOutbox.slice(before).some((m) => m.to === t.email && /reset-password\?token=/.test(m.html)));
  const otherAdmin = await createUser('ADMIN');
  assert.equal((await admin.post(`/api/platform/users/${otherAdmin.id}/password-reset`, { reason: 'x x x' })).status, 403);

  const s = await createUser('STUDENT');
  const n = await admin.post(`/api/platform/users/${s.id}/notes`, { body: 'Called about fee instalments.' });
  assert.equal(n.status, 201);
  assert.equal((await admin.get(`/api/platform/users/${s.id}/notes`)).body.data.length, 1);
  const sc = await login(api.base, s.email);
  assert.equal((await sc.get(`/api/platform/users/${s.id}/notes`)).status, 403, 'subjects never see internal notes');
  assert.equal((await admin.del(`/api/platform/users/${s.id}/notes/${n.body.data.id}`)).status, 200);
  assert.equal((await admin.get(`/api/platform/users/${s.id}/notes`)).body.data.length, 0);
});

test('notes are scoped: HR (employees.manage) only sees employees, never itself, and removes only its own notes', async () => {
  const hr = await staff(api.base, 'HR');
  const student = await createUser('STUDENT');
  await admin.post(`/api/platform/users/${student.id}/notes`, { body: 'Admin-only note about a student.' });
  assert.equal((await hr.client.get(`/api/platform/users/${student.id}/notes`)).status, 404, 'students are outside HR scope');
  assert.equal((await hr.client.post(`/api/platform/users/${student.id}/notes`, { body: 'Should not be stored.' })).status, 404);
  assert.equal((await hr.client.get(`/api/platform/users/${hr.user.id}/notes`)).status, 404, 'no notes about yourself');

  const e = await createUser('EMPLOYEE');
  await prisma.employeeProfile.create({ data: { userId: e.id, employeeCode: uniq('EMP-N-'), department: 'Ops', designation: 'Analyst', joiningDate: new Date('2026-01-01') } });
  const adminNote = await admin.post(`/api/platform/users/${e.id}/notes`, { body: 'Written by an admin.' });
  assert.equal((await hr.client.get(`/api/platform/users/${e.id}/notes`)).status, 200);
  assert.equal((await hr.client.del(`/api/platform/users/${e.id}/notes/${adminNote.body.data.id}`)).status, 404, "cannot remove another author's note");
  const own = await hr.client.post(`/api/platform/users/${e.id}/notes`, { body: 'Written by HR.' });
  assert.equal(own.status, 201);
  assert.equal((await hr.client.del(`/api/platform/users/${e.id}/notes/${own.body.data.id}`)).status, 200);
});

test('dashboard overview is permission-aware', async () => {
  const full = await admin.get('/api/platform/overview');
  for (const k of ['users', 'training', 'payments', 'referrals', 'leads', 'people', 'recentActivity']) assert.ok(k in full.body.data, k);
  const fin = (await staff(api.base, 'FINANCE')).client;
  const f = (await fin.get('/api/platform/overview')).body.data;
  assert.ok('payments' in f && 'referrals' in f);
  assert.ok(!('people' in f) && !('leads' in f) && !('recentActivity' in f));
  const hr = (await staff(api.base, 'HR')).client;
  const h = (await hr.get('/api/platform/overview')).body.data;
  assert.ok('people' in h && !('payments' in h) && !('training' in h));
});

test('reports: server-side date filter, permission per report, exports audited', async () => {
  const { batch } = await seedCourse();
  const s = await registerStudent(api.base);
  await applyAndApprove(s.client, admin, batch.id);
  const today = new Date().toISOString().slice(0, 10);
  const r = await admin.get(`/api/platform/reports/admissions?from=${today}&to=${today}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.rows.length >= 1);
  const past = await admin.get('/api/platform/reports/admissions?from=2020-01-01&to=2020-01-31');
  assert.equal(past.body.data.rows.length, 0);
  assert.equal((await admin.get('/api/platform/reports/unknown')).status, 422);
  const exp = await admin.get(`/api/platform/reports/payments?export=true`);
  assert.equal(exp.status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'report.exported', entityId: 'payments' } }));
  const fin = (await staff(api.base, 'FINANCE')).client;
  assert.equal((await fin.get('/api/platform/reports/payments')).status, 200);
  assert.equal((await fin.get('/api/platform/reports/employees')).status, 403);
});

test('admissions: request more information -> student responds once -> notified and audited', async () => {
  const { batch } = await seedCourse();
  const s = await registerStudent(api.base);
  const other = await registerStudent(api.base);
  const app = await s.client.post('/api/training/student/applications', { batchId: batch.id, qualification: 'BCA' });
  const id = app.body.data.id;
  assert.equal((await s.client.post(`/api/training/student/applications/${id}/respond`, { message: 'Nothing asked yet' })).status, 409);
  assert.equal((await admin.post(`/api/training/admin/applications/${id}/review`, { action: 'REQUEST_INFO' })).status, 422);
  const req = await admin.post(`/api/training/admin/applications/${id}/review`, { action: 'REQUEST_INFO', reason: 'Please share your final-year marksheet.' });
  assert.equal(req.status, 200);
  assert.equal(req.body.data.status, 'UNDER_REVIEW');
  const view = await s.client.get(`/api/training/student/applications/${id}`);
  assert.equal(view.body.data.infoRequest, 'Please share your final-year marksheet.');
  assert.ok(testOutbox.some((m) => m.to === s.email && /More information needed/.test(m.subject)));
  assert.equal((await other.client.post(`/api/training/student/applications/${id}/respond`, { message: 'Not mine' })).status, 404);
  const resp = await s.client.post(`/api/training/student/applications/${id}/respond`, { message: 'Uploaded marksheet, CGPA 8.1.' });
  assert.equal(resp.status, 200);
  assert.equal((await s.client.post(`/api/training/student/applications/${id}/respond`, { message: 'again' })).status, 409);
  const adminView = await admin.get(`/api/training/admin/applications/${id}`);
  assert.equal(adminView.body.data.infoResponse, 'Uploaded marksheet, CGPA 8.1.');
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: id, action: 'application.info_requested' } }));
});

test('HR can deactivate/reactivate employees only (sessions revoked); not admins or trainers', async () => {
  const hr = (await staff(api.base, 'HR')).client;
  const e = await createUser('EMPLOYEE');
  await prisma.employeeProfile.create({ data: { userId: e.id, employeeCode: uniq('EMP-T-'), department: 'Ops', designation: 'Analyst', joiningDate: new Date('2026-01-01') } });
  const ec = await login(api.base, e.email);
  assert.equal((await hr.patch(`/api/hr/employees/${e.id}/status`, { status: 'SUSPENDED' })).status, 422, 'reason required');
  assert.equal((await hr.patch(`/api/hr/employees/${e.id}/status`, { status: 'SUSPENDED', reason: 'Notice period over' })).status, 200);
  assert.equal((await ec.get('/api/employee/dashboard')).status, 401);
  assert.equal((await hr.patch(`/api/hr/employees/${e.id}/status`, { status: 'ACTIVE', reason: 'Rejoined' })).status, 200);
  const t = await createUser('TRAINER');
  assert.equal((await hr.patch(`/api/hr/employees/${t.id}/status`, { status: 'SUSPENDED', reason: 'not an employee' })).status, 404);
  assert.equal((await hr.patch(`/api/hr/employees/${adminId}/status`, { status: 'SUSPENDED', reason: 'escalation' })).status, 404);
});

test('public images: course/CMS images only, public read, private files never exposed', async () => {
  const up = await upload(admin, 'COURSE_IMAGE', PNG, 'banner.png');
  assert.equal(up.status, 201);
  assert.match(up.body.data.url ?? '', /\/files\/public\/[0-9a-f-]{36}$/);
  assert.equal((await upload(admin, 'COURSE_IMAGE', PDF, 'brochure.pdf')).status, 422, 'images only');
  const student = await registerStudent(api.base);
  assert.equal((await upload(student.client, 'COURSE_IMAGE', PNG, 'x.png')).status, 403);
  const pub = await fetch(`${api.base}/api/files/public/${up.body.data.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('content-type'), 'image/png');
  assert.equal(pub.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const priv = await upload(student.client, 'ADMISSION_DOCUMENT', PDF, 'marks.pdf');
  assert.equal((await fetch(`${api.base}/api/files/public/${priv.body.data.id}`)).status, 404, 'private purposes never public');
  const { course } = await seedCourse();
  assert.equal((await admin.put(`/api/training/admin/courses/${course.id}`, { thumbnailUrl: up.body.data.url })).status, 200);
  assert.equal((await admin.put(`/api/training/admin/courses/${course.id}`, { thumbnailUrl: 'http://evil.example/x.png' })).status, 422);
});

test('server-side sorting: whitelisted fields only', async () => {
  for (const t of ['Zeta course', 'Alpha course']) {
    await admin.post('/api/training/admin/courses', { slug: uniq('sort-').toLowerCase(), title: t, shortDescription: 'Short description here', description: 'Long description here', category: 'Sort', durationLabel: '4 weeks', mode: 'ONLINE', eligibility: 'Anyone', feePaise: 1000 });
  }
  const asc = await admin.get('/api/training/admin/courses?search=course&sort=title:asc&pageSize=100');
  const titles = asc.body.data.items.map((c: { title: string }) => c.title);
  assert.deepEqual(titles, [...titles].sort((a: string, b: string) => a.localeCompare(b)));
  assert.equal((await admin.get('/api/training/admin/courses?sort=passwordHash:asc')).status, 422);
  assert.equal((await admin.get('/api/platform/users?sort=name:desc')).status, 200);
  assert.equal((await admin.get('/api/hr/employees?sort=joiningDate:asc')).status, 200);
});

test('referral codes list and trainer workload', async () => {
  const codes = await admin.get('/api/training/admin/referrals/codes');
  assert.equal(codes.status, 200);
  assert.ok(Array.isArray(codes.body.data.items));
  const trainer = await createUser('TRAINER');
  const { batch } = await seedCourse();
  await admin.post(`/api/training/admin/batches/${batch.id}/trainers`, { trainerId: trainer.id });
  const list = await admin.get('/api/training/admin/trainers');
  const row = list.body.data.find((t: { id: string }) => t.id === trainer.id);
  assert.equal(row.workload.activeBatches, 1);
});

test('CMS FAQs: admin CRUD with validation; public list reflects changes; non-admins blocked', async () => {
  const fin = (await staff(api.base, 'FINANCE')).client;
  assert.equal((await fin.get('/api/admin/faqs')).status, 403);
  assert.equal((await admin.post('/api/admin/faqs', { question: 'Q?', answer: '' })).status, 422);
  const c = await admin.post('/api/admin/faqs', { question: 'Do you offer weekend batches?', answer: 'Yes, for selected courses.', category: 'training' });
  assert.equal(c.status, 201);
  const pub = await new Client(api.base).get('/api/faqs?category=training');
  assert.ok(pub.body.data.some((f: { id: string }) => f.id === c.body.data.id));
  assert.equal((await admin.put(`/api/admin/faqs/${c.body.data.id}`, { answer: 'Yes — Saturday and Sunday batches.' })).status, 200);
  assert.equal((await admin.del(`/api/admin/faqs/${c.body.data.id}`)).status, 200);
  assert.equal((await admin.del(`/api/admin/faqs/${c.body.data.id}`)).status, 404);
  void PASSWORD;
});
