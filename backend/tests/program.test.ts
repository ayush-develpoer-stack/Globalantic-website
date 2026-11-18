/** Certificate program: registration, verified payment, receipts, completion rules, certificates. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkoutSignature,
  pdfPageCount,
  postWebhook,
  prisma,
  registerStudent,
  startApi,
  staff,
  testOutbox,
  uniq,
  useFakeGateway,
  webhookBody,
  type Api,
  type Client,
  type FakeGateway,
} from './helpers';

let api: Api;
let admin: Client;
let finance: Client;
let gateway: FakeGateway;
let program: { id: string; slug: string };
const lessonIds: string[] = [];
const questions: { id: string; correctIndex: number }[] = [];

const outboxTo = (email: string) => testOutbox.filter((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(email));

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  gateway = useFakeGateway();
});
after(() => api.close());

async function registered() {
  const s = await registerStudent(api.base);
  const r = await s.client.post('/api/programs/student/register', { slug: program.slug });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { s, enrollment: r.body.data as { id: string; enrollmentNumber: string; feePaise: number; status: string } };
}

async function pay(student: Client, enrollmentId: string) {
  const order = await student.post('/api/programs/student/payments/order', { enrollmentId, amountPaise: 1 });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const paymentId = gateway.pay(order.body.data.orderId);
  const v = await student.post('/api/programs/student/payments/verify', { orderId: order.body.data.orderId, paymentId, signature: checkoutSignature(order.body.data.orderId, paymentId) });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(v.body.data.status, 'PAID');
  return { orderId: order.body.data.orderId as string, paymentId };
}

async function completeLessons(student: Client, enrollmentId: string) {
  for (const id of lessonIds) {
    await student.get(`/api/programs/student/enrollments/${enrollmentId}/lessons/${id}`);
    // Simulate the minimum reading time having passed.
    await prisma.programLessonProgress.update({ where: { enrollmentId_lessonId: { enrollmentId, lessonId: id } }, data: { openedAt: new Date(Date.now() - 60 * 60_000) } });
    const c = await student.post(`/api/programs/student/enrollments/${enrollmentId}/lessons/${id}/complete`);
    assert.equal(c.status, 200, JSON.stringify(c.body));
  }
}

async function attempt(student: Client, enrollmentId: string, correct: boolean) {
  const start = await student.post(`/api/programs/student/enrollments/${enrollmentId}/attempts`);
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const qs = start.body.data.questions as { id: string; options: string[] }[];
  const answers = Object.fromEntries(qs.map((q) => {
    const key = questions.find((x) => x.id === q.id)!.correctIndex;
    return [q.id, correct ? key : (key + 1) % q.options.length];
  }));
  const sub = await student.post(`/api/programs/student/attempts/${start.body.data.attemptId}/submit`, { answers });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  return { start: start.body.data, result: sub.body.data };
}

test('admin builds the program; it cannot be published without lessons and questions', async () => {
  const slug = uniq('cert-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const c = await admin.post('/api/programs/admin/programs', {
    slug,
    title: 'Digital Skills Certificate',
    summary: 'A self-paced program with lessons and a final assessment.',
    description: 'Complete the lessons, then pass the final assessment to earn the certificate.',
    feePaise: 99_900,
    passPercent: 60,
    maxAttempts: 1,
    timeLimitMinutes: 30,
    certificateTitle: 'Certificate of Completion',
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  program = c.body.data;
  const early = await admin.patch(`/api/programs/admin/programs/${program.id}`, { status: 'PUBLISHED' });
  assert.equal(early.status, 409);

  for (const [i, mins] of [0, 5].entries()) {
    const l = await admin.post(`/api/programs/admin/programs/${program.id}/lessons`, { title: `Lesson ${i + 1}`, body: `Lesson ${i + 1} content, long enough.`, minMinutes: mins, required: true });
    assert.equal(l.status, 201, JSON.stringify(l.body));
    lessonIds.push(l.body.data.id);
  }
  for (let i = 0; i < 4; i++) {
    const q = await admin.post(`/api/programs/admin/programs/${program.id}/questions`, { prompt: `Question number ${i + 1}?`, options: ['A', 'B', 'C'], correctIndex: i % 3 });
    assert.equal(q.status, 201, JSON.stringify(q.body));
    questions.push({ id: q.body.data.id, correctIndex: i % 3 });
  }
  const bad = await admin.post(`/api/programs/admin/programs/${program.id}/questions`, { prompt: 'Broken question?', options: ['A', 'B'], correctIndex: 4 });
  assert.equal(bad.status, 422);
  const pub = await admin.patch(`/api/programs/admin/programs/${program.id}`, { status: 'PUBLISHED' });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));

  // Finance can read reports but not change the program; students cannot reach admin routes.
  assert.equal((await finance.get('/api/programs/admin/report')).status, 200);
  assert.equal((await finance.patch(`/api/programs/admin/programs/${program.id}`, { feePaise: 100 })).status, 403);
  const s = await registerStudent(api.base);
  assert.equal((await s.client.get('/api/programs/admin/programs')).status, 403);

  const pubView = await new (await import('./helpers')).Client(api.base).get(`/api/programs/${program.slug}`);
  assert.equal(pubView.status, 200);
  assert.equal(pubView.body.data.feePaise, 99_900);
  assert.doesNotMatch(JSON.stringify(pubView.body), /correctIndex|Lesson 1 content/, 'no answer keys or lesson bodies in public data');
});

test('registration snapshots the fee; lessons stay locked until a verified payment; amounts come from the DB', async () => {
  const { s, enrollment } = await registered();
  assert.equal(enrollment.status, 'PENDING_PAYMENT');
  assert.equal(enrollment.feePaise, 99_900);
  const again = await s.client.post('/api/programs/student/register', { slug: program.slug });
  assert.equal(again.status, 200, 'registering twice returns the same enrollment');
  assert.equal(again.body.data.id, enrollment.id);
  assert.equal((await s.client.get(`/api/programs/student/enrollments/${enrollment.id}/lessons/${lessonIds[0]}`)).status, 403);
  assert.equal((await s.client.post(`/api/programs/student/enrollments/${enrollment.id}/attempts`)).status, 403);

  // A fee change applies to new registrations only.
  await admin.patch(`/api/programs/admin/programs/${program.id}`, { feePaise: 149_900 });
  const order = await s.client.post('/api/programs/student/payments/order', { enrollmentId: enrollment.id, amountPaise: 100 });
  assert.equal(order.status, 200);
  assert.equal(order.body.data.amountPaise, 99_900);
  assert.equal(gateway.orders.get(order.body.data.orderId)!.amount, 99_900);
  assert.doesNotMatch(JSON.stringify(order.body), /rzp_test_secret|webhook_secret/);
  await admin.patch(`/api/programs/admin/programs/${program.id}`, { feePaise: 99_900 });
  const audit = await prisma.auditLog.findFirst({ where: { entityType: 'CertificateProgram', entityId: program.id, action: 'program.fee_changed' } });
  assert.ok(audit, 'fee changes are audited');

  // Another student cannot see or pay this enrollment.
  const other = await registerStudent(api.base);
  assert.equal((await other.client.get(`/api/programs/student/enrollments/${enrollment.id}`)).status, 404);
  assert.equal((await other.client.post('/api/programs/student/payments/order', { enrollmentId: enrollment.id })).status, 404);
});

test('failed payment: nothing unlocked, no receipt, no success email', async () => {
  const { s, enrollment } = await registered();
  const order = await s.client.post('/api/programs/student/payments/order', { enrollmentId: enrollment.id });
  const pid = gateway.pay(order.body.data.orderId, 'failed');
  const before = outboxTo(s.email).length;
  const wh = await postWebhook(api.base, webhookBody('payment.failed', gateway.payments.get(pid)!));
  assert.equal(wh.status, 200);
  const p = await prisma.payment.findFirstOrThrow({ where: { programEnrollmentId: enrollment.id } });
  assert.equal(p.status, 'FAILED');
  assert.equal((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status, 'PENDING_PAYMENT');
  assert.equal(await prisma.invoice.count({ where: { programEnrollmentId: enrollment.id } }), 0);
  assert.equal(outboxTo(s.email).length, before, 'no payment email for a failed payment');
  // Bad signature on checkout never marks anything paid.
  const bad = await s.client.post('/api/programs/student/payments/verify', { orderId: order.body.data.orderId, paymentId: pid, signature: checkoutSignature(order.body.data.orderId, pid, 'wrong') });
  assert.equal(bad.status, 400);
});

let main: { s: Awaited<ReturnType<typeof registerStudent>>; enrollment: { id: string; enrollmentNumber: string }; paymentId: string; orderId: string };

test('verified payment: enrollment active, one receipt, confirmation email with the PDF, team alert, no referral', async () => {
  const { s, enrollment } = await registered();
  testOutbox.length = 0;
  const { paymentId, orderId } = await pay(s.client, enrollment.id);
  main = { s, enrollment, paymentId, orderId };
  const e = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  assert.equal(e.status, 'ACTIVE');
  const inv = await prisma.invoice.findFirstOrThrow({ where: { programEnrollmentId: enrollment.id } });
  assert.equal(inv.amountPaise, 99_900);
  assert.equal(inv.applicationId, null);

  const mail = outboxTo(s.email).find((m) => /Payment received/.test(m.subject));
  assert.ok(mail, 'student confirmation sent');
  assert.match(mail!.html, /₹999\.00/);
  assert.match(mail!.html, new RegExp(paymentId));
  assert.match(mail!.html, new RegExp(enrollment.enrollmentNumber));
  assert.match(mail!.html, /Next steps/);
  assert.equal(mail!.attachments?.length, 1);
  assert.equal(mail!.attachments![0].content.subarray(0, 5).toString(), '%PDF-');
  assert.ok(testOutbox.some((m) => /Payment verified/.test(m.subject)), 'team alert sent');
  const logs = await prisma.emailLog.findMany({ where: { entityType: 'Invoice', entityId: inv.id } });
  assert.deepEqual(logs.map((l) => l.status).sort(), ['SENT', 'SENT']);
  assert.ok((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).pdfFileId, 'receipt PDF stored privately');
  assert.equal(await prisma.referralReward.count({ where: { paymentId: inv.paymentId } }), 0);

  // Student downloads their receipt; another student cannot.
  const pdf = await s.client.raw(`/api/training/student/invoices/${inv.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.type, 'application/pdf');
  assert.match(pdf.cache, /no-store/);
  assert.equal(pdf.buf.subarray(0, 5).toString(), '%PDF-');
  const other = await registerStudent(api.base);
  assert.equal((await other.client.raw(`/api/training/student/invoices/${inv.id}/pdf`)).status, 404);
  assert.equal((await new (await import('./helpers')).Client(api.base).raw(`/api/training/student/invoices/${inv.id}/pdf`)).status, 401);

  // Webhooks after checkout (replay and a second event) change nothing and send nothing.
  const sent = testOutbox.length;
  const gp = gateway.payments.get(paymentId)!;
  const w1 = await postWebhook(api.base, webhookBody('payment.captured', gp), { eventId: 'evt_dup_1' });
  const w2 = await postWebhook(api.base, webhookBody('payment.captured', gp), { eventId: 'evt_dup_1' });
  const w3 = await postWebhook(api.base, webhookBody('order.paid', gp), { eventId: 'evt_dup_2' });
  assert.deepEqual([w1.status, w2.status, w3.status], [200, 200, 200]);
  assert.equal(await prisma.invoice.count({ where: { programEnrollmentId: enrollment.id } }), 1);
  assert.equal(await prisma.payment.count({ where: { programEnrollmentId: enrollment.id, status: 'PAID' } }), 1);
  assert.equal(testOutbox.length, sent, 'no duplicate emails');
  assert.equal(await prisma.paymentWebhookEvent.count({ where: { eventId: 'evt_dup_1' } }), 1);
  // A second order is refused once paid.
  assert.equal((await s.client.post('/api/programs/student/payments/order', { enrollmentId: enrollment.id })).status, 409);
});

test('payment alone never issues a certificate; lessons enforce minimum time; failing uses an attempt', async () => {
  const { s, enrollment } = main;
  const view = await s.client.get(`/api/programs/student/enrollments/${enrollment.id}`);
  assert.equal(view.body.data.eligibility.eligible, false);
  assert.equal(view.body.data.certificate, null);
  assert.equal((await s.client.post(`/api/programs/student/enrollments/${enrollment.id}/attempts`)).status, 409, 'lessons first');
  assert.equal(await prisma.programCertificate.count({ where: { enrollmentId: enrollment.id } }), 0);

  // Lesson 2 needs 5 minutes after opening.
  await s.client.get(`/api/programs/student/enrollments/${enrollment.id}/lessons/${lessonIds[1]}`);
  const tooSoon = await s.client.post(`/api/programs/student/enrollments/${enrollment.id}/lessons/${lessonIds[1]}/complete`);
  assert.equal(tooSoon.status, 409);
  await completeLessons(s.client, enrollment.id);

  const { start, result } = await attempt(s.client, enrollment.id, false);
  assert.doesNotMatch(JSON.stringify(start), /correctIndex/, 'answer keys never reach the student');
  assert.equal(result.passed, false);
  assert.equal(result.certificate, null);
  assert.equal(await prisma.programCertificate.count({ where: { enrollmentId: enrollment.id } }), 0);
  // maxAttempts = 1: no more attempts until staff grant one.
  assert.equal((await s.client.post(`/api/programs/student/enrollments/${enrollment.id}/attempts`)).status, 409);
  assert.equal((await finance.post(`/api/programs/admin/enrollments/${enrollment.id}/extra-attempt`, { reason: 'Second chance' })).status, 403);
  assert.equal((await admin.post(`/api/programs/admin/enrollments/${enrollment.id}/extra-attempt`, { reason: 'Second chance requested' })).status, 200);
});

test('passing the assessment issues the certificate automatically, with a separate email and a verifiable PDF', async () => {
  const { s, enrollment } = main;
  testOutbox.length = 0;
  const { result } = await attempt(s.client, enrollment.id, true);
  assert.equal(result.passed, true);
  assert.equal(result.scorePercent, 100);
  assert.ok(result.certificate?.certificateNumber);
  const cert = await prisma.programCertificate.findUniqueOrThrow({ where: { enrollmentId: enrollment.id } });
  assert.equal(cert.issuedById, null, 'issued automatically');
  assert.equal((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status, 'COMPLETED');
  const mail = outboxTo(s.email).find((m) => /Your certificate/.test(m.subject));
  assert.ok(mail, 'certificate email sent');
  assert.match(mail!.html, new RegExp(cert.verificationCode));
  assert.equal(mail!.attachments?.[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.ok(!outboxTo(s.email).some((m) => /Payment received/.test(m.subject)), 'separate from the payment email');

  const pdf = await s.client.raw(`/api/programs/student/enrollments/${enrollment.id}/certificate.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdfPageCount(pdf.buf), 1);
  const other = await registerStudent(api.base);
  assert.equal((await other.client.raw(`/api/programs/student/enrollments/${enrollment.id}/certificate.pdf`)).status, 404);

  const pub = new (await import('./helpers')).Client(api.base);
  const ok = await pub.get(`/api/training/certificates/verify/${cert.verificationCode}`);
  assert.equal(ok.body.data.valid, true);
  assert.equal(ok.body.data.type, 'program');
  assert.equal(ok.body.data.studentName, cert.studentName);
  assert.doesNotMatch(JSON.stringify(ok.body), /email|phone/);
  // Manual issue is refused once issued.
  assert.equal((await admin.post(`/api/programs/admin/enrollments/${enrollment.id}/certificate`)).status, 409);

  // Refund after issue: the certificate is NOT silently revoked; admins are told.
  const gp = { ...gateway.payments.get(main.paymentId)!, status: 'refunded' };
  assert.equal((await postWebhook(api.base, webhookBody('payment.refunded', gp))).status, 200);
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { providerPaymentId: main.paymentId } })).status, 'REFUNDED');
  assert.equal((await prisma.programCertificate.findUniqueOrThrow({ where: { id: cert.id } })).status, 'ISSUED');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'program.refunded_after_certificate', entityId: enrollment.id } }));

  const rev = await admin.post(`/api/programs/admin/certificates/${cert.id}/revoke`, { reason: 'Refunded — revoked after review' });
  assert.equal(rev.status, 200);
  const after = await pub.get(`/api/training/certificates/verify/${cert.verificationCode}`);
  assert.equal(after.body.data.valid, false);
  assert.equal(after.body.data.status, 'REVOKED');
});

test('refund before completion closes access; disputes are recorded and flagged; report adds up', async () => {
  const { s, enrollment } = await registered();
  const { paymentId } = await pay(s.client, enrollment.id);
  const gp = gateway.payments.get(paymentId)!;
  const dispute = JSON.stringify({ event: 'payment.dispute.created', payload: { payment: { entity: { id: gp.id, order_id: gp.orderId, amount: gp.amount, currency: 'INR', status: 'captured' } }, dispute: { entity: { id: 'disp_1', payment_id: gp.id } } } });
  assert.equal((await postWebhook(api.base, dispute)).status, 200);
  const p = await prisma.payment.findUniqueOrThrow({ where: { providerPaymentId: paymentId } });
  assert.equal(p.disputeStatus, 'OPEN');
  assert.equal(p.status, 'PAID', 'a dispute does not change the money status by itself');

  assert.equal((await postWebhook(api.base, webhookBody('payment.refunded', { ...gp, status: 'refunded' }))).status, 200);
  assert.equal((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status, 'REFUNDED');
  assert.equal((await s.client.get(`/api/programs/student/enrollments/${enrollment.id}/lessons/${lessonIds[0]}`)).status, 403);

  const report = await admin.get(`/api/programs/admin/report?programId=${program.id}`);
  const row = report.body.data.rows[0];
  assert.equal(row.completed, 1);
  assert.equal(row.refunded, 1);
  assert.equal(row.certificatesRevoked, 1);
  assert.equal(row.paidPayments, 0, 'both paid payments were refunded');
  const exp = await admin.get(`/api/programs/admin/enrollments/export?programId=${program.id}`);
  assert.equal(exp.status, 200);
  assert.ok(exp.body.data.rows.length >= 4);
  // Admin payment screen shows the receipt + email status for program payments too.
  const pay2 = await admin.get(`/api/training/admin/payments/${p.id}`);
  assert.equal(pay2.body.data.programEnrollment.enrollmentNumber, enrollment.enrollmentNumber);
  assert.ok(pay2.body.data.emails.length >= 1);
  const receipt = await admin.raw(`/api/training/admin/payments/${p.id}/receipt.pdf`);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.type, 'application/pdf');
});
