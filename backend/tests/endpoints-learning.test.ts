/**
 * Endpoint coverage for the student and trainer portals and the public batch/referral
 * lookups that no other test file exercised (found with scripts/api-inventory.ts).
 * Each route: success + persistence, 401/403, cross-account isolation, 422, 404.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, applyAndApprove, payApplication, prisma, registerStudent, seedCourse, startApi, staff, uniq, useFakeGateway, type Api, type FakeGateway } from './helpers';

let api: Api;
let anon: Client;
let admin: Client;
let trainerA: Client, trainerB: Client;
let trainerAId: string;
let gateway: FakeGateway;
let courseA: string, batchA: string, batchB: string;
let s1: Awaited<ReturnType<typeof registerStudent>>, s2: Awaited<ReturnType<typeof registerStudent>>, outsider: Awaited<ReturnType<typeof registerStudent>>;
let e1: string, e2: string;

const NOPE = '00000000-0000-4000-8000-000000000000';
const S = '/api/training/student';
const T = '/api/training/trainer';
const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  api = await startApi();
  anon = new Client(api.base);
  gateway = useFakeGateway();
  admin = (await staff(api.base, 'ADMIN')).client;
  const ta = await staff(api.base, 'TRAINER');
  const tb = await staff(api.base, 'TRAINER');
  trainerA = ta.client;
  trainerB = tb.client;
  trainerAId = ta.user.id;
  const a = await seedCourse();
  const b = await seedCourse();
  courseA = a.course.id;
  batchA = a.batch.id;
  batchB = b.batch.id;
  assert.equal((await admin.post(`/api/training/admin/batches/${batchA}/trainers`, { trainerId: ta.user.id })).status, 200);
  assert.equal((await admin.post(`/api/training/admin/batches/${batchB}/trainers`, { trainerId: tb.user.id })).status, 200);
  await prisma.batchSchedule.create({ data: { batchId: batchA, dayOfWeek: 2, startTime: '10:00', endTime: '12:00', topic: 'HTML basics' } });
  s1 = await registerStudent(api.base);
  s2 = await registerStudent(api.base);
  outsider = await registerStudent(api.base);
  for (const s of [s1, s2]) {
    const app = await applyAndApprove(s.client, admin, batchA);
    await payApplication(s.client, gateway, app.id);
  }
  e1 = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1.user.id } })).id;
  e2 = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: s2.user.id } })).id;
});
after(() => api.close());

// ---- Access control shared by every portal route ------------------------------

test('student and trainer portals: 401 without a session, 403 for the other role', async () => {
  for (const p of [`${S}/dashboard`, `${S}/profile`, `${S}/timetable`, `${S}/assignments`, `${S}/assessments`, `${S}/feedback`, `${S}/support`]) {
    assert.equal((await anon.get(p)).status, 401, p);
    assert.equal((await trainerA.get(p)).status, 403, p);
  }
  for (const p of [`${T}/batches/${batchA}`, `${T}/batches/${batchA}/attendance/history`, `${T}/batches/${batchA}/materials`, `${T}/enrollments/${e1}/progress`]) {
    assert.equal((await anon.get(p)).status, 401, p);
    assert.equal((await s1.client.get(p)).status, 403, p);
  }
  assert.equal((await anon.put(`${S}/profile`, { city: 'Bhopal' })).status, 401);
  assert.equal((await s1.client.post(`${T}/enrollments/${e1}/feedback`, { content: 'I grade myself' })).status, 403);
});

// ---- Student portal ------------------------------------------------------------

test('GET /student/dashboard, /timetable, /assignments, /assessments reflect the enrolled batch', async () => {
  const dash = await s1.client.get(`${S}/dashboard`);
  assert.equal(dash.status, 200);
  assert.ok(JSON.stringify(dash.body.data).includes(batchA));

  const tt = await s1.client.get(`${S}/timetable`);
  assert.equal(tt.status, 200);
  assert.equal(tt.body.data.length, 1);
  assert.equal(tt.body.data[0].topic, 'HTML basics');
  assert.equal(tt.body.data[0].batchId, batchA);
  assert.deepEqual((await outsider.client.get(`${S}/timetable`)).body.data, [], 'not enrolled -> empty timetable');

  const asg = await trainerA.post(`${T}/batches/${batchA}/assignments`, { title: 'Portfolio page', description: 'Build it.', dueAt: new Date(Date.now() + 86_400_000).toISOString(), maxMarks: 10 });
  assert.equal(asg.status, 201);
  const list = await s1.client.get(`${S}/assignments`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string; submission: unknown }) => x.id === asg.body.data.id && x.submission === null));
  assert.deepEqual((await outsider.client.get(`${S}/assignments`)).body.data, []);

  const asm = await trainerA.post(`${T}/batches/${batchA}/assessments`, { title: 'Quiz 1', type: 'QUIZ', maxMarks: 20, passMarks: 8 });
  assert.equal(asm.status, 201);
  const assessments = await s1.client.get(`${S}/assessments`);
  assert.equal(assessments.status, 200);
  assert.ok(assessments.body.data.some((x: { id: string }) => x.id === asm.body.data.id));
  assert.deepEqual((await outsider.client.get(`${S}/assessments`)).body.data, []);
});

test('GET/PUT /student/profile: partial update persists; invalid input -> 422; email/phone not editable', async () => {
  const before = await s1.client.get(`${S}/profile`);
  assert.equal(before.status, 200);
  assert.equal(before.body.data.email, s1.email.toLowerCase());

  const upd = await s1.client.put(`${S}/profile`, { city: 'Bhopal', qualification: 'B.Sc', graduationYear: 2024, dateOfBirth: '2002-05-01' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const row = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s1.user.id } });
  assert.equal(row.city, 'Bhopal');
  assert.equal(row.graduationYear, 2024);
  assert.equal(row.dateOfBirth?.toISOString().slice(0, 10), '2002-05-01');
  assert.equal((await s1.client.get(`${S}/profile`)).body.data.studentProfile.qualification, 'B.Sc');

  // Clearing a field
  assert.equal((await s1.client.put(`${S}/profile`, { city: null })).status, 200);
  assert.equal((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s1.user.id } })).city, null);

  for (const bad of [{ graduationYear: 1800 }, { dateOfBirth: '01/05/2002' }, { name: 'x' }]) {
    const r = await s1.client.put(`${S}/profile`, bad);
    assert.equal(r.status, 422, JSON.stringify(bad));
  }
  // Unknown fields (email) are stripped, never applied
  await s1.client.put(`${S}/profile`, { email: 'hijack@example.test' });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: s1.user.id } })).email, s1.email.toLowerCase());
  // s2's profile untouched by s1's edits
  assert.equal((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: s2.user.id } })).city, null);
});

test('GET /student/enrollments/:id: own only; other student 404; bad id 422; unknown 404', async () => {
  const own = await s1.client.get(`${S}/enrollments/${e1}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.id, e1);
  assert.equal(own.body.data.batchId, batchA);
  assert.ok('progress' in own.body.data);
  assert.equal((await s1.client.get(`${S}/enrollments/${e2}`)).status, 404, 'cannot read another student by changing the id');
  assert.equal((await s1.client.get(`${S}/enrollments/not-a-uuid`)).status, 422);
  assert.equal((await s1.client.get(`${S}/enrollments/${NOPE}`)).status, 404);
});

test('POST /student/notifications/read: marks only the caller\'s notifications', async () => {
  await trainerA.post(`${T}/batches/${batchA}/announcements`, { title: 'Room change', body: 'We move to lab 2.' });
  const mine = await prisma.notification.findMany({ where: { userId: s1.user.id, readAt: null } });
  const theirs = await prisma.notification.findMany({ where: { userId: s2.user.id, readAt: null } });
  assert.ok(mine.length >= 1 && theirs.length >= 1);

  // s1 tries to mark s2's notification: nothing happens
  const cross = await s1.client.post(`${S}/notifications/read`, { ids: [theirs[0].id] });
  assert.equal(cross.status, 200);
  assert.equal(cross.body.data.updated, 0);
  assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: theirs[0].id } })).readAt, null);

  const one = await s1.client.post(`${S}/notifications/read`, { ids: [mine[0].id] });
  assert.equal(one.body.data.updated, 1);
  assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: mine[0].id } })).readAt);

  const all = await s1.client.post(`${S}/notifications/read`, { ids: 'all' });
  assert.equal(all.status, 200);
  assert.equal(await prisma.notification.count({ where: { userId: s1.user.id, readAt: null } }), 0);
  assert.ok((await prisma.notification.count({ where: { userId: s2.user.id, readAt: null } })) >= 1, 'other users untouched');

  for (const bad of [{}, { ids: [] }, { ids: ['nope'] }, { ids: 'some' }]) {
    assert.equal((await s1.client.post(`${S}/notifications/read`, bad)).status, 422, JSON.stringify(bad));
  }
});

test('GET /student/invoices/:id: own invoice only', async () => {
  const inv1 = await prisma.invoice.findFirstOrThrow({ where: { studentId: s1.user.id } });
  const inv2 = await prisma.invoice.findFirstOrThrow({ where: { studentId: s2.user.id } });
  const own = await s1.client.get(`${S}/invoices/${inv1.id}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.id, inv1.id);
  assert.equal(own.body.data.student.email, s1.email.toLowerCase());
  assert.equal((await s1.client.get(`${S}/invoices/${inv2.id}`)).status, 404);
  assert.equal((await outsider.client.get(`${S}/invoices/${inv1.id}`)).status, 404);
  assert.equal((await s1.client.get(`${S}/invoices/123`)).status, 422);
  assert.equal((await s1.client.get(`${S}/invoices/${NOPE}`)).status, 404);
});

test('GET /student/certificates/:id: own issued certificate only; revoked -> 404', async () => {
  const cert = await prisma.certificate.create({
    data: {
      certificateNumber: uniq('GA-CERT-'),
      verificationCode: uniq('V').toUpperCase().slice(0, 16),
      enrollmentId: e1,
      studentId: s1.user.id,
      courseId: courseA,
      batchId: batchA,
      attendancePercent: 90,
      issuedById: trainerAId,
    },
  });
  const own = await s1.client.get(`${S}/certificates/${cert.id}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.id, cert.id);
  assert.equal(own.body.data.student.name, s1.user.name);
  assert.equal((await s2.client.get(`${S}/certificates/${cert.id}`)).status, 404);
  assert.equal((await s1.client.get(`${S}/certificates/x`)).status, 422);
  await prisma.certificate.update({ where: { id: cert.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'test' } });
  assert.equal((await s1.client.get(`${S}/certificates/${cert.id}`)).status, 404, 'revoked certificates are not served');
});

test('GET/POST /student/support: creates a request, lists own requests only', async () => {
  const r = await s1.client.post(`${S}/support`, { subject: 'Change my phone', message: 'Please update my phone number to the new one.' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = await prisma.supportRequest.findUniqueOrThrow({ where: { id: r.body.data.id } });
  assert.equal(row.studentId, s1.user.id);
  assert.equal(row.status, 'OPEN');
  const list = await s1.client.get(`${S}/support`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string }) => x.id === row.id));
  assert.ok(!(await s2.client.get(`${S}/support`)).body.data.some((x: { id: string }) => x.id === row.id), 's2 cannot see s1 requests');
  for (const bad of [{ subject: 'Hi', message: 'Please update my phone number.' }, { subject: 'Valid subject', message: 'short' }, {}]) {
    assert.equal((await s1.client.post(`${S}/support`, bad)).status, 422, JSON.stringify(bad));
  }
  // A client-sent studentId is ignored
  const spoof = await s2.client.post(`${S}/support`, { subject: 'Spoofed', message: 'Trying to post as someone else.', studentId: s1.user.id });
  assert.equal((await prisma.supportRequest.findUniqueOrThrow({ where: { id: spoof.body.data.id } })).studentId, s2.user.id);
});

// ---- Trainer portal --------------------------------------------------------------

test('GET /trainer/batches/:batchId: assigned trainer only', async () => {
  const r = await trainerA.get(`${T}/batches/${batchA}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, batchA);
  assert.equal(r.body.data._count.enrollments, 2);
  assert.equal((await trainerB.get(`${T}/batches/${batchA}`)).status, 404);
  assert.equal((await trainerA.get(`${T}/batches/not-a-uuid`)).status, 422);
  assert.equal((await trainerA.get(`${T}/batches/${NOPE}`)).status, 404);
});

test('GET /trainer/batches/:batchId/attendance (+ /history) reflect saved attendance', async () => {
  const save = await trainerA.put(`${T}/batches/${batchA}/attendance`, { date: today(), records: [{ enrollmentId: e1, status: 'PRESENT' }, { enrollmentId: e2, status: 'ABSENT' }] });
  assert.equal(save.status, 200);
  const day = await trainerA.get(`${T}/batches/${batchA}/attendance?date=${today()}`);
  assert.equal(day.status, 200);
  const byId = Object.fromEntries(day.body.data.map((r: { enrollmentId: string; status: string }) => [r.enrollmentId, r.status]));
  assert.deepEqual(byId, { [e1]: 'PRESENT', [e2]: 'ABSENT' });
  assert.equal((await trainerA.get(`${T}/batches/${batchA}/attendance`)).status, 422, 'date is required');
  assert.equal((await trainerA.get(`${T}/batches/${batchA}/attendance?date=17-10-2026`)).status, 422);

  const hist = await trainerA.get(`${T}/batches/${batchA}/attendance/history`);
  assert.equal(hist.status, 200);
  assert.deepEqual(hist.body.data.find((h: { date: string }) => h.date === today()).counts, { PRESENT: 1, ABSENT: 1 });
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/attendance/history`)).status, 404);
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/attendance?date=${today()}`)).status, 404);
});

test('GET /trainer/batches/:batchId/assignments and PUT /trainer/assignments/:id', async () => {
  const a = await trainerA.post(`${T}/batches/${batchA}/assignments`, { title: 'CSS grid', description: 'Lay out a page.', dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), maxMarks: 10 });
  const id = a.body.data.id;
  const list = await trainerA.get(`${T}/batches/${batchA}/assignments`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string }) => x.id === id));
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/assignments`)).status, 404);

  const upd = await trainerA.put(`${T}/assignments/${id}`, { title: 'CSS grid layout', maxMarks: 20 });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const row = await prisma.assignment.findUniqueOrThrow({ where: { id } });
  assert.equal(row.title, 'CSS grid layout');
  assert.equal(row.maxMarks, 20);
  assert.equal(row.description, 'Lay out a page.', 'partial update keeps other fields');

  assert.equal((await trainerB.put(`${T}/assignments/${id}`, { title: 'Hijacked title' })).status, 404);
  assert.equal((await trainerA.put(`${T}/assignments/${id}`, { title: 'x' })).status, 422);
  assert.equal((await trainerA.put(`${T}/assignments/${NOPE}`, { title: 'Valid title' })).status, 404);
  assert.equal((await s1.client.put(`${T}/assignments/${id}`, { title: 'Student edit' })).status, 403);

  // Lowering max marks below an existing grade is a conflict
  await s1.client.post(`${S}/assignments/${id}/submission`, { linkUrl: 'https://github.com/example/grid' });
  const sub = await prisma.assignmentSubmission.findFirstOrThrow({ where: { assignmentId: id } });
  assert.equal((await trainerA.post(`${T}/submissions/${sub.id}/grade`, { marks: 15 })).status, 200);
  assert.equal((await trainerA.put(`${T}/assignments/${id}`, { maxMarks: 10 })).status, 409);
  assert.equal((await prisma.assignment.findUniqueOrThrow({ where: { id } })).maxMarks, 20);
});

test('GET /trainer/batches/:batchId/materials and DELETE /trainer/materials/:id (soft delete)', async () => {
  const m = await trainerA.post(`${T}/batches/${batchA}/materials`, { title: 'Week 2 slides', url: 'https://example.com/w2.pdf', type: 'DOCUMENT' });
  assert.equal(m.status, 201);
  const id = m.body.data.id;
  const list = await trainerA.get(`${T}/batches/${batchA}/materials`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string }) => x.id === id));
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/materials`)).status, 404);

  assert.equal((await trainerB.del(`${T}/materials/${id}`)).status, 404, 'other trainer cannot delete');
  assert.equal((await s1.client.del(`${T}/materials/${id}`)).status, 403);
  assert.equal((await prisma.learningMaterial.findUniqueOrThrow({ where: { id } })).deletedAt, null);

  const del = await trainerA.del(`${T}/materials/${id}`);
  assert.equal(del.status, 200);
  assert.ok((await prisma.learningMaterial.findUniqueOrThrow({ where: { id } })).deletedAt, 'row kept, marked deleted');
  assert.ok(!(await trainerA.get(`${T}/batches/${batchA}/materials`)).body.data.some((x: { id: string }) => x.id === id));
  assert.ok(!(await s1.client.get(`${S}/materials`)).body.data.some((x: { id: string }) => x.id === id));
  assert.equal((await trainerA.del(`${T}/materials/${id}`)).status, 404, 'second delete -> 404');
  assert.equal((await trainerA.del(`${T}/materials/bad`)).status, 422);
});

test('GET /trainer/batches/:batchId/announcements and /assessments', async () => {
  await trainerA.post(`${T}/batches/${batchA}/announcements`, { title: 'Exam on Monday', body: 'Revise chapters 1-3.' });
  const ann = await trainerA.get(`${T}/batches/${batchA}/announcements`);
  assert.equal(ann.status, 200);
  assert.ok(ann.body.data.some((x: { title: string; batchId: string }) => x.title === 'Exam on Monday' && x.batchId === batchA));
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/announcements`)).status, 404);

  const asm = await trainerA.post(`${T}/batches/${batchA}/assessments`, { title: 'Mid term', type: 'TEST', maxMarks: 50, passMarks: 20 });
  const list = await trainerA.get(`${T}/batches/${batchA}/assessments`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string }) => x.id === asm.body.data.id));
  assert.equal((await trainerB.get(`${T}/batches/${batchA}/assessments`)).status, 404);
});

test('GET /trainer/assessments/:id/results returns the roster with saved marks', async () => {
  const asm = await trainerA.post(`${T}/batches/${batchA}/assessments`, { title: 'Practical', type: 'PROJECT', maxMarks: 10, passMarks: 4 });
  const id = asm.body.data.id;
  await trainerA.put(`${T}/assessments/${id}/results`, { rows: [{ enrollmentId: e1, marks: 7 }] });
  const r = await trainerA.get(`${T}/assessments/${id}/results`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.assessment.id, id);
  const marks = Object.fromEntries(r.body.data.rows.map((x: { enrollmentId: string; marks: number | null }) => [x.enrollmentId, x.marks]));
  assert.deepEqual(marks, { [e1]: 7, [e2]: null });
  assert.equal((await trainerB.get(`${T}/assessments/${id}/results`)).status, 404);
  assert.equal((await trainerA.get(`${T}/assessments/${NOPE}/results`)).status, 404);
  assert.equal((await trainerA.get(`${T}/assessments/zzz/results`)).status, 422);
});

test('GET /trainer/enrollments/:id/progress and POST /trainer/enrollments/:id/feedback', async () => {
  const prog = await trainerA.get(`${T}/enrollments/${e1}/progress`);
  assert.equal(prog.status, 200);
  assert.equal(prog.body.data.student.id, s1.user.id);
  assert.ok('progress' in prog.body.data);
  assert.equal((await trainerB.get(`${T}/enrollments/${e1}/progress`)).status, 404);
  assert.equal((await trainerA.get(`${T}/enrollments/${NOPE}/progress`)).status, 404);

  const fb = await trainerA.post(`${T}/enrollments/${e1}/feedback`, { content: 'Good progress on layouts.', rating: 4 });
  assert.equal(fb.status, 201, JSON.stringify(fb.body));
  const row = await prisma.feedback.findUniqueOrThrow({ where: { id: fb.body.data.id } });
  assert.equal(row.studentId, s1.user.id);
  assert.equal(row.trainerId, trainerAId);
  assert.equal(row.rating, 4);
  // The student sees it (GET /student/feedback); the other student does not
  const seen = await s1.client.get(`${S}/feedback`);
  assert.equal(seen.status, 200);
  assert.ok(seen.body.data.some((x: { id: string }) => x.id === row.id));
  assert.ok(!(await s2.client.get(`${S}/feedback`)).body.data.some((x: { id: string }) => x.id === row.id));
  assert.ok((await prisma.notification.count({ where: { userId: s1.user.id, type: 'FEEDBACK' } })) >= 1);

  assert.equal((await trainerB.post(`${T}/enrollments/${e1}/feedback`, { content: 'Not my student' })).status, 404);
  assert.equal((await trainerA.post(`${T}/enrollments/${e1}/feedback`, { content: 'ok' })).status, 422);
  assert.equal((await trainerA.post(`${T}/enrollments/${e1}/feedback`, { content: 'Valid content', rating: 9 })).status, 422);
  assert.equal((await trainerA.post(`${T}/enrollments/${NOPE}/feedback`, { content: 'Nobody here' })).status, 404);
});

// ---- Public training lookups --------------------------------------------------------

test('GET /api/training/batches lists open batches of published courses; filters validated', async () => {
  const all = await anon.get('/api/training/batches');
  assert.equal(all.status, 200);
  const ids = all.body.data.items.map((b: { id: string }) => b.id);
  assert.ok(ids.includes(batchA) && ids.includes(batchB));

  const filtered = await anon.get(`/api/training/batches?courseId=${courseA}`);
  assert.deepEqual(filtered.body.data.items.map((b: { id: string }) => b.id), [batchA]);

  const done = await seedCourse();
  await prisma.batch.update({ where: { id: done.batch.id }, data: { status: 'COMPLETED' } });
  assert.ok(!(await anon.get('/api/training/batches')).body.data.items.some((b: { id: string }) => b.id === done.batch.id), 'completed batches hidden');
  const draft = await seedCourse();
  await prisma.course.update({ where: { id: draft.course.id }, data: { status: 'DRAFT' } });
  assert.ok(!(await anon.get('/api/training/batches')).body.data.items.some((b: { id: string }) => b.id === draft.batch.id), 'unpublished course hidden');

  assert.equal((await anon.get('/api/training/batches?courseId=abc')).status, 422);
  assert.equal((await anon.get('/api/training/batches?status=CANCELLED')).status, 422);
});

test('GET /api/training/referrals/validate/:code', async () => {
  const dash = await s1.client.get(`${S}/referrals`);
  const code = dash.body.data.code as string;
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.deepEqual((await anon.get(`/api/training/referrals/validate/${code}`)).body.data, { valid: true });
  assert.deepEqual((await anon.get(`/api/training/referrals/validate/${code.toLowerCase()}`)).body.data, { valid: true }, 'case-insensitive');
  assert.deepEqual((await anon.get('/api/training/referrals/validate/ZZZZZZZZ')).body.data, { valid: false });
  await prisma.referralCode.update({ where: { code }, data: { status: 'DISABLED' } });
  assert.deepEqual((await anon.get(`/api/training/referrals/validate/${code}`)).body.data, { valid: false }, 'disabled code');
  assert.equal((await anon.get('/api/training/referrals/validate/ab')).status, 422);
  assert.equal((await anon.get('/api/training/referrals/validate/bad-code!')).status, 422);
});
