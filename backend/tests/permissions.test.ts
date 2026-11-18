/** Role / permission matrix enforced at the API (not just in the UI). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, createUser, login, prisma, seedCourse, startApi, staff, type Api } from './helpers';
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, SUPER_ADMIN_PERMISSION } from '../src/lib/permissions';

let api: Api;
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
let admin: Client, finance: Client, editor: Client, trainer: Client, student: Client;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  editor = (await staff(api.base, 'EDITOR')).client;
  trainer = (await staff(api.base, 'TRAINER')).client;
  student = await login(api.base, (await createUser('STUDENT')).email);
});
after(() => api.close());

test('static matrix: portals are separated and only ADMIN can change money rules', () => {
  // ADMIN holds every permission except portals and Super Admin (an individual grant, see user-management.test.ts).
  assert.ok(PERMISSIONS.every((p) => p.endsWith('.portal') || p === SUPER_ADMIN_PERMISSION || hasPermission('ADMIN', p)));
  assert.equal(hasPermission('ADMIN', SUPER_ADMIN_PERMISSION), false);
  assert.equal(hasPermission('ADMIN', 'student.portal'), false);
  assert.equal(hasPermission('ADMIN', 'trainer.portal'), false);
  for (const p of ['payments.record_offline', 'referrals.settings', 'training.courses.manage'] as const) {
    assert.equal(hasPermission('FINANCE', p), false, p);
  }
  assert.deepEqual([...ROLE_PERMISSIONS.STUDENT], ['student.portal']);
  assert.deepEqual([...ROLE_PERMISSIONS.TRAINER], ['trainer.portal']);
  assert.equal(hasPermission(undefined, 'cms.manage'), false);
  assert.equal(hasPermission('HACKER', 'cms.manage'), false);
});

const ADMIN_ROUTES: [string, string][] = [
  ['GET', '/api/training/admin/courses'],
  ['GET', '/api/training/admin/batches'],
  ['GET', '/api/training/admin/students'],
  ['GET', '/api/training/admin/applications'],
  ['GET', '/api/training/admin/payments'],
  ['GET', '/api/training/admin/referrals/rewards'],
  ['GET', '/api/training/admin/referrals/settings'],
  ['PUT', '/api/training/admin/referrals/settings'],
  ['GET', '/api/training/admin/audit'],
  ['POST', '/api/training/admin/staff'],
];

test('students and trainers are denied every admin training route (403)', async () => {
  for (const c of [student, trainer]) {
    for (const [m, p] of ADMIN_ROUTES) {
      const r = await c.req(m, p, m === 'GET' ? undefined : {});
      assert.equal(r.status, 403, `${m} ${p}`);
    }
  }
});

test('EDITOR (CMS only) cannot reach training administration', async () => {
  for (const [m, p] of ADMIN_ROUTES) {
    const r = await editor.req(m, p, m === 'GET' ? undefined : {});
    assert.equal(r.status, 403, `${m} ${p}`);
  }
});

test('FINANCE: can read payments/referrals, cannot manage courses, settings or offline payments', async () => {
  assert.equal((await finance.get('/api/training/admin/payments')).status, 200);
  assert.equal((await finance.get('/api/training/admin/referrals/rewards')).status, 200);
  assert.equal((await finance.get('/api/training/admin/applications')).status, 200);
  assert.equal((await finance.get('/api/training/admin/courses')).status, 403);
  assert.equal((await finance.put('/api/training/admin/referrals/settings', { rewardAmountPaise: 1, reason: 'try' })).status, 403);
  assert.equal((await finance.post('/api/training/admin/applications/00000000-0000-4000-8000-000000000000/offline-payment', { method: 'CASH', reference: 'R1', reason: 'x' })).status, 403);
  assert.equal((await finance.post('/api/training/admin/applications/00000000-0000-4000-8000-000000000000/review', { action: 'APPROVE' })).status, 403);
});

test('portal separation: staff cannot use the student or trainer portal APIs', async () => {
  for (const c of [admin, finance, editor]) {
    assert.equal((await c.get('/api/training/student/dashboard')).status, 403);
    assert.equal((await c.get('/api/training/trainer/dashboard')).status, 403);
  }
  assert.equal((await trainer.get('/api/training/student/dashboard')).status, 403);
  assert.equal((await student.get('/api/training/trainer/dashboard')).status, 403);
});

test('legacy CMS admin routes still require ADMIN', async () => {
  assert.equal((await admin.get('/api/admin/dashboard')).status, 200);
  for (const c of [finance, trainer, student]) assert.equal((await c.get('/api/admin/dashboard')).status, 403);
});

test('admin course + batch management works end-to-end and is audited', async () => {
  const slug = `perm-course-${Date.now()}`;
  const c = await admin.post('/api/training/admin/courses', {
    slug,
    title: 'Permission Course',
    shortDescription: 'Short description long enough',
    description: 'Full description long enough',
    category: 'Web',
    durationLabel: '6 weeks',
    mode: 'ONLINE',
    eligibility: 'Graduates',
    feePaise: 1_000_000,
    discountPaise: 2_000_000,
  });
  assert.equal(c.status, 422, 'discount larger than fee is rejected');
  const ok = await admin.post('/api/training/admin/courses', {
    slug,
    title: 'Permission Course',
    shortDescription: 'Short description long enough',
    description: 'Full description long enough',
    category: 'Web',
    durationLabel: '6 weeks',
    mode: 'ONLINE',
    eligibility: 'Graduates',
    feePaise: 1_000_000,
  });
  assert.equal(ok.status, 201);
  const id = ok.body.data.id;
  assert.equal((await admin.patch(`/api/training/admin/courses/${id}/status`, { status: 'PUBLISHED' })).status, 409, 'cannot publish without syllabus');
  assert.equal((await admin.put(`/api/training/admin/courses/${id}/modules`, { modules: [{ title: 'Basics', topics: ['HTML'] }] })).status, 200);
  assert.equal((await admin.patch(`/api/training/admin/courses/${id}/status`, { status: 'PUBLISHED' })).status, 200);
  const b = await admin.post('/api/training/admin/batches', {
    courseId: id,
    name: 'Morning',
    // Relative dates: a fixed deadline turns into a past one and closes admission (this test broke on 2026-10-31).
    startDate: isoIn(30),
    endDate: isoIn(90),
    registrationDeadline: isoIn(25),
    mode: 'ONLINE',
    capacity: 2,
  });
  assert.equal(b.status, 201);
  assert.equal((await admin.patch(`/api/training/admin/batches/${b.body.data.id}/status`, { status: 'OPEN' })).status, 200);
  assert.equal((await admin.patch(`/api/training/admin/batches/${b.body.data.id}/status`, { status: 'CANCELLED' })).status, 422, 'cancel needs a reason');
  const pub = await new Client(api.base).get(`/api/training/courses/${slug}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.batches[0].availableSeats, 2);
  assert.equal(pub.body.data.batches[0].admissionOpen, true);
  assert.ok((await prisma.auditLog.count({ where: { entityId: id } })) >= 3);
});

test('nullable fields can be cleared; a cleared fee override falls back to the course fee', async () => {
  const { course, batch } = await seedCourse({ feePaise: 2_000_000 });
  assert.equal((await admin.put(`/api/training/admin/batches/${batch.id}`, { feePaise: 1_500_000, venue: 'Room 4' })).status, 200);
  let pub = await new Client(api.base).get(`/api/training/batches/${batch.id}`);
  assert.equal(pub.body.data.fee.payablePaise, 1_500_000);
  assert.equal((await admin.put(`/api/training/admin/batches/${batch.id}`, { feePaise: null, venue: '' })).status, 200);
  const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
  assert.equal(after.feePaise, null);
  assert.equal(after.venue, null);
  pub = await new Client(api.base).get(`/api/training/batches/${batch.id}`);
  assert.equal(pub.body.data.fee.payablePaise, 2_000_000);
  // Omitted fields stay unchanged; '' clears an optional course field
  await admin.put(`/api/training/admin/courses/${course.id}`, { seoTitle: 'SEO title' });
  await admin.put(`/api/training/admin/courses/${course.id}`, { title: course.title });
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).seoTitle, 'SEO title');
  await admin.put(`/api/training/admin/courses/${course.id}`, { seoTitle: '' });
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).seoTitle, null);
});

test('trainer assignment requires a TRAINER account', async () => {
  const { batch } = await seedCourse();
  const s = await createUser('STUDENT');
  assert.equal((await admin.post(`/api/training/admin/batches/${batch.id}/trainers`, { trainerId: s.id })).status, 422);
});
