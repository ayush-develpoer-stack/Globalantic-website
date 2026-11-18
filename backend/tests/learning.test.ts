/** Trainer batch scoping, attendance audit, grading, student isolation and certificates. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyAndApprove, payApplication, prisma, registerStudent, seedCourse, startApi, staff, useFakeGateway, type Api, type Client, type FakeGateway } from './helpers';

let api: Api;
let admin: Client;
let trainerA: Client, trainerB: Client;
let trainerAId: string;
let gateway: FakeGateway;
let batchA: string, batchB: string;
let s1: Awaited<ReturnType<typeof registerStudent>>, s2: Awaited<ReturnType<typeof registerStudent>>;
let e1: string, e2: string;

before(async () => {
  api = await startApi();
  gateway = useFakeGateway();
  admin = (await staff(api.base, 'ADMIN')).client;
  const ta = await staff(api.base, 'TRAINER');
  trainerA = ta.client;
  trainerAId = ta.user.id;
  const tb = await staff(api.base, 'TRAINER');
  trainerB = tb.client;
  const a = await seedCourse();
  const b = await seedCourse();
  batchA = a.batch.id;
  batchB = b.batch.id;
  assert.equal((await admin.post(`/api/training/admin/batches/${batchA}/trainers`, { trainerId: ta.user.id })).status, 200);
  assert.equal((await admin.post(`/api/training/admin/batches/${batchB}/trainers`, { trainerId: tb.user.id })).status, 200);
  s1 = await registerStudent(api.base);
  s2 = await registerStudent(api.base);
  for (const s of [s1, s2]) {
    const app = await applyAndApprove(s.client, admin, batchA);
    await payApplication(s.client, gateway, app.id);
  }
  e1 = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1.user.id } })).id;
  e2 = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: s2.user.id } })).id;
});
after(() => api.close());

const today = () => new Date().toISOString().slice(0, 10);

test('trainer sees only assigned batches', async () => {
  const dash = await trainerA.get('/api/training/trainer/dashboard');
  assert.deepEqual(dash.body.data.batches.map((b: { id: string }) => b.id), [batchA]);
  for (const p of [`/batches/${batchB}`, `/batches/${batchB}/students`, `/batches/${batchB}/attendance?date=${today()}`, `/batches/${batchB}/assignments`, `/batches/${batchB}/report`]) {
    assert.equal((await trainerA.get(`/api/training/trainer${p}`)).status, 404, p);
  }
  assert.equal((await trainerB.get(`/api/training/trainer/enrollments/${e1}/progress`)).status, 404);
  const roster = await trainerA.get(`/api/training/trainer/batches/${batchA}/students`);
  assert.equal(roster.body.data.length, 2);
  assert.ok(!JSON.stringify(roster.body.data).includes(s1.phone), 'roster does not expose phone numbers');
  // Removing the assignment removes access immediately
  await admin.del(`/api/training/admin/batches/${batchA}/trainers/${trainerAId}`);
  assert.equal((await trainerA.get(`/api/training/trainer/batches/${batchA}`)).status, 404);
  await admin.post(`/api/training/admin/batches/${batchA}/trainers`, { trainerId: trainerAId });
});

test('attendance: unassigned trainer blocked, edits are audited, students cannot write', async () => {
  const body = { date: today(), records: [{ enrollmentId: e1, status: 'PRESENT' }, { enrollmentId: e2, status: 'ABSENT' }] };
  assert.equal((await trainerB.put(`/api/training/trainer/batches/${batchA}/attendance`, body)).status, 404);
  const ok = await trainerA.put(`/api/training/trainer/batches/${batchA}/attendance`, body);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.created, 2);
  const edit = await trainerA.put(`/api/training/trainer/batches/${batchA}/attendance`, { date: today(), records: [{ enrollmentId: e2, status: 'LATE', remarks: 'Arrived 10 min late' }] });
  assert.equal(edit.body.data.updated, 1);
  const log = await prisma.auditLog.findFirst({ where: { action: 'attendance.edited' }, orderBy: { createdAt: 'desc' } });
  assert.deepEqual(log?.before, { status: 'ABSENT', remarks: null });
  assert.deepEqual(log?.after, { status: 'LATE', remarks: 'Arrived 10 min late' });
  // Foreign enrollment ids are refused
  const other = await seedCourse();
  void other;
  const bad = await trainerA.put(`/api/training/trainer/batches/${batchA}/attendance`, { date: today(), records: [{ enrollmentId: '00000000-0000-4000-8000-000000000000', status: 'PRESENT' }] });
  assert.equal(bad.status, 422);
  // Future dates refused
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await trainerA.put(`/api/training/trainer/batches/${batchA}/attendance`, { date: future, records: [{ enrollmentId: e1, status: 'PRESENT' }] })).status, 422);
  // Students have no write route and see only their own attendance
  assert.equal((await s1.client.put(`/api/training/trainer/batches/${batchA}/attendance`, body)).status, 403);
  assert.equal((await s1.client.get(`/api/training/student/enrollments/${e2}/attendance`)).status, 404);
  const mine = await s1.client.get(`/api/training/student/enrollments/${e1}/attendance`);
  assert.equal(mine.body.data.percent, 100);
});

test('assignments: create, submit, isolation, grading limits', async () => {
  const a = await trainerA.post(`/api/training/trainer/batches/${batchA}/assignments`, {
    title: 'Build a landing page',
    description: 'Use semantic HTML.',
    dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    maxMarks: 10,
  });
  assert.equal(a.status, 201);
  assert.equal((await trainerB.post(`/api/training/trainer/batches/${batchA}/assignments`, { title: 'x x x', description: 'y y y', dueAt: new Date().toISOString(), maxMarks: 5 })).status, 404);

  const id = a.body.data.id;
  assert.equal((await s1.client.post(`/api/training/student/assignments/${id}/submission`, { linkUrl: 'javascript:alert(1)' })).status, 422, 'only https links');
  const sub = await s1.client.post(`/api/training/student/assignments/${id}/submission`, { linkUrl: 'https://github.com/example/landing' });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.data.status, 'SUBMITTED');

  // s2 cannot see s1's submission content through the assignment view
  const s2view = await s2.client.get(`/api/training/student/assignments/${id}`);
  assert.equal(s2view.body.data.submission, null);
  // An outsider (not enrolled) cannot see or submit
  const outsider = await registerStudent(api.base);
  assert.equal((await outsider.client.get(`/api/training/student/assignments/${id}`)).status, 404);
  assert.equal((await outsider.client.post(`/api/training/student/assignments/${id}/submission`, { content: 'hi' })).status, 404);

  const subs = await trainerA.get(`/api/training/trainer/assignments/${id}`);
  const subId = subs.body.data.submissions[0].id;
  assert.equal((await trainerA.post(`/api/training/trainer/submissions/${subId}/grade`, { marks: 11 })).status, 422);
  assert.equal((await trainerB.post(`/api/training/trainer/submissions/${subId}/grade`, { marks: 9 })).status, 404);
  assert.equal((await s1.client.post(`/api/training/trainer/submissions/${subId}/grade`, { marks: 10 })).status, 403, 'students cannot grade themselves');
  assert.equal((await trainerA.post(`/api/training/trainer/submissions/${subId}/grade`, { marks: 9, feedback: 'Great semantics' })).status, 200);
  const graded = await s1.client.get(`/api/training/student/assignments/${id}`);
  assert.equal(graded.body.data.submission.marks, 9);
  assert.equal((await s1.client.post(`/api/training/student/assignments/${id}/submission`, { content: 'changed' })).status, 409, 'graded work is locked');
});

test('results stay hidden until published; materials and announcements reach students', async () => {
  const a = await trainerA.post(`/api/training/trainer/batches/${batchA}/assessments`, { title: 'Final exam', type: 'FINAL', maxMarks: 100, passMarks: 40 });
  assert.equal(a.status, 201);
  const save = await trainerA.put(`/api/training/trainer/assessments/${a.body.data.id}/results`, { rows: [{ enrollmentId: e1, marks: 72 }, { enrollmentId: e2, marks: 30 }] });
  assert.equal(save.status, 200);
  assert.equal((await s1.client.get('/api/training/student/results')).body.data.length, 0);
  await trainerA.post(`/api/training/trainer/assessments/${a.body.data.id}/publish`);
  const res = await s1.client.get('/api/training/student/results');
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].marks, 72);
  assert.equal(res.body.data[0].passed, true);

  assert.equal((await trainerA.post(`/api/training/trainer/batches/${batchA}/materials`, { title: 'Slides', url: 'http://insecure.example' })).status, 422);
  assert.equal((await trainerA.post(`/api/training/trainer/batches/${batchA}/materials`, { title: 'Slides week 1', url: 'https://example.com/slides.pdf', type: 'DOCUMENT' })).status, 201);
  assert.equal((await s1.client.get('/api/training/student/materials')).body.data.length, 1);
  assert.equal((await trainerA.post(`/api/training/trainer/batches/${batchA}/announcements`, { title: 'No class Friday', body: 'Holiday on Friday.' })).status, 201);
  assert.equal((await trainerB.post(`/api/training/trainer/batches/${batchA}/announcements`, { title: 'Spam spam', body: 'not my batch' })).status, 404);
  const ann = await s1.client.get('/api/training/student/announcements');
  assert.ok(ann.body.data.some((x: { title: string }) => x.title === 'No class Friday'));
});

test('certificates: issued only when eligible, never by the student, verifiable publicly', async () => {
  // Not finished yet -> not eligible
  const elig = await admin.get(`/api/training/admin/enrollments/${e1}/certificate-eligibility`);
  assert.equal(elig.body.data.eligible, false);
  assert.ok(elig.body.data.reasons.some((r: string) => /not been completed/.test(r)));
  assert.equal((await admin.post(`/api/training/admin/enrollments/${e1}/certificate`)).status, 409);
  assert.equal((await s1.client.post(`/api/training/admin/enrollments/${e1}/certificate`)).status, 403);

  await prisma.batch.update({ where: { id: batchA }, data: { status: 'COMPLETED', endDate: new Date(Date.now() - 1000) } });
  // s2 failed the FINAL -> still ineligible
  const e2elig = await admin.get(`/api/training/admin/enrollments/${e2}/certificate-eligibility`);
  assert.equal(e2elig.body.data.eligible, false);
  assert.ok(e2elig.body.data.reasons.some((r: string) => /not passed/.test(r)));

  const issued = await admin.post(`/api/training/admin/enrollments/${e1}/certificate`);
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  assert.equal((await admin.post(`/api/training/admin/enrollments/${e1}/certificate`)).status, 409, 'only once');
  const list = await s1.client.get('/api/training/student/certificates');
  const cert = list.body.data.find((c: { enrollmentId: string }) => c.enrollmentId === e1).certificate;
  assert.ok(cert);
  assert.equal((await s2.client.get(`/api/training/student/certificates/${cert.id}`)).status, 404);
  const verify = await s2.client.get(`/api/training/certificates/verify/${cert.verificationCode}`);
  assert.equal(verify.body.data.valid, true);
  assert.equal(verify.body.data.studentName, s1.user.name);
  assert.equal((await s2.client.get('/api/training/certificates/verify/NOTAREALCODE')).body.data.valid, false);
});

test('batch report contains learning data only', async () => {
  const report = await trainerA.get(`/api/training/trainer/batches/${batchA}/report`);
  assert.equal(report.status, 200);
  const json = JSON.stringify(report.body.data);
  assert.ok(!/amountPaise|phone|payment/i.test(json));
  assert.equal(report.body.data.rows.length, 2);
});
