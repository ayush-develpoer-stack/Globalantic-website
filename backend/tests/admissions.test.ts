/** Admission rules, fee integrity and student data isolation. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyAndApprove, prisma, registerStudent, seedCourse, startApi, staff, type Api, type Client } from './helpers';

let api: Api;
let admin: Client;
before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
});
after(() => api.close());

const apply = (c: Client, batchId: string, extra: Record<string, unknown> = {}) =>
  c.post('/api/training/student/applications', { batchId, qualification: 'B.Sc Computer Science', ...extra });

test('invalid and unknown batch ids are rejected', async () => {
  const { client } = await registerStudent(api.base);
  assert.equal((await apply(client, 'not-a-uuid')).status, 422);
  assert.equal((await apply(client, '00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await apply(client, "1' OR '1'='1")).status, 422);
});

test('closed, full and past-deadline batches do not accept admissions', async () => {
  const { client } = await registerStudent(api.base);
  const upcoming = await seedCourse({ batchStatus: 'UPCOMING' });
  const r1 = await apply(client, upcoming.batch.id);
  assert.equal(r1.status, 409);
  assert.match(r1.body.message, /not open/i);

  const late = await seedCourse({ deadlineDays: -1 });
  const r2 = await apply(client, late.batch.id);
  assert.equal(r2.status, 409);
  assert.match(r2.body.message, /deadline/i);

  const tiny = await seedCourse({ capacity: 1 });
  const first = await registerStudent(api.base);
  await applyAndApprove(first.client, admin, tiny.batch.id); // approval reserves the only seat
  const r3 = await apply(client, tiny.batch.id);
  assert.equal(r3.status, 409);
  assert.match(r3.body.message, /full/i);
  const pub = await client.get(`/api/training/batches/${tiny.batch.id}`);
  assert.equal(pub.body.data.status, 'FULL');
  assert.equal(pub.body.data.availableSeats, 0);
});

test('admin cannot approve beyond capacity', async () => {
  const { batch } = await seedCourse({ capacity: 1 });
  const a = await registerStudent(api.base);
  const b = await registerStudent(api.base);
  const appA = await apply(a.client, batch.id);
  const appB = await apply(b.client, batch.id);
  assert.equal(appA.status, 201);
  assert.equal(appB.status, 201);
  assert.equal((await admin.post(`/api/training/admin/applications/${appA.body.data.id}/review`, { action: 'APPROVE' })).status, 200);
  const second = await admin.post(`/api/training/admin/applications/${appB.body.data.id}/review`, { action: 'APPROVE' });
  assert.equal(second.status, 409);
});

test('duplicate admissions are rejected (same batch and same course)', async () => {
  const { client } = await registerStudent(api.base);
  const { course, batch } = await seedCourse();
  const other = await prisma.batch.create({
    data: { courseId: course.id, name: 'Evening', startDate: batch.startDate, endDate: batch.endDate, registrationDeadline: batch.registrationDeadline, mode: 'ONLINE', capacity: 10, status: 'OPEN' },
  });
  assert.equal((await apply(client, batch.id)).status, 201);
  const again = await apply(client, batch.id);
  assert.equal(again.status, 409);
  const otherBatch = await apply(client, other.id);
  assert.equal(otherBatch.status, 409);
  // Concurrent double-submit: exactly one succeeds
  const { course: c2, batch: b2 } = await seedCourse();
  void c2;
  const results = await Promise.all([apply(client, b2.id), apply(client, b2.id), apply(client, b2.id)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await prisma.admissionApplication.count({ where: { batchId: b2.id } }), 1);
});

test('fee comes from the database; client-supplied money and status fields are ignored', async () => {
  const { client } = await registerStudent(api.base);
  const { batch } = await seedCourse({ feePaise: 3_000_000, discountPaise: 500_000 });
  const r = await apply(client, batch.id, { feePaise: 1, payablePaise: 1, discountPaise: 2_999_999, status: 'ENROLLED', studentId: 'someone-else' });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.feePaise, 3_000_000);
  assert.equal(r.body.data.discountPaise, 500_000);
  assert.equal(r.body.data.payablePaise, 2_500_000);
  assert.equal(r.body.data.status, 'SUBMITTED');
});

test("a student cannot see or change another student's application", async () => {
  const owner = await registerStudent(api.base);
  const intruder = await registerStudent(api.base);
  const { batch } = await seedCourse();
  const app = await apply(owner.client, batch.id);
  const id = app.body.data.id;
  assert.equal((await intruder.client.get(`/api/training/student/applications/${id}`)).status, 404);
  assert.equal((await intruder.client.post(`/api/training/student/applications/${id}/withdraw`)).status, 404);
  assert.equal((await intruder.client.post('/api/training/student/payments/order', { applicationId: id })).status, 404);
  const mine = await intruder.client.get('/api/training/student/applications');
  assert.equal(mine.body.data.length, 0);
  // There is no student route that changes application status.
  assert.equal((await owner.client.put(`/api/training/student/applications/${id}`, { status: 'APPROVED' })).status, 404);
  assert.equal((await owner.client.post(`/api/training/admin/applications/${id}/review`, { action: 'APPROVE' })).status, 403);
});

test('rejection requires a reason, is audited and notifies the student', async () => {
  const s = await registerStudent(api.base);
  const { batch } = await seedCourse();
  const app = await apply(s.client, batch.id);
  const id = app.body.data.id;
  assert.equal((await admin.post(`/api/training/admin/applications/${id}/review`, { action: 'REJECT' })).status, 422);
  const r = await admin.post(`/api/training/admin/applications/${id}/review`, { action: 'REJECT', reason: 'Eligibility criteria not met' });
  assert.equal(r.status, 200);
  const view = await s.client.get(`/api/training/student/applications/${id}`);
  assert.equal(view.body.data.status, 'REJECTED');
  assert.equal(view.body.data.rejectionReason, 'Eligibility criteria not met');
  assert.equal(view.body.data.reviewedById, undefined, 'internal reviewer id is not exposed to students');
  const notes = await s.client.get('/api/training/student/notifications');
  assert.ok(notes.body.data.items.some((n: { title: string }) => n.title === 'Application update'));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: id, action: 'application.rejected' } }));
});

test('free courses enroll on approval; withdrawal is possible before payment', async () => {
  const free = await seedCourse({ feePaise: 0 });
  const s = await registerStudent(api.base);
  const app = await applyAndApprove(s.client, admin, free.batch.id);
  const enrollments = await s.client.get('/api/training/student/enrollments');
  assert.equal(enrollments.body.data.length, 1);
  assert.equal((await s.client.get(`/api/training/student/applications/${app.id}`)).body.data.status, 'ENROLLED');

  const paid = await seedCourse();
  const s2 = await registerStudent(api.base);
  const a2 = await apply(s2.client, paid.batch.id);
  assert.equal((await s2.client.post(`/api/training/student/applications/${a2.body.data.id}/withdraw`)).status, 200);
  // Re-applying to the same batch re-opens the application
  const again = await apply(s2.client, paid.batch.id);
  assert.equal(again.status, 201);
  assert.equal(again.body.data.id, a2.body.data.id);
});

test('public catalogue hides drafts and validates slugs', async () => {
  const anon = (await registerStudent(api.base)).client;
  const draft = await seedCourse();
  await prisma.course.update({ where: { id: draft.course.id }, data: { status: 'DRAFT' } });
  assert.equal((await anon.get(`/api/training/courses/${draft.course.slug}`)).status, 404);
  assert.equal((await anon.get('/api/training/courses/Bad%20Slug')).status, 422);
  const list = await anon.get('/api/training/courses?pageSize=100');
  assert.equal(list.status, 200);
  assert.ok(!list.body.data.items.some((c: { id: string }) => c.id === draft.course.id));
  assert.equal((await anon.get('/api/training/courses?pageSize=1000')).status, 422);
});
