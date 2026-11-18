/**
 * Endpoint coverage for routes the module suites did not reach: exam question bank and
 * assignments, certificate-program admin/student reads, business clients/templates,
 * employee self-service lists, and HR lists/updates. Each route: success + persistence,
 * auth (401/403), ownership, validation (422), missing records (404), invalid transitions.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  Client,
  PASSWORD,
  checkoutSignature,
  login,
  prisma,
  registerStudent,
  startApi,
  staff,
  testOutbox,
  tokenFromOutbox,
  uniq,
  useFakeGateway,
  type Api,
  type FakeGateway,
} from './helpers';

let api: Api;
let admin: Client;
let hr: Client;
let finance: Client;
let sales: Client;
let gateway: FakeGateway;
const MISSING = '00000000-0000-4000-8000-000000000000';

before(async () => {
  api = await startApi();
  gateway = useFakeGateway();
  admin = (await staff(api.base, 'ADMIN')).client;
  hr = (await staff(api.base, 'HR')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  sales = (await staff(api.base, 'SALES')).client;
});
after(() => api.close());

const anon = () => new Client(api.base);

// ============================================================================
// Exams: question bank, archive, targets, assignment removal
// ============================================================================
const XA = '/api/exams/admin';

async function examQuestion(prompt: string, track = 'MARKETING') {
  const r = await hr.post(`${XA}/questions`, { track, topic: 'Coverage', type: 'SINGLE_CHOICE', marks: 1, prompt, options: [{ text: 'Right', correct: true }, { text: 'Wrong' }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data as { id: string };
}

async function exam(questionIds: string[]) {
  const r = await hr.post(`${XA}/exams`, { title: 'Coverage exam', instructions: 'Answer every question carefully.', track: 'MARKETING', durationMinutes: 30, passPercent: 50, maxAttempts: 1 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (questionIds.length) assert.equal((await hr.put(`${XA}/exams/${r.body.data.id}/questions`, { questionIds })).status, 200);
  return r.body.data.id as string;
}

test('exams: GET /questions lists, filters and validates; archived are listed separately', async () => {
  const q = await examQuestion(`Bank question ${uniq()}`, 'SALES');
  const list = await hr.get(`${XA}/questions?track=SALES&topic=Coverage`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.some((x: { id: string }) => x.id === q.id));
  assert.ok(list.body.data.items.every((x: { track: string }) => x.track === 'SALES'));
  assert.equal((await hr.get(`${XA}/questions?track=NOPE`)).status, 422);
  assert.equal((await anon().get(`${XA}/questions`)).status, 401);
  assert.equal((await finance.get(`${XA}/questions`)).status, 403);

  // PATCH archive: a soft state change; restore brings it back.
  const arch = await hr.patch(`${XA}/questions/${q.id}/archive`, { archived: true });
  assert.equal(arch.status, 200);
  const row = await prisma.examQuestion.findUnique({ where: { id: q.id } });
  assert.ok(row?.archivedAt, 'row kept with archivedAt');
  assert.ok(!(await hr.get(`${XA}/questions?track=SALES`)).body.data.items.some((x: { id: string }) => x.id === q.id));
  assert.ok((await hr.get(`${XA}/questions?archived=true`)).body.data.items.some((x: { id: string }) => x.id === q.id));
  assert.equal((await hr.patch(`${XA}/questions/${q.id}/archive`, { archived: 'yes' })).status, 422);
  assert.equal((await hr.patch(`${XA}/questions/${MISSING}/archive`, { archived: true })).status, 404);
  assert.equal((await hr.patch(`${XA}/questions/${q.id}/archive`, { archived: false })).status, 200);
  assert.equal((await prisma.examQuestion.findUniqueOrThrow({ where: { id: q.id } })).archivedAt, null);
});

test('exams: GET/PUT /questions/:id — read, update, 404, 422, locked once published', async () => {
  const q = await examQuestion('What is a lead magnet?');
  const one = await hr.get(`${XA}/questions/${q.id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.locked, false);
  assert.equal((await hr.get(`${XA}/questions/${MISSING}`)).status, 404);
  assert.equal((await hr.get(`${XA}/questions/not-a-uuid`)).status, 422);
  assert.equal((await sales.get(`${XA}/questions/${q.id}`)).status, 403);

  const body = { track: 'MARKETING', topic: 'Coverage', type: 'SINGLE_CHOICE', marks: 2, prompt: 'What is a lead magnet, exactly?', options: [{ text: 'A free offer for contact details', correct: true }, { text: 'A sales tax' }] };
  const upd = await hr.put(`${XA}/questions/${q.id}`, body);
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const saved = await prisma.examQuestion.findUniqueOrThrow({ where: { id: q.id } });
  assert.equal(saved.prompt, 'What is a lead magnet, exactly?');
  assert.equal(saved.marks, 2);
  assert.equal((await hr.put(`${XA}/questions/${q.id}`, { ...body, options: [{ text: 'Only one' }] })).status, 422);
  assert.equal((await hr.put(`${XA}/questions/${MISSING}`, body)).status, 404);

  // Used by a published exam -> locked (409), not silently changed.
  const examId = await exam([q.id]);
  assert.equal((await hr.post(`${XA}/exams/${examId}/publish`)).status, 200);
  assert.equal((await hr.get(`${XA}/questions/${q.id}`)).body.data.locked, true);
  assert.equal((await hr.put(`${XA}/questions/${q.id}`, { ...body, prompt: 'Changed after publishing?' })).status, 409);
  assert.equal((await prisma.examQuestion.findUniqueOrThrow({ where: { id: q.id } })).prompt, 'What is a lead magnet, exactly?');
});

test('exams: GET /targets, DELETE assignment, POST archive', async () => {
  const s = await registerStudent(api.base, { name: 'Targeted Learner' });
  const t = await hr.get(`${XA}/targets?search=Targeted`);
  assert.equal(t.status, 200);
  assert.ok(t.body.data.students.some((x: { id: string }) => x.id === s.user.id));
  assert.ok(Array.isArray(t.body.data.batches) && Array.isArray(t.body.data.programs));
  assert.deepEqual((await hr.get(`${XA}/targets?search=T`)).body.data.students, [], 'short searches return no students');
  assert.equal((await hr.get(`${XA}/targets?search=${'x'.repeat(101)}`)).status, 422);
  assert.equal((await s.client.get(`${XA}/targets`)).status, 403);

  const q = await examQuestion('Which channel is owned media?');
  const examId = await exam([q.id]);
  const a = await hr.post(`${XA}/exams/${examId}/assignments`, { target: 'STUDENT', studentId: s.user.id });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const assignmentId = a.body.data.id as string;
  const otherExam = await exam([]);
  assert.equal((await hr.del(`${XA}/exams/${otherExam}/assignments/${assignmentId}`)).status, 404, 'assignment must belong to the exam in the URL');
  assert.equal((await finance.del(`${XA}/exams/${examId}/assignments/${assignmentId}`)).status, 403);
  assert.equal((await hr.del(`${XA}/exams/${examId}/assignments/bad`)).status, 422);
  const del = await hr.del(`${XA}/exams/${examId}/assignments/${assignmentId}`);
  assert.equal(del.status, 200);
  assert.equal(await prisma.examAssignment.count({ where: { id: assignmentId } }), 0);
  assert.ok(await prisma.exam.findUnique({ where: { id: examId } }), 'only the assignment is removed');
  assert.equal((await hr.del(`${XA}/exams/${examId}/assignments/${assignmentId}`)).status, 404);

  const arch = await hr.post(`${XA}/exams/${examId}/archive`);
  assert.equal(arch.status, 200);
  const e = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
  assert.equal(e.status, 'ARCHIVED');
  assert.ok(e.archivedAt);
  assert.equal((await hr.post(`${XA}/exams/${examId}/archive`)).status, 200, 'archiving twice is idempotent');
  assert.equal((await hr.post(`${XA}/exams/${MISSING}/archive`)).status, 404);
  assert.equal((await sales.post(`${XA}/exams/${examId}/archive`)).status, 403);
});

// ============================================================================
// Certificate program
// ============================================================================
const PA = '/api/programs/admin';
const PS = '/api/programs/student';

interface Built {
  id: string;
  slug: string;
  lessonIds: string[];
  questions: { id: string; correctIndex: number }[];
}

async function buildProgram(publish = true): Promise<Built> {
  const slug = uniq('cov-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const c = await admin.post(`${PA}/programs`, {
    slug,
    title: 'Coverage Certificate',
    summary: 'A short program used by endpoint coverage tests.',
    description: 'Complete the lessons, then pass the assessment to earn the certificate.',
    feePaise: 99_900,
    passPercent: 50,
    maxAttempts: 3,
    timeLimitMinutes: 30,
    certificateTitle: 'Certificate of Completion',
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const b: Built = { id: c.body.data.id, slug, lessonIds: [], questions: [] };
  for (let i = 0; i < 2; i++) {
    const l = await admin.post(`${PA}/programs/${b.id}/lessons`, { title: `Lesson ${i + 1}`, body: `Lesson ${i + 1} content, long enough.`, minMinutes: 0, required: true });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    b.lessonIds.push(l.body.data.id);
  }
  for (let i = 0; i < 2; i++) {
    const q = await admin.post(`${PA}/programs/${b.id}/questions`, { prompt: `Coverage question ${i + 1}?`, options: ['A', 'B', 'C'], correctIndex: i });
    assert.equal(q.status, 201, JSON.stringify(q.body));
    b.questions.push({ id: q.body.data.id, correctIndex: i });
  }
  if (publish) assert.equal((await admin.patch(`${PA}/programs/${b.id}`, { status: 'PUBLISHED' })).status, 200);
  return b;
}

async function enroll(p: Built) {
  const s = await registerStudent(api.base);
  const r = await s.client.post(`${PS}/register`, { slug: p.slug });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { s, enrollmentId: r.body.data.id as string };
}

async function payFor(student: Client, enrollmentId: string) {
  const order = await student.post(`${PS}/payments/order`, { enrollmentId });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const paymentId = gateway.pay(order.body.data.orderId);
  const v = await student.post(`${PS}/payments/verify`, { orderId: order.body.data.orderId, paymentId, signature: checkoutSignature(order.body.data.orderId, paymentId) });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return order.body.data.orderId as string;
}

async function finishLessons(student: Client, p: Built, enrollmentId: string) {
  for (const id of p.lessonIds) {
    assert.equal((await student.get(`${PS}/enrollments/${enrollmentId}/lessons/${id}`)).status, 200);
    assert.equal((await student.post(`${PS}/enrollments/${enrollmentId}/lessons/${id}/complete`)).status, 200);
  }
}

async function startAttempt(student: Client, enrollmentId: string) {
  const start = await student.post(`${PS}/enrollments/${enrollmentId}/attempts`);
  assert.equal(start.status, 200, JSON.stringify(start.body));
  return start.body.data as { attemptId: string; questions: { id: string; options: string[] }[] };
}

let prog: Built;

test('programs: public list shows published programs only, without answer keys', async () => {
  prog = await buildProgram();
  const draft = await buildProgram(false);
  const r = await anon().get('/api/programs');
  assert.equal(r.status, 200);
  const slugs = (r.body.data as { slug: string }[]).map((x) => x.slug);
  assert.ok(slugs.includes(prog.slug));
  assert.ok(!slugs.includes(draft.slug), 'drafts are not public');
  assert.doesNotMatch(JSON.stringify(r.body), /correctIndex|Lesson 1 content/);
});

test('programs admin: GET /programs and /programs/:id (programs.read), 401/403/404/422', async () => {
  const list = await finance.get(`${PA}/programs`);
  assert.equal(list.status, 200);
  const row = (list.body.data as { id: string; _count: { lessons: number; questions: number } }[]).find((x) => x.id === prog.id);
  assert.deepEqual([row?._count.lessons, row?._count.questions], [2, 2]);
  const one = await finance.get(`${PA}/programs/${prog.id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.lessons.length, 2);
  assert.equal(one.body.data.questions.length, 2);
  assert.equal((await admin.get(`${PA}/programs/${MISSING}`)).status, 404);
  assert.equal((await admin.get(`${PA}/programs/x`)).status, 422);
  assert.equal((await anon().get(`${PA}/programs`)).status, 401);
  assert.equal((await sales.get(`${PA}/programs`)).status, 403);
});

test('programs admin: PUT lesson/question updates persist; wrong program -> 404; finance -> 403', async () => {
  const p = await buildProgram();
  const [l1] = p.lessonIds;
  const lesson = { title: 'Lesson one, revised', body: 'Revised lesson content, long enough.', minMinutes: 2, required: true };
  const r = await admin.put(`${PA}/programs/${p.id}/lessons/${l1}`, lesson);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const saved = await prisma.programLesson.findUniqueOrThrow({ where: { id: l1 } });
  assert.deepEqual([saved.title, saved.minMinutes], ['Lesson one, revised', 2]);
  assert.equal((await admin.put(`${PA}/programs/${prog.id}/lessons/${l1}`, lesson)).status, 404, 'lesson of another program');
  assert.equal((await admin.put(`${PA}/programs/${p.id}/lessons/${l1}`, { ...lesson, body: 'short' })).status, 422);
  assert.equal((await finance.put(`${PA}/programs/${p.id}/lessons/${l1}`, lesson)).status, 403);

  const [q1] = p.questions;
  const question = { prompt: 'Revised coverage question?', options: ['Yes', 'No'], correctIndex: 1, explanation: 'Because.' };
  const rq = await admin.put(`${PA}/programs/${p.id}/questions/${q1.id}`, question);
  assert.equal(rq.status, 200, JSON.stringify(rq.body));
  const sq = await prisma.programQuestion.findUniqueOrThrow({ where: { id: q1.id } });
  assert.deepEqual([sq.prompt, sq.correctIndex, sq.options], ['Revised coverage question?', 1, ['Yes', 'No']]);
  assert.equal((await admin.put(`${PA}/programs/${p.id}/questions/${q1.id}`, { ...question, correctIndex: 3 })).status, 422);
  assert.equal((await admin.put(`${PA}/programs/${p.id}/questions/${MISSING}`, question)).status, 404);
  assert.equal((await finance.put(`${PA}/programs/${p.id}/questions/${q1.id}`, question)).status, 403);
});

test('programs admin: archive lesson/question is soft; the last required lesson of a published program cannot be archived', async () => {
  const p = await buildProgram();
  const [l1, l2] = p.lessonIds;
  assert.equal((await admin.patch(`${PA}/programs/${p.id}/lessons/${l1}/archive`, { archived: true })).status, 200);
  assert.ok((await prisma.programLesson.findUniqueOrThrow({ where: { id: l1 } })).archivedAt, 'row kept');
  const blocked = await admin.patch(`${PA}/programs/${p.id}/lessons/${l2}/archive`, { archived: true });
  assert.equal(blocked.status, 409);
  assert.equal((await prisma.programLesson.findUniqueOrThrow({ where: { id: l2 } })).archivedAt, null, 'rolled back');
  assert.equal((await admin.patch(`${PA}/programs/${p.id}/lessons/${l1}/archive`, { archived: false })).status, 200);
  assert.equal((await prisma.programLesson.findUniqueOrThrow({ where: { id: l1 } })).archivedAt, null);
  assert.equal((await admin.patch(`${PA}/programs/${p.id}/lessons/${MISSING}/archive`, { archived: true })).status, 404);
  assert.equal((await admin.patch(`${PA}/programs/${p.id}/lessons/${l1}/archive`, {})).status, 422);
  assert.equal((await finance.patch(`${PA}/programs/${p.id}/lessons/${l1}/archive`, { archived: true })).status, 403);

  const [q1] = p.questions;
  assert.equal((await admin.patch(`${PA}/programs/${p.id}/questions/${q1.id}/archive`, { archived: true })).status, 200);
  assert.ok((await prisma.programQuestion.findUniqueOrThrow({ where: { id: q1.id } })).archivedAt);
  assert.equal((await admin.patch(`${PA}/programs/${prog.id}/questions/${q1.id}/archive`, { archived: true })).status, 404, 'question of another program');
  assert.equal((await finance.patch(`${PA}/programs/${p.id}/questions/${q1.id}/archive`, { archived: false })).status, 403);
});

test('programs student: GET /enrollments shows own only; POST /payments/failure; GET /attempts/:id is owner-only', async () => {
  const { s, enrollmentId } = await enroll(prog);
  const other = await enroll(prog);
  const mine = await s.client.get(`${PS}/enrollments`);
  assert.equal(mine.status, 200);
  assert.deepEqual((mine.body.data as { id: string }[]).map((e) => e.id), [enrollmentId]);
  assert.equal((await anon().get(`${PS}/enrollments`)).status, 401);
  assert.equal((await admin.get(`${PS}/enrollments`)).status, 403);

  // Checkout failure report: marks the created payment FAILED; owner only; validated.
  const order = await s.client.post(`${PS}/payments/order`, { enrollmentId });
  const orderId = order.body.data.orderId as string;
  assert.equal((await other.s.client.post(`${PS}/payments/failure`, { orderId, reason: 'closed' })).status, 404);
  assert.equal((await s.client.post(`${PS}/payments/failure`, { orderId: 'bad id!', reason: 'x' })).status, 422);
  assert.equal((await s.client.post(`${PS}/payments/failure`, { orderId: 'order_doesnotexist', reason: 'x' })).status, 404);
  const f = await s.client.post(`${PS}/payments/failure`, { orderId, reason: 'User closed the window' });
  assert.equal(f.status, 200);
  assert.equal(f.body.data.status, 'FAILED');
  const p = await prisma.payment.findUniqueOrThrow({ where: { providerOrderId: orderId } });
  assert.deepEqual([p.status, p.failureReason], ['FAILED', 'User closed the window']);
  assert.equal((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).status, 'PENDING_PAYMENT');

  // A late failure report never overrides a verified payment, and says so.
  const paidOrder = await payFor(s.client, enrollmentId);
  const late = await s.client.post(`${PS}/payments/failure`, { orderId: paidOrder, reason: 'stale tab' });
  assert.equal(late.status, 200);
  assert.equal(late.body.data.status, 'PAID');
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { providerOrderId: paidOrder } })).status, 'PAID');

  // Attempts
  await finishLessons(s.client, prog, enrollmentId);
  const a = await startAttempt(s.client, enrollmentId);
  const view = await s.client.get(`${PS}/attempts/${a.attemptId}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.data.submitted, false);
  assert.equal(view.body.data.questions.length, 2);
  assert.doesNotMatch(JSON.stringify(view.body), /correctIndex/);
  assert.equal((await other.s.client.get(`${PS}/attempts/${a.attemptId}`)).status, 404, "another student's attempt");
  assert.equal((await s.client.get(`${PS}/attempts/${MISSING}`)).status, 404);
  assert.equal((await s.client.get(`${PS}/attempts/nope`)).status, 422);
  const answers = Object.fromEntries(a.questions.map((q) => [q.id, prog.questions.find((x) => x.id === q.id)!.correctIndex]));
  assert.equal((await s.client.post(`${PS}/attempts/${a.attemptId}/submit`, { answers })).status, 200);
  const done = await s.client.get(`${PS}/attempts/${a.attemptId}`);
  assert.equal(done.body.data.submitted, true);
  assert.equal(done.body.data.passed, true);
});

test('programs admin: enrollments list/detail, cancel transitions, certificate issue/resend/pdf', async () => {
  const pending = await enroll(prog);
  const list = await finance.get(`${PA}/enrollments?programId=${prog.id}&status=PENDING_PAYMENT`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.some((e: { id: string }) => e.id === pending.enrollmentId));
  assert.ok(list.body.data.items.every((e: { status: string }) => e.status === 'PENDING_PAYMENT'));
  const bySearch = await admin.get(`${PA}/enrollments?search=${encodeURIComponent(pending.s.email)}`);
  assert.deepEqual(bySearch.body.data.items.map((e: { id: string }) => e.id), [pending.enrollmentId]);
  assert.equal((await admin.get(`${PA}/enrollments?status=WHATEVER`)).status, 422);
  assert.equal((await sales.get(`${PA}/enrollments`)).status, 403);

  const detail = await finance.get(`${PA}/enrollments/${pending.enrollmentId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.student.email, pending.s.email.toLowerCase());
  assert.equal((await admin.get(`${PA}/enrollments/${MISSING}`)).status, 404);

  // Cancel: unpaid only, once; reason required; manage permission required.
  assert.equal((await finance.post(`${PA}/enrollments/${pending.enrollmentId}/cancel`, { reason: 'Duplicate registration' })).status, 403);
  assert.equal((await admin.post(`${PA}/enrollments/${pending.enrollmentId}/cancel`, {})).status, 422);
  const c = await admin.post(`${PA}/enrollments/${pending.enrollmentId}/cancel`, { reason: 'Duplicate registration' });
  assert.equal(c.status, 200);
  const e = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: pending.enrollmentId } });
  assert.equal(e.status, 'CANCELLED');
  assert.ok(e.cancelledAt);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'program.cancelled', entityId: pending.enrollmentId, reason: 'Duplicate registration' } }));
  assert.equal((await admin.post(`${PA}/enrollments/${pending.enrollmentId}/cancel`, { reason: 'Again please' })).status, 409, 'cannot cancel twice');
  assert.equal((await admin.post(`${PA}/enrollments/${MISSING}/cancel`, { reason: 'No such one' })).status, 404);

  const paid = await enroll(prog);
  await payFor(paid.s.client, paid.enrollmentId);
  assert.equal((await admin.post(`${PA}/enrollments/${paid.enrollmentId}/cancel`, { reason: 'Changed mind' })).status, 409, 'paid enrollments close via refund');

  // Manual certificate: refused while not eligible.
  assert.equal((await admin.post(`${PA}/enrollments/${paid.enrollmentId}/certificate`)).status, 409);
  await finishLessons(paid.s.client, prog, paid.enrollmentId);
  const a = await startAttempt(paid.s.client, paid.enrollmentId);
  const answers = Object.fromEntries(a.questions.map((q) => [q.id, prog.questions.find((x) => x.id === q.id)!.correctIndex]));
  assert.equal((await paid.s.client.post(`${PS}/attempts/${a.attemptId}/submit`, { answers })).status, 200);
  const auto = await prisma.programCertificate.findUniqueOrThrow({ where: { enrollmentId: paid.enrollmentId } });
  assert.equal((await admin.post(`${PA}/enrollments/${paid.enrollmentId}/certificate`)).status, 409, 'already issued');
  // Simulate an eligible enrollment whose automatic issue did not happen: staff issue it manually.
  await prisma.programCertificate.delete({ where: { id: auto.id } });
  assert.equal((await finance.post(`${PA}/enrollments/${paid.enrollmentId}/certificate`)).status, 403);
  const issued = await admin.post(`${PA}/enrollments/${paid.enrollmentId}/certificate`);
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  const cert = await prisma.programCertificate.findUniqueOrThrow({ where: { enrollmentId: paid.enrollmentId } });
  assert.ok(cert.issuedById, 'manual issue records the staff member');

  // Resend: emails the student again (logged); finance cannot; unknown -> 404.
  testOutbox.length = 0;
  const rs = await admin.post(`${PA}/certificates/${cert.id}/resend`);
  assert.equal(rs.status, 200);
  assert.equal(rs.body.data.status, 'SENT');
  assert.ok(testOutbox.some((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(paid.s.email.toLowerCase()) && /certificate/i.test(m.subject)));
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'program.certificate_resent', entityId: cert.id } }));
  assert.equal((await finance.post(`${PA}/certificates/${cert.id}/resend`)).status, 403);
  assert.equal((await admin.post(`${PA}/certificates/${MISSING}/resend`)).status, 404);

  // PDF: programs.read can view; students cannot; unknown -> 404.
  const pdf = await finance.raw(`${PA}/certificates/${cert.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await paid.s.client.raw(`${PA}/certificates/${cert.id}/pdf`)).status, 403);
  assert.equal((await admin.raw(`${PA}/certificates/${MISSING}/pdf`)).status, 404);
});

// ============================================================================
// Business documents: list, clients, templates
// ============================================================================
const D = '/api/documents';

test('documents: GET / is scoped (sales see their own; finance sees all) and validated', async () => {
  const mine = await sales.post(D, { type: 'QUOTATION', title: 'Scoped quote', party: { name: 'Scope Client', email: 'scope@example.test' }, items: [{ description: 'Work', quantity: 1, unitPaise: 100_000 }] });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const otherSales = (await staff(api.base, 'SALES')).client;
  const l1 = await sales.get(`${D}?type=QUOTATION`);
  assert.equal(l1.status, 200);
  assert.ok(l1.body.data.items.some((d: { id: string }) => d.id === mine.body.data.id));
  assert.ok(!(await otherSales.get(D)).body.data.items.some((d: { id: string }) => d.id === mine.body.data.id), 'not visible to another salesperson');
  assert.ok((await finance.get(D)).body.data.items.some((d: { id: string }) => d.id === mine.body.data.id));
  assert.equal((await sales.get(`${D}?type=MEMO`)).status, 422);
  assert.equal((await anon().get(D)).status, 401);
  assert.equal((await hr.get(D)).status, 403);
});

test('documents: clients — list/search, create (validated), detail, archive is soft', async () => {
  const name = `Client ${uniq()}`;
  assert.equal((await sales.post(`${D}/clients`, { name, email: 'not-an-email' })).status, 422);
  assert.equal((await sales.post(`${D}/clients`, { name, email: 'c@example.test', leadId: MISSING })).status, 422, 'unknown lead');
  assert.equal((await hr.post(`${D}/clients`, { name, email: 'c@example.test' })).status, 403);
  const c = await sales.post(`${D}/clients`, { name, company: 'Coverage Co', email: 'coverage@example.test', stateCode: '23', notes: 'Met at expo.' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = c.body.data.id as string;
  const db = await prisma.businessClient.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([db.name, db.company, db.stateCode], [name, 'Coverage Co', '23']);
  assert.equal((await finance.post(`${D}/clients`, { name: `Finance-added ${uniq()}`, email: 'f@example.test' })).status, 201, 'documents.finance may add clients');

  const list = await sales.get(`${D}/clients?search=${encodeURIComponent(name)}`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.items.map((x: { id: string }) => x.id), [id]);
  const one = await finance.get(`${D}/clients/${id}`);
  assert.equal(one.status, 200);
  assert.ok(Array.isArray(one.body.data.documents));
  assert.equal((await sales.get(`${D}/clients/${MISSING}`)).status, 404);
  assert.equal((await sales.get(`${D}/clients/bad`)).status, 422);

  assert.equal((await sales.patch(`${D}/clients/${id}/archive`, { archived: true })).status, 200);
  assert.ok((await prisma.businessClient.findUniqueOrThrow({ where: { id } })).archivedAt, 'row kept');
  assert.equal((await sales.get(`${D}/clients?search=${encodeURIComponent(name)}`)).body.data.items.length, 0);
  assert.equal((await sales.get(`${D}/clients?search=${encodeURIComponent(name)}&includeArchived=true`)).body.data.items.length, 1);
  assert.equal((await sales.patch(`${D}/clients/${id}/archive`, {})).status, 422);
  assert.equal((await sales.patch(`${D}/clients/${MISSING}/archive`, { archived: true })).status, 404);
  assert.equal((await sales.patch(`${D}/clients/${id}/archive`, { archived: false })).status, 200);
  assert.equal((await prisma.businessClient.findUniqueOrThrow({ where: { id } })).archivedAt, null);
});

test('documents: templates — list, update (documents.settings only), archive is soft', async () => {
  const t = await admin.post(`${D}/templates`, { type: 'QUOTATION', name: `Tpl ${uniq()}`, items: [{ description: 'Setup', quantity: 1, unitPaise: 50_000 }] });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const id = t.body.data.id as string;
  const list = await sales.get(`${D}/templates?type=QUOTATION`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((x: { id: string }) => x.id === id));
  assert.equal((await sales.get(`${D}/templates?type=MEMO`)).status, 422);

  const body = { type: 'QUOTATION', name: 'Website quote', title: 'Website build', notes: 'Valid 30 days.', items: [{ description: 'Design', quantity: 2, unitPaise: 75_000 }] };
  assert.equal((await sales.put(`${D}/templates/${id}`, body)).status, 403, 'sales lack documents.settings');
  const upd = await admin.put(`${D}/templates/${id}`, body);
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const db = await prisma.documentTemplate.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([db.name, db.title, db.notes], ['Website quote', 'Website build', 'Valid 30 days.']);
  assert.equal((await admin.put(`${D}/templates/${id}`, { ...body, name: 'x' })).status, 422);
  assert.equal((await admin.put(`${D}/templates/${MISSING}`, body)).status, 404);

  assert.equal((await sales.patch(`${D}/templates/${id}/archive`, { archived: true })).status, 403);
  assert.equal((await admin.patch(`${D}/templates/${id}/archive`, { archived: true })).status, 200);
  assert.ok((await prisma.documentTemplate.findUniqueOrThrow({ where: { id } })).archivedAt, 'row kept');
  assert.ok(!(await sales.get(`${D}/templates`)).body.data.some((x: { id: string }) => x.id === id));
  assert.ok((await sales.get(`${D}/templates?includeArchived=true`)).body.data.some((x: { id: string }) => x.id === id));
  assert.equal((await admin.patch(`${D}/templates/${MISSING}/archive`, { archived: true })).status, 404);
});

// ============================================================================
// Employee self-service + HR
// ============================================================================
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function newEmployee() {
  const email = `${uniq('emp')}@example.test`;
  const r = await hr.post('/api/hr/employees', { name: 'Coverage Employee', email, department: 'Engineering', designation: 'Developer', employmentType: 'FULL_TIME', joiningDate: '2026-01-05' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const token = tokenFromOutbox(email, 'reset-password');
  assert.equal((await anon().post('/api/auth/reset-password', { token, password: PASSWORD })).status, 200);
  return { client: await login(api.base, email), id: r.body.data.id as string };
}

let empA: Awaited<ReturnType<typeof newEmployee>>;
let empB: Awaited<ReturnType<typeof newEmployee>>;

test('employee: dashboard; leave list is own-only; cancel transitions and ownership', async () => {
  empA = await newEmployee();
  empB = await newEmployee();
  const dash = await empA.client.get('/api/employee/dashboard');
  assert.equal(dash.status, 200);

  const l1 = await empA.client.post('/api/employee/leave', { type: 'CASUAL', startDate: plusDays(10), endDate: plusDays(11), reason: 'Family event' });
  assert.equal(l1.status, 201, JSON.stringify(l1.body));
  const l2 = await empA.client.post('/api/employee/leave', { type: 'SICK', startDate: plusDays(20), endDate: plusDays(20), reason: 'Medical check' });
  assert.equal(l2.status, 201);
  const mine = await empA.client.get('/api/employee/leave');
  assert.equal(mine.status, 200);
  assert.deepEqual(new Set(mine.body.data.map((x: { id: string }) => x.id)), new Set([l1.body.data.id, l2.body.data.id]));
  assert.equal((await empB.client.get('/api/employee/leave')).body.data.length, 0);
  assert.equal((await anon().get('/api/employee/leave')).status, 401);
  assert.equal((await hr.get('/api/employee/leave')).status, 403);

  assert.equal((await empB.client.post(`/api/employee/leave/${l1.body.data.id}/cancel`)).status, 404, "cannot cancel someone else's leave");
  assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: l1.body.data.id } })).status, 'PENDING');
  const c = await empA.client.post(`/api/employee/leave/${l1.body.data.id}/cancel`);
  assert.equal(c.status, 200);
  assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: l1.body.data.id } })).status, 'CANCELLED');
  assert.equal((await empA.client.post(`/api/employee/leave/${l1.body.data.id}/cancel`)).status, 409, 'already cancelled');
  assert.equal((await hr.post(`/api/hr/leave/${l2.body.data.id}/review`, { decision: 'REJECT', note: 'Busy week' })).status, 200);
  assert.equal((await empA.client.post(`/api/employee/leave/${l2.body.data.id}/cancel`)).status, 409, 'rejected leave cannot be cancelled');
  assert.equal((await empA.client.post(`/api/employee/leave/${MISSING}/cancel`)).status, 404);
  assert.equal((await empA.client.post('/api/employee/leave/bad/cancel')).status, 422);
});

test('HR: leave list, projects (list/get/update), tasks (list/update) and employee task/project/work-update views', async () => {
  const leave = await hr.get('/api/hr/leave?status=REJECTED');
  assert.equal(leave.status, 200);
  assert.ok(leave.body.data.items.length >= 1);
  assert.ok(leave.body.data.items.every((x: { status: string }) => x.status === 'REJECTED'));
  assert.equal((await hr.get('/api/hr/leave?status=MAYBE')).status, 422);
  assert.equal((await empA.client.get('/api/hr/leave')).status, 403);
  assert.equal((await finance.get('/api/hr/leave')).status, 403);

  const p = await hr.post('/api/hr/projects', { code: uniq('C').slice(0, 15), name: 'Coverage project' });
  assert.equal(p.status, 201);
  const pid = p.body.data.id as string;
  assert.equal((await hr.post(`/api/hr/projects/${pid}/members`, { userId: empA.id, role: 'Developer' })).status, 200);
  const projects = await hr.get('/api/hr/projects?search=Coverage');
  assert.equal(projects.status, 200);
  assert.ok(projects.body.data.some((x: { id: string }) => x.id === pid));
  assert.equal((await hr.get('/api/hr/projects?status=DONE')).status, 422);
  const one = await hr.get(`/api/hr/projects/${pid}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.members.length, 1);
  assert.equal((await hr.get(`/api/hr/projects/${MISSING}`)).status, 404);
  const upd = await hr.put(`/api/hr/projects/${pid}`, { status: 'ACTIVE', description: 'Now running', endDate: plusDays(30) });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const dbp = await prisma.project.findUniqueOrThrow({ where: { id: pid } });
  assert.deepEqual([dbp.status, dbp.description, dbp.name], ['ACTIVE', 'Now running', 'Coverage project']);
  assert.equal((await hr.put(`/api/hr/projects/${pid}`, { status: 'FINISHED' })).status, 422);
  assert.equal((await hr.put(`/api/hr/projects/${MISSING}`, { name: 'Ghost' })).status, 404);
  assert.equal((await empA.client.put(`/api/hr/projects/${pid}`, { name: 'Mine now' })).status, 403);

  const t = await hr.post('/api/hr/tasks', { title: 'Write tests', assigneeId: empA.id, projectId: pid, priority: 'LOW' });
  assert.equal(t.status, 201);
  const tid = t.body.data.id as string;
  const tasks = await hr.get(`/api/hr/tasks?projectId=${pid}`);
  assert.equal(tasks.status, 200);
  assert.deepEqual(tasks.body.data.items.map((x: { id: string }) => x.id), [tid]);
  assert.equal((await hr.get('/api/hr/tasks?status=LATER')).status, 422);
  const tu = await hr.put(`/api/hr/tasks/${tid}`, { priority: 'HIGH', status: 'IN_PROGRESS', dueDate: plusDays(3) });
  assert.equal(tu.status, 200, JSON.stringify(tu.body));
  const dbt = await prisma.task.findUniqueOrThrow({ where: { id: tid } });
  assert.deepEqual([dbt.priority, dbt.status, dbt.title], ['HIGH', 'IN_PROGRESS', 'Write tests']);
  assert.equal((await hr.put(`/api/hr/tasks/${tid}`, { assigneeId: empB.id })).status, 422, 'assignee must be a project member');
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: tid } })).assigneeId, empA.id);
  assert.equal((await hr.put(`/api/hr/tasks/${MISSING}`, { title: 'Ghost task' })).status, 404);

  // Employee views: own projects/tasks/work updates only.
  const myP = await empA.client.get('/api/employee/projects');
  assert.equal(myP.status, 200);
  assert.deepEqual(myP.body.data.map((x: { id: string }) => x.id), [pid]);
  assert.equal((await empB.client.get('/api/employee/projects')).body.data.length, 0);
  const myT = await empA.client.get('/api/employee/tasks?status=IN_PROGRESS');
  assert.equal(myT.status, 200);
  assert.deepEqual(myT.body.data.map((x: { id: string }) => x.id), [tid]);
  assert.equal((await empA.client.get('/api/employee/tasks?status=DONE')).body.data.length, 0);
  assert.equal((await empA.client.get('/api/employee/tasks?status=LATER')).status, 422);
  assert.equal((await empB.client.get('/api/employee/tasks')).body.data.length, 0);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  assert.equal((await empA.client.post('/api/employee/work-updates', { date: today, summary: 'Wrote tests', taskId: tid, projectId: pid, minutes: 60 })).status, 201);
  const wu = await empA.client.get('/api/employee/work-updates');
  assert.equal(wu.status, 200);
  assert.equal(wu.body.data.length, 1);
  assert.equal(wu.body.data[0].summary, 'Wrote tests');
  assert.equal((await empB.client.get('/api/employee/work-updates')).body.data.length, 0);
});

test('HR: document visibility/removal (soft), requests list, announcements list', async () => {
  const up = await fetch(`${api.base}/api/files?purpose=EMPLOYEE_DOCUMENT`, {
    method: 'POST',
    headers: { Cookie: hr.cookie, 'X-Forwarded-For': hr.ip, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'Offer.pdf' },
    body: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  });
  assert.equal(up.status, 201, await up.clone().text());
  const fileId = ((await up.json()) as { data: { id: string } }).data.id;
  const d = await hr.post(`/api/hr/employees/${empA.id}/documents`, { title: 'Offer letter', category: 'OFFER_LETTER', fileId });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const docId = d.body.data.id as string;
  const seen = () => empA.client.get('/api/employee/documents').then((r) => (r.body.data as { id: string }[]).some((x) => x.id === docId));
  assert.equal(await seen(), true);

  assert.equal((await hr.patch(`/api/hr/documents/${docId}`, { visibleToEmployee: false })).status, 422, 'reason required');
  assert.equal((await empA.client.patch(`/api/hr/documents/${docId}`, { visibleToEmployee: false, reason: 'Mine' })).status, 403);
  assert.equal((await hr.patch(`/api/hr/documents/${docId}`, { visibleToEmployee: false, reason: 'Pending signature' })).status, 200);
  assert.equal((await prisma.employeeDocument.findUniqueOrThrow({ where: { id: docId } })).visibleToEmployee, false);
  assert.equal(await seen(), false, 'hidden from the employee');
  assert.equal((await hr.patch(`/api/hr/documents/${docId}`, { remove: true, reason: 'Uploaded by mistake' })).status, 200);
  const removed = await prisma.employeeDocument.findUniqueOrThrow({ where: { id: docId } });
  assert.ok(removed.deletedAt, 'soft-deleted, row kept for audit');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'employee.document_removed', entityId: docId, reason: 'Uploaded by mistake' } }));
  assert.equal((await hr.patch(`/api/hr/documents/${docId}`, { visibleToEmployee: true, reason: 'Restore it' })).status, 404, 'removed documents are gone');
  assert.equal((await hr.patch(`/api/hr/documents/${MISSING}`, { remove: true, reason: 'Nothing here' })).status, 404);

  const req = await empA.client.post('/api/employee/hr-requests', { category: 'IT', subject: 'Laptop issue', message: 'My laptop will not boot up.' });
  assert.equal(req.status, 201);
  const open = await hr.get('/api/hr/requests?status=OPEN');
  assert.equal(open.status, 200);
  assert.ok(open.body.data.items.some((x: { id: string }) => x.id === req.body.data.id));
  assert.ok(open.body.data.items.every((x: { status: string }) => x.status === 'OPEN'));
  assert.equal((await hr.get('/api/hr/requests?status=SNOOZED')).status, 422);
  assert.equal((await empA.client.get('/api/hr/requests')).status, 403);

  assert.equal((await hr.post('/api/hr/announcements', { title: 'Coverage notice', body: 'Tests are running.' })).status, 201);
  const ann = await hr.get('/api/hr/announcements');
  assert.equal(ann.status, 200);
  assert.ok(ann.body.data.some((x: { title: string }) => x.title === 'Coverage notice'));
  assert.equal((await empA.client.get('/api/hr/announcements')).status, 403);
  assert.equal((await anon().get('/api/hr/announcements')).status, 401);
});

test('regression: lesson completion tolerates DB/API clock skew; a 0-minute lesson is never blocked', async () => {
  const p = await buildProgram();
  const s = await registerStudent(api.base);
  const reg = await s.client.post(`${PS}/register`, { slug: p.slug });
  assert.ok([200, 201].includes(reg.status), JSON.stringify(reg.body));
  const enrollmentId = reg.body.data.id as string;
  await payFor(s.client, enrollmentId);
  const [l1, l2] = p.lessonIds;
  assert.equal((await s.client.get(`${PS}/enrollments/${enrollmentId}/lessons/${l1}`)).status, 200);
  // Simulate the database clock running 3 s ahead of the API server.
  await prisma.programLessonProgress.update({ where: { enrollmentId_lessonId: { enrollmentId, lessonId: l1 } }, data: { openedAt: new Date(Date.now() + 3_000) } });
  assert.equal((await s.client.post(`${PS}/enrollments/${enrollmentId}/lessons/${l1}/complete`)).status, 200);
  // A real minimum is still enforced.
  await prisma.programLesson.update({ where: { id: l2 }, data: { minMinutes: 5 } });
  assert.equal((await s.client.get(`${PS}/enrollments/${enrollmentId}/lessons/${l2}`)).status, 200);
  assert.equal((await s.client.post(`${PS}/enrollments/${enrollmentId}/lessons/${l2}/complete`)).status, 409);
});
