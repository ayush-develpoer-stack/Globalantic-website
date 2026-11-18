/**
 * Endpoint coverage for /api/training/admin/* routes that no other test exercised:
 * dashboard, permissions, course/batch reads, schedules, batch report, staff, admissions
 * (verify documents, confirm enrollment, transfer), students, enrollment status and
 * attendance, certificates, refund records, announcements, support, referral settings
 * and codes, and the audit log. Each route: success + persistence, 401, 403, 422, 404,
 * and invalid state transitions where the route has them.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  Client,
  applyAndApprove,
  payApplication,
  prisma,
  registerStudent,
  seedCourse,
  startApi,
  staff,
  uniq,
  useFakeGateway,
  type Api,
  type FakeGateway,
} from './helpers';

const A = '/api/training/admin';
const MISSING = crypto.randomUUID();

let api: Api;
let gateway: FakeGateway;
let admin: Client, finance: Client, trainer: Client, anon: Client;
let adminId: string;
let courseId: string, batch1: string, batch2: string;
let sA: Awaited<ReturnType<typeof registerStudent>>; // enrolled (paid) in batch1
let sB: Awaited<ReturnType<typeof registerStudent>>; // approved, unpaid
let sC: Awaited<ReturnType<typeof registerStudent>>; // paid, used for the refund record
let appB: string;
let enrollA: string;
let paymentC: string;

before(async () => {
  api = await startApi();
  gateway = useFakeGateway();
  const a = await staff(api.base, 'ADMIN');
  admin = a.client;
  adminId = a.user.id;
  finance = (await staff(api.base, 'FINANCE')).client;
  trainer = (await staff(api.base, 'TRAINER')).client;
  anon = new Client(api.base);

  const seeded = await seedCourse();
  courseId = seeded.course.id;
  batch1 = seeded.batch.id;
  batch2 = (
    await prisma.batch.create({
      data: {
        courseId,
        name: `Batch ${uniq('b2')}`,
        startDate: new Date(Date.now() + 20 * 86_400_000),
        endDate: new Date(Date.now() + 90 * 86_400_000),
        registrationDeadline: new Date(Date.now() + 15 * 86_400_000),
        mode: 'ONLINE',
        capacity: 30,
        status: 'OPEN',
      },
    })
  ).id;

  sA = await registerStudent(api.base);
  sB = await registerStudent(api.base);
  sC = await registerStudent(api.base);
  const appA = await applyAndApprove(sA.client, admin, batch1);
  await payApplication(sA.client, gateway, appA.id);
  enrollA = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: sA.user.id } })).id;
  appB = (await applyAndApprove(sB.client, admin, batch1)).id;
  const appC = await applyAndApprove(sC.client, admin, batch1);
  paymentC = (await payApplication(sC.client, gateway, appC.id)).recordId;
});
after(() => api.close());

const auditCount = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

// ---- Dashboard & permissions ---------------------------------------------------

test('GET /dashboard: counts from the DB; FINANCE allowed (admissions.read), TRAINER 403, anon 401', async () => {
  const r = await admin.get(`${A}/dashboard`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.data.applications.ENROLLED >= 2);
  assert.ok(r.body.data.revenue.paidCount >= 2);
  assert.equal(typeof r.body.data.openSupport, 'number');
  assert.equal((await finance.get(`${A}/dashboard`)).status, 200);
  assert.equal((await trainer.get(`${A}/dashboard`)).status, 403);
  assert.equal((await anon.get(`${A}/dashboard`)).status, 401);
});

test('GET /me/permissions: returns the caller\'s own role permissions only', async () => {
  const a = await admin.get(`${A}/me/permissions`);
  assert.equal(a.status, 200);
  assert.equal(a.body.data.role, 'ADMIN');
  assert.ok(a.body.data.permissions.includes('audit.read'));
  const f = await finance.get(`${A}/me/permissions`);
  assert.equal(f.body.data.role, 'FINANCE');
  assert.ok(!f.body.data.permissions.includes('audit.read'));
  assert.equal((await anon.get(`${A}/me/permissions`)).status, 401);
});

// ---- Courses & batches ------------------------------------------------------------

test('GET /courses/:id: 200 with syllabus, 404 unknown, 422 bad id, 403 FINANCE', async () => {
  const r = await admin.get(`${A}/courses/${courseId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, courseId);
  assert.equal((await admin.get(`${A}/courses/${MISSING}`)).status, 404);
  assert.equal((await admin.get(`${A}/courses/not-a-uuid`)).status, 422);
  assert.equal((await finance.get(`${A}/courses/${courseId}`)).status, 403);
});

test('GET /batches: list filtered by course, invalid status 422, 403 FINANCE, 401 anon', async () => {
  const r = await admin.get(`${A}/batches?courseId=${courseId}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.items.map((b: { id: string }) => b.id).sort(), [batch1, batch2].sort());
  assert.equal(r.body.data.total, 2);
  assert.equal((await admin.get(`${A}/batches?status=NOPE`)).status, 422);
  assert.equal((await finance.get(`${A}/batches`)).status, 403);
  assert.equal((await anon.get(`${A}/batches`)).status, 401);
});

test('GET /batches/:id: roster, seats and fee; 404 unknown', async () => {
  const r = await admin.get(`${A}/batches/${batch1}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.enrollments.some((e: { id: string }) => e.id === enrollA));
  assert.ok(r.body.data.seatsTaken >= 2);
  assert.equal((await admin.get(`${A}/batches/${MISSING}`)).status, 404);
  assert.equal((await trainer.get(`${A}/batches/${batch1}`)).status, 403);
});

test('PUT /batches/:id/schedules: replaces slots and audits; end-before-start 422; 404; 403', async () => {
  const body = { schedules: [{ dayOfWeek: 1, startTime: '10:00', endTime: '12:00', topic: 'Basics' }, { dayOfWeek: 3, startTime: '14:00', endTime: '15:30' }] };
  const r = await admin.put(`${A}/batches/${batch1}/schedules`, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.length, 2);
  assert.equal(await prisma.batchSchedule.count({ where: { batchId: batch1 } }), 2);
  // Replace, not append
  await admin.put(`${A}/batches/${batch1}/schedules`, { schedules: [{ dayOfWeek: 5, startTime: '09:00', endTime: '10:00' }] });
  const rows = await prisma.batchSchedule.findMany({ where: { batchId: batch1 } });
  assert.deepEqual(rows.map((s) => s.dayOfWeek), [5]);
  assert.ok((await auditCount('batch.schedule_updated', batch1)) >= 2);

  assert.equal((await admin.put(`${A}/batches/${batch1}/schedules`, { schedules: [{ dayOfWeek: 1, startTime: '12:00', endTime: '11:00' }] })).status, 422);
  assert.equal((await admin.put(`${A}/batches/${batch1}/schedules`, { schedules: [{ dayOfWeek: 9, startTime: '10:00', endTime: '11:00' }] })).status, 422);
  assert.equal((await admin.put(`${A}/batches/${batch1}/schedules`, { schedules: [{ dayOfWeek: 1, startTime: '25:00', endTime: '26:00' }] })).status, 422);
  assert.equal((await admin.put(`${A}/batches/${MISSING}/schedules`, body)).status, 404);
  assert.equal((await finance.put(`${A}/batches/${batch1}/schedules`, body)).status, 403);
  assert.equal(await prisma.batchSchedule.count({ where: { batchId: batch1 } }), 1, 'rejected requests changed nothing');
});

test('GET /batches/:id/report: 200 for staff with learning.read; 404; 403 FINANCE', async () => {
  const r = await admin.get(`${A}/batches/${batch1}/report`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await admin.get(`${A}/batches/${MISSING}/report`)).status, 404);
  assert.equal((await finance.get(`${A}/batches/${batch1}/report`)).status, 403);
});

// ---- Staff ------------------------------------------------------------------------

test('POST /staff creates an invited account (audited, unusable password); GET /staff lists it', async () => {
  const email = `${uniq('trainer')}@example.test`;
  const r = await admin.post(`${A}/staff`, { name: 'New Trainer', email, role: 'TRAINER' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.role, 'TRAINER');
  assert.equal(await auditCount('user.staff_created', user.id), 1);
  assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
  const login = await anon.post('/api/auth/login', { email, password: 'Str0ngPass!' });
  assert.equal(login.status, 401, 'invited account cannot sign in before choosing a password');

  const list = await admin.get(`${A}/staff`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((u: { email: string }) => u.email === email));

  // An HR account created here must also be visible in the staff list.
  const hrEmail = `${uniq('hr')}@example.test`;
  assert.equal((await admin.post(`${A}/staff`, { name: 'New HR', email: hrEmail, role: 'HR' })).status, 201);
  assert.ok((await admin.get(`${A}/staff`)).body.data.some((u: { email: string }) => u.email === hrEmail));
});

test('POST /staff: duplicate 409, ADMIN/STUDENT role 422, bad phone 422, 403 FINANCE, 401 anon', async () => {
  const email = `${uniq('dup')}@example.test`;
  assert.equal((await admin.post(`${A}/staff`, { name: 'Dup One', email, role: 'EDITOR' })).status, 201);
  assert.equal((await admin.post(`${A}/staff`, { name: 'Dup Two', email: email.toUpperCase(), role: 'EDITOR' })).status, 409);
  assert.equal((await admin.post(`${A}/staff`, { name: 'Bad Role', email: `${uniq('x')}@example.test`, role: 'ADMIN' })).status, 422);
  assert.equal((await admin.post(`${A}/staff`, { name: 'Bad Role', email: `${uniq('x')}@example.test`, role: 'STUDENT' })).status, 422);
  assert.equal((await admin.post(`${A}/staff`, { name: 'Bad Phone', email: `${uniq('x')}@example.test`, role: 'TRAINER', phone: 'abc' })).status, 422);
  assert.equal((await admin.post(`${A}/staff`, { email: 'nobody@example.test' })).status, 422);
  assert.equal((await finance.post(`${A}/staff`, { name: 'No Perm', email: `${uniq('x')}@example.test`, role: 'TRAINER' })).status, 403);
  assert.equal((await finance.get(`${A}/staff`)).status, 403);
  assert.equal((await anon.post(`${A}/staff`, { name: 'Anon', email: `${uniq('x')}@example.test`, role: 'TRAINER' })).status, 401);
});

// ---- Admissions ---------------------------------------------------------------------

test('POST /applications/:id/verify-documents: stamps verifier and audits; 404; 403 FINANCE', async () => {
  const r = await admin.post(`${A}/applications/${appB}/verify-documents`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const app = await prisma.admissionApplication.findUniqueOrThrow({ where: { id: appB } });
  assert.ok(app.documentsVerifiedAt);
  assert.equal(app.documentsVerifiedBy, adminId);
  assert.equal(await auditCount('application.documents_verified', appB), 1);
  assert.equal((await admin.post(`${A}/applications/${MISSING}/verify-documents`)).status, 404);
  assert.equal((await admin.post(`${A}/applications/bad/verify-documents`)).status, 422);
  assert.equal((await finance.post(`${A}/applications/${appB}/verify-documents`)).status, 403);
});

test('POST /applications/:id/confirm-enrollment: 409 without payment, idempotent once enrolled', async () => {
  const r = await admin.post(`${A}/applications/${appB}/confirm-enrollment`);
  assert.equal(r.status, 409);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: appB } }), 0, 'no enrollment without a verified payment');
  assert.equal((await admin.post(`${A}/applications/${MISSING}/confirm-enrollment`)).status, 404);
  assert.equal((await finance.post(`${A}/applications/${appB}/confirm-enrollment`)).status, 403);

  // Already enrolled (sA): returns the existing enrollment, never a second one.
  const appA = (await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollA } })).applicationId;
  const again = await admin.post(`${A}/applications/${appA}/confirm-enrollment`);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.data.id, enrollA);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: appA } }), 1);
});

test('POST /applications/:id/transfer: moves to another batch of the same course, audited; guards', async () => {
  const other = await seedCourse();
  assert.equal((await admin.post(`${A}/applications/${appB}/transfer`, { batchId: other.batch.id, reason: 'Wrong course' })).status, 422, 'different course');
  assert.equal((await admin.post(`${A}/applications/${appB}/transfer`, { batchId: batch1, reason: 'Same batch' })).status, 409, 'same batch');
  assert.equal((await admin.post(`${A}/applications/${appB}/transfer`, { batchId: batch2 })).status, 422, 'reason required');
  assert.equal((await admin.post(`${A}/applications/${appB}/transfer`, { batchId: 'x', reason: 'Bad id' })).status, 422);
  assert.equal((await admin.post(`${A}/applications/${MISSING}/transfer`, { batchId: batch2, reason: 'Missing app' })).status, 404);
  assert.equal((await finance.post(`${A}/applications/${appB}/transfer`, { batchId: batch2, reason: 'No permission' })).status, 403);

  const r = await admin.post(`${A}/applications/${appB}/transfer`, { batchId: batch2, reason: 'Student asked for a later start' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.admissionApplication.findUniqueOrThrow({ where: { id: appB } })).batchId, batch2);
  assert.equal(await prisma.auditLog.count({ where: { entityId: appB, action: 'application.batch_transferred', reason: 'Student asked for a later start' } }), 1);

  // Closed target batch -> 409
  const closed = await prisma.batch.create({
    data: { courseId, name: `Closed ${uniq('c')}`, startDate: new Date(), endDate: new Date(Date.now() + 86_400_000), registrationDeadline: new Date(), mode: 'ONLINE', capacity: 5, status: 'CANCELLED' },
  });
  assert.equal((await admin.post(`${A}/applications/${appB}/transfer`, { batchId: closed.id, reason: 'Into a closed batch' })).status, 409);
  assert.equal((await prisma.admissionApplication.findUniqueOrThrow({ where: { id: appB } })).batchId, batch2, 'unchanged after rejection');
});

// ---- Students -------------------------------------------------------------------------

test('GET /students: search finds the student; FINANCE can read; invalid status 422; TRAINER 403', async () => {
  const r = await admin.get(`${A}/students?search=${encodeURIComponent(sA.email)}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.items.map((s: { id: string }) => s.id), [sA.user.id]);
  assert.equal((await finance.get(`${A}/students`)).status, 200);
  assert.equal((await admin.get(`${A}/students?status=GONE`)).status, 422);
  assert.equal((await trainer.get(`${A}/students`)).status, 403);
  assert.equal((await anon.get(`${A}/students`)).status, 401);
});

test('GET /students/:id: profile with enrollments; staff id 404 (students only); unknown 404', async () => {
  const r = await admin.get(`${A}/students/${sA.user.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.email, sA.email.toLowerCase());
  assert.ok(r.body.data.enrollments.some((e: { id: string }) => e.id === enrollA));
  assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
  assert.equal((await admin.get(`${A}/students/${adminId}`)).status, 404, 'a staff id is not a student');
  assert.equal((await admin.get(`${A}/students/${MISSING}`)).status, 404);
  assert.equal((await trainer.get(`${A}/students/${sA.user.id}`)).status, 403);
});

test('PUT /students/:id: updates profile with a reason (audited); FINANCE read-only 403; 422; 404', async () => {
  const r = await admin.put(`${A}/students/${sA.user.id}`, { name: 'Corrected Name', city: 'Bhopal', graduationYear: 2024, dateOfBirth: '2002-05-17', reason: 'Spelling fix requested' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = await prisma.user.findUniqueOrThrow({ where: { id: sA.user.id }, include: { studentProfile: true } });
  assert.equal(u.name, 'Corrected Name');
  assert.equal(u.studentProfile?.city, 'Bhopal');
  assert.equal(u.studentProfile?.graduationYear, 2024);
  assert.equal(u.studentProfile?.dateOfBirth?.toISOString().slice(0, 10), '2002-05-17');
  assert.equal(await auditCount('student.updated_by_admin', sA.user.id), 1);

  // Clearing a field with null
  assert.equal((await admin.put(`${A}/students/${sA.user.id}`, { city: null, reason: 'Clear city' })).status, 200);
  assert.equal((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: sA.user.id } })).city, null);

  assert.equal((await admin.put(`${A}/students/${sA.user.id}`, { name: 'No Reason' })).status, 422);
  assert.equal((await admin.put(`${A}/students/${sA.user.id}`, { graduationYear: 1800, reason: 'Bad year' })).status, 422);
  assert.equal((await admin.put(`${A}/students/${sA.user.id}`, { dateOfBirth: '17-05-2002', reason: 'Bad date' })).status, 422);
  assert.equal((await admin.put(`${A}/students/${MISSING}`, { name: 'Ghost', reason: 'Missing student' })).status, 404);
  assert.equal((await finance.put(`${A}/students/${sA.user.id}`, { name: 'Finance Edit', reason: 'Not allowed' })).status, 403);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: sA.user.id } })).name, 'Corrected Name');
});

test('PATCH /enrollments/:id/status: allowed transitions only, audited; 422 bad status/no reason; 404; 403', async () => {
  const s = await admin.patch(`${A}/enrollments/${enrollA}/status`, { status: 'SUSPENDED', reason: 'Fee query pending' });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollA } })).status, 'SUSPENDED');
  assert.equal((await admin.patch(`${A}/enrollments/${enrollA}/status`, { status: 'COMPLETED', reason: 'Not allowed from suspended' })).status, 409);
  assert.equal((await admin.patch(`${A}/enrollments/${enrollA}/status`, { status: 'ACTIVE', reason: 'Resolved' })).status, 200);
  assert.equal((await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollA } })).status, 'ACTIVE');
  assert.equal(await auditCount('enrollment.status_changed', enrollA), 2);

  assert.equal((await admin.patch(`${A}/enrollments/${enrollA}/status`, { status: 'GRADUATED', reason: 'Bad status' })).status, 422);
  assert.equal((await admin.patch(`${A}/enrollments/${enrollA}/status`, { status: 'SUSPENDED' })).status, 422);
  assert.equal((await admin.patch(`${A}/enrollments/${MISSING}/status`, { status: 'SUSPENDED', reason: 'Missing' })).status, 404);
  assert.equal((await finance.patch(`${A}/enrollments/${enrollA}/status`, { status: 'SUSPENDED', reason: 'No permission' })).status, 403);
  assert.equal((await sA.client.patch(`${A}/enrollments/${enrollA}/status`, { status: 'COMPLETED', reason: 'Student self-complete' })).status, 403);
});

test('GET /enrollments/:id/attendance: records and percent; 404; 403 FINANCE', async () => {
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  await prisma.attendance.createMany({
    data: [1, 2, 3, 4].map((n) => ({ batchId: batch1, enrollmentId: enrollA, studentId: sA.user.id, sessionDate: day(n), status: n === 4 ? ('ABSENT' as const) : ('PRESENT' as const), markedById: adminId })),
  });
  const r = await admin.get(`${A}/enrollments/${enrollA}/attendance`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.records.length, 4);
  assert.equal(r.body.data.percent, 75);
  assert.equal((await admin.get(`${A}/enrollments/${MISSING}/attendance`)).status, 404);
  assert.equal((await finance.get(`${A}/enrollments/${enrollA}/attendance`)).status, 403);
});

// ---- Certificates ------------------------------------------------------------------------

test('GET /certificates + POST /certificates/:id/revoke: list, revoke once (audited), second revoke 404', async () => {
  await prisma.batch.update({ where: { id: batch1 }, data: { endDate: new Date(Date.now() - 1000) } });
  const issued = await admin.post(`${A}/enrollments/${enrollA}/certificate`);
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  const certId = issued.body.data.id as string;

  const list = await admin.get(`${A}/certificates`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.some((c: { id: string }) => c.id === certId));
  assert.equal((await admin.get(`${A}/certificates?pageSize=0`)).status, 422);
  assert.equal((await finance.get(`${A}/certificates`)).status, 403);

  assert.equal((await admin.post(`${A}/certificates/${certId}/revoke`, {})).status, 422, 'reason required');
  assert.equal((await finance.post(`${A}/certificates/${certId}/revoke`, { reason: 'No permission' })).status, 403);
  const rv = await admin.post(`${A}/certificates/${certId}/revoke`, { reason: 'Issued in error' });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  const cert = await prisma.certificate.findUniqueOrThrow({ where: { id: certId } });
  assert.equal(cert.status, 'REVOKED');
  assert.equal(cert.revokeReason, 'Issued in error');
  assert.equal(await auditCount('certificate.revoked', certId), 1);
  assert.equal((await admin.post(`${A}/certificates/${certId}/revoke`, { reason: 'Again' })).status, 404, 'already revoked');
  assert.equal((await admin.post(`${A}/certificates/${MISSING}/revoke`, { reason: 'Missing' })).status, 404);
  // Public verification now reports it invalid
  const verify = await anon.get(`/api/training/certificates/verify/${cert.verificationCode}`);
  assert.equal(verify.status, 200);
  assert.equal(verify.body.data.valid, false);
});

// ---- Payments: refund record -----------------------------------------------------------

test('POST /payments/:id/refund-record: FINANCE records a refund (payment+invoice REFUNDED, audited); idempotent; guards', async () => {
  assert.equal((await finance.post(`${A}/payments/${paymentC}/refund-record`, {})).status, 422, 'reason required');
  assert.equal((await trainer.post(`${A}/payments/${paymentC}/refund-record`, { reason: 'No permission' })).status, 403);
  assert.equal((await anon.post(`${A}/payments/${paymentC}/refund-record`, { reason: 'Anon' })).status, 401);

  const r = await finance.post(`${A}/payments/${paymentC}/refund-record`, { reason: 'Refunded via Razorpay dashboard' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'REFUNDED');
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentC }, include: { invoice: true } });
  assert.equal(p.status, 'REFUNDED');
  assert.ok(p.refundedAt);
  assert.equal(p.invoice?.status, 'REFUNDED');
  assert.equal(await auditCount('payment.refunded', paymentC), 1);

  const again = await finance.post(`${A}/payments/${paymentC}/refund-record`, { reason: 'Clicked twice' });
  assert.equal(again.status, 200);
  assert.equal(await auditCount('payment.refunded', paymentC), 1, 'second call records nothing new');
  assert.equal((await finance.post(`${A}/payments/${MISSING}/refund-record`, { reason: 'Missing' })).status, 404);

  // A payment that was never paid cannot be refunded
  const order = await sB.client.post('/api/training/student/payments/order', { applicationId: appB });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const unpaid = await prisma.payment.findFirstOrThrow({ where: { applicationId: appB, status: { not: 'PAID' } } });
  assert.equal((await finance.post(`${A}/payments/${unpaid.id}/refund-record`, { reason: 'Never paid' })).status, 409);
  assert.notEqual((await prisma.payment.findUniqueOrThrow({ where: { id: unpaid.id } })).status, 'REFUNDED');
});

// ---- Announcements & support -------------------------------------------------------------

test('POST /announcements: programme-wide and per-batch, notifies active students; 404 batch; 422; 403', async () => {
  // sA's enrollment is COMPLETED after the certificate; enroll a fresh ACTIVE student in batch2.
  const sD = await registerStudent(api.base);
  const appD = await applyAndApprove(sD.client, admin, batch2);
  await payApplication(sD.client, gateway, appD.id);
  const count = (userId: string) => prisma.notification.count({ where: { userId, type: 'ANNOUNCEMENT' } });
  const [dBefore, aBefore] = [await count(sD.user.id), await count(sA.user.id)];

  const r = await admin.post(`${A}/announcements`, { title: 'Holiday notice', body: 'No classes on Friday.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = await prisma.announcement.findUniqueOrThrow({ where: { id: r.body.data.id } });
  assert.equal(a.batchId, null);
  assert.equal(await auditCount('announcement.posted', a.id), 1);
  assert.equal(await count(sD.user.id), dBefore + 1, 'active student notified');
  assert.equal(await count(sA.user.id), aBefore, 'completed enrollment not notified');

  const b = await admin.post(`${A}/announcements`, { title: 'Batch update', body: 'Room changed.', batchId: batch2 });
  assert.equal(b.status, 201);
  assert.equal((await prisma.announcement.findUniqueOrThrow({ where: { id: b.body.data.id } })).batchId, batch2);
  assert.equal(await count(sD.user.id), dBefore + 2);

  assert.equal((await admin.post(`${A}/announcements`, { title: 'Ghost batch', body: 'Nobody.', batchId: MISSING })).status, 404);
  assert.equal((await admin.post(`${A}/announcements`, { title: 'x', body: 'Too short title' })).status, 422);
  assert.equal((await admin.post(`${A}/announcements`, { title: 'Bad batch id', body: 'Body text', batchId: 'nope' })).status, 422);
  assert.equal((await finance.post(`${A}/announcements`, { title: 'No permission', body: 'Body text' })).status, 403);
  assert.equal((await trainer.post(`${A}/announcements`, { title: 'Trainer via admin', body: 'Body text' })).status, 403);
});

test('GET /support + PUT /support/:id: student request listed, response saved, student notified, audited', async () => {
  const created = await sA.client.post('/api/training/student/support', { subject: 'Invoice question', message: 'My invoice shows the wrong name.' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id as string;

  const list = await admin.get(`${A}/support?status=OPEN`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.some((s: { id: string }) => s.id === id));
  assert.equal((await admin.get(`${A}/support?status=WAITING`)).status, 422);
  assert.equal((await finance.get(`${A}/support`)).status, 403);

  const notesBefore = await prisma.notification.count({ where: { userId: sA.user.id, type: 'SUPPORT' } });
  const r = await admin.put(`${A}/support/${id}`, { status: 'RESOLVED', response: 'Corrected and re-sent.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await prisma.supportRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, 'RESOLVED');
  assert.equal(row.response, 'Corrected and re-sent.');
  assert.equal(row.respondedById, adminId);
  assert.equal(await auditCount('support.updated', id), 1);
  assert.equal(await prisma.notification.count({ where: { userId: sA.user.id, type: 'SUPPORT' } }), notesBefore + 1);
  // The student sees the response
  const mine = await sA.client.get('/api/training/student/support');
  assert.equal(mine.body.data.find((s: { id: string }) => s.id === id).response, 'Corrected and re-sent.');

  assert.equal((await admin.put(`${A}/support/${id}`, { status: 'OPEN' })).status, 422, 'cannot set back to OPEN');
  assert.equal((await admin.put(`${A}/support/${MISSING}`, { status: 'CLOSED' })).status, 404);
  assert.equal((await finance.put(`${A}/support/${id}`, { status: 'CLOSED' })).status, 403);
  assert.equal((await sA.client.put(`${A}/support/${id}`, { status: 'CLOSED' })).status, 403);
});

// ---- Referrals -----------------------------------------------------------------------------

test('GET /referrals/settings: FINANCE and ADMIN read; TRAINER 403', async () => {
  const r = await finance.get(`${A}/referrals/settings`);
  assert.equal(r.status, 200);
  assert.equal(typeof r.body.data.rewardAmountPaise, 'number');
  assert.equal((await admin.get(`${A}/referrals/settings`)).status, 200);
  assert.equal((await trainer.get(`${A}/referrals/settings`)).status, 403);
  assert.equal((await anon.get(`${A}/referrals/settings`)).status, 401);
});

test('PATCH /referrals/codes/:id/status: disable/enable audited; FINANCE 403 (settings is admin-only); 422; 404', async () => {
  const code = await prisma.referralCode.create({ data: { userId: sA.user.id, code: uniq('REF').toUpperCase().slice(0, 12) } });
  assert.equal((await finance.patch(`${A}/referrals/codes/${code.id}/status`, { status: 'DISABLED', reason: 'Finance try' })).status, 403);
  const r = await admin.patch(`${A}/referrals/codes/${code.id}/status`, { status: 'DISABLED', reason: 'Shared publicly on coupon site' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await prisma.referralCode.findUniqueOrThrow({ where: { id: code.id } })).status, 'DISABLED');
  assert.equal(await auditCount('referral.code_disabled', code.id), 1);
  assert.equal((await admin.patch(`${A}/referrals/codes/${code.id}/status`, { status: 'ACTIVE', reason: 'Reviewed' })).status, 200);
  assert.equal((await prisma.referralCode.findUniqueOrThrow({ where: { id: code.id } })).status, 'ACTIVE');

  assert.equal((await admin.patch(`${A}/referrals/codes/${code.id}/status`, { status: 'BANNED', reason: 'Bad status' })).status, 422);
  assert.equal((await admin.patch(`${A}/referrals/codes/${code.id}/status`, { status: 'DISABLED' })).status, 422);
  assert.equal((await admin.patch(`${A}/referrals/codes/${MISSING}/status`, { status: 'DISABLED', reason: 'Missing' })).status, 404);
});

// ---- Audit ---------------------------------------------------------------------------------

test('GET /audit: filters by entity and actor; FINANCE 403 (audit.read is admin-only); 422 bad actorId', async () => {
  const r = await admin.get(`${A}/audit?entityType=Enrollment&entityId=${enrollA}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.items.length >= 2);
  assert.ok(r.body.data.items.every((i: { entityId: string; entityType: string }) => i.entityId === enrollA && i.entityType === 'Enrollment'));
  const byActor = await admin.get(`${A}/audit?actorId=${adminId}&pageSize=5`);
  assert.equal(byActor.status, 200);
  assert.ok(byActor.body.data.items.length <= 5);
  assert.ok(byActor.body.data.items.every((i: { actorId: string }) => i.actorId === adminId));
  assert.ok(!JSON.stringify(byActor.body).includes('passwordHash'));
  assert.equal((await admin.get(`${A}/audit?actorId=not-a-uuid`)).status, 422);
  assert.equal((await finance.get(`${A}/audit`)).status, 403);
  assert.equal((await anon.get(`${A}/audit`)).status, 401);
});
