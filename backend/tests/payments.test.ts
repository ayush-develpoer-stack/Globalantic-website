/** Razorpay flow: server-side amounts, signature checks, idempotent webhooks, offline records. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAndApprove,
  checkoutSignature,
  payApplication,
  postWebhook,
  prisma,
  registerStudent,
  seedCourse,
  startApi,
  staff,
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

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  gateway = useFakeGateway();
});
after(() => api.close());

async function approvedApplication(feePaise = 2_500_000) {
  const { batch } = await seedCourse({ feePaise });
  const s = await registerStudent(api.base);
  const app = await applyAndApprove(s.client, admin, batch.id);
  return { student: s, app, batch };
}

test('orders are only created for approved applications, with the DB amount', async () => {
  const { batch } = await seedCourse({ feePaise: 1_800_000 });
  const s = await registerStudent(api.base);
  const a = await s.client.post('/api/training/student/applications', { batchId: batch.id, qualification: 'BCA' });
  const early = await s.client.post('/api/training/student/payments/order', { applicationId: a.body.data.id });
  assert.equal(early.status, 409, 'no payment before approval');
  await admin.post(`/api/training/admin/applications/${a.body.data.id}/review`, { action: 'APPROVE' });
  const order = await s.client.post('/api/training/student/payments/order', { applicationId: a.body.data.id, amountPaise: 100 });
  assert.equal(order.status, 200);
  assert.equal(order.body.data.amountPaise, 1_800_000);
  assert.equal(gateway.orders.get(order.body.data.orderId)!.amount, 1_800_000);
  assert.equal(order.body.data.keyId, 'rzp_test_key');
  assert.doesNotMatch(JSON.stringify(order.body), /rzp_test_secret|webhook_secret/);
  // Asking again re-uses the open order
  const again = await s.client.post('/api/training/student/payments/order', { applicationId: a.body.data.id });
  assert.equal(again.body.data.orderId, order.body.data.orderId);
});

test('invalid payment signature is rejected and nothing is enrolled', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const paymentId = gateway.pay(order.body.data.orderId);
  const bad = await student.client.post('/api/training/student/payments/verify', {
    orderId: order.body.data.orderId,
    paymentId,
    signature: checkoutSignature(order.body.data.orderId, paymentId, 'wrong-secret'),
  });
  assert.equal(bad.status, 400);
  // Signature for a different payment id
  const swapped = await student.client.post('/api/training/student/payments/verify', {
    orderId: order.body.data.orderId,
    paymentId,
    signature: checkoutSignature(order.body.data.orderId, 'pay_other'),
  });
  assert.equal(swapped.status, 400);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 0);
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } })).status, 'CREATED');
});

test('valid checkout: PAID -> invoice/receipt -> enrollment -> notification (once)', async () => {
  const { student, app } = await approvedApplication(2_000_000);
  const { orderId, paymentId } = await payApplication(student.client, gateway, app.id);
  // Re-sending the same verification is idempotent
  const again = await student.client.post('/api/training/student/payments/verify', { orderId, paymentId, signature: checkoutSignature(orderId, paymentId) });
  assert.equal(again.status, 200);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 1);
  assert.equal(await prisma.invoice.count({ where: { applicationId: app.id } }), 1);
  const inv = await student.client.get('/api/training/student/invoices');
  assert.equal(inv.body.data.length, 1);
  assert.match(inv.body.data[0].invoiceNumber, /^INV-\d{4}-\d{6}$/);
  assert.equal(inv.body.data[0].amountPaise, 2_000_000);
  const appView = await student.client.get(`/api/training/student/applications/${app.id}`);
  assert.equal(appView.body.data.status, 'ENROLLED');
});

test("a student cannot verify or see another student's payment / invoice", async () => {
  const { student, app } = await approvedApplication();
  await payApplication(student.client, gateway, app.id);
  const intruder = await registerStudent(api.base);
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { applicationId: app.id } });
  assert.equal((await intruder.client.get(`/api/training/student/invoices/${invoice.id}`)).status, 404);
  assert.equal((await intruder.client.get('/api/training/student/payments')).body.data.length, 0);
});

test('provider amount mismatch is rejected', async () => {
  const { student, app } = await approvedApplication(2_500_000);
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const paymentId = gateway.pay(order.body.data.orderId, 'captured', 100);
  const r = await student.client.post('/api/training/student/payments/verify', { orderId: order.body.data.orderId, paymentId, signature: checkoutSignature(order.body.data.orderId, paymentId) });
  assert.equal(r.status, 400);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 0);
});

test('webhook: bad signature rejected; first delivery processed; replay ignored', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const paymentId = gateway.pay(order.body.data.orderId);
  const raw = webhookBody('payment.captured', gateway.payments.get(paymentId)!);

  const forged = await postWebhook(api.base, raw, { secret: 'attacker-secret' });
  assert.equal(forged.status, 400);
  const tampered = await postWebhook(api.base, raw.replace('"amount":2500000', '"amount":1'), { signature: (await import('node:crypto')).createHmac('sha256', 'rzp_test_webhook_secret').update(raw).digest('hex') });
  assert.equal(tampered.status, 400, 'body changed after signing');
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 0);

  const first = await postWebhook(api.base, raw, { eventId: 'evt_replay_1' });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.outcome, 'paid');
  const replay = await postWebhook(api.base, raw, { eventId: 'evt_replay_1' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.duplicate, true);
  assert.equal(await prisma.invoice.count({ where: { applicationId: app.id } }), 1);
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 1);

  // The checkout callback arriving after the webhook is a no-op success.
  const late = await student.client.post('/api/training/student/payments/verify', { orderId: order.body.data.orderId, paymentId, signature: checkoutSignature(order.body.data.orderId, paymentId) });
  assert.equal(late.body.data.status, 'PAID');
  assert.equal(await prisma.invoice.count({ where: { applicationId: app.id } }), 1);
});

test('webhook payment.failed marks FAILED; a later capture still succeeds; refunds are recorded', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const failedId = gateway.pay(order.body.data.orderId, 'failed');
  await postWebhook(api.base, webhookBody('payment.failed', gateway.payments.get(failedId)!));
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } })).status, 'FAILED');
  const okId = gateway.pay(order.body.data.orderId);
  await postWebhook(api.base, webhookBody('payment.captured', gateway.payments.get(okId)!));
  const paid = await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } });
  assert.equal(paid.status, 'PAID');
  await postWebhook(api.base, webhookBody('refund.processed', { ...gateway.payments.get(okId)!, status: 'refunded' }));
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status, 'REFUNDED');
  assert.equal((await prisma.invoice.findFirstOrThrow({ where: { paymentId: paid.id } })).status, 'REFUNDED');
});

test('a partial refund keeps the payment PAID (access unchanged); only a full refund marks it REFUNDED', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const okId = gateway.pay(order.body.data.orderId);
  await postWebhook(api.base, webhookBody('payment.captured', gateway.payments.get(okId)!));
  const paid = await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } });
  assert.equal(paid.status, 'PAID');

  // Razorpay: refund.processed for a partial refund — the payment entity stays 'captured'.
  const partial = JSON.parse(webhookBody('refund.processed', gateway.payments.get(okId)!));
  partial.payload.payment.entity.amount_refunded = 10_000;
  const r = await postWebhook(api.base, JSON.stringify(partial));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.outcome, 'partial refund recorded');
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status, 'PAID');
  assert.equal((await prisma.invoice.findFirstOrThrow({ where: { paymentId: paid.id } })).status, 'PAID');
  assert.equal((await prisma.admissionApplication.findUniqueOrThrow({ where: { id: app.id } })).status, 'ENROLLED');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'payment.partial_refund', entityId: paid.id } }));

  const full = JSON.parse(webhookBody('refund.processed', { ...gateway.payments.get(okId)!, status: 'refunded' }));
  full.payload.payment.entity.amount_refunded = paid.amountPaise;
  await postWebhook(api.base, JSON.stringify(full));
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: paid.id } })).status, 'REFUNDED');
});

test('client-reported failure can never mark a payment paid', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const r = await student.client.post('/api/training/student/payments/failure', { orderId: order.body.data.orderId, reason: 'User closed the window' });
  assert.equal(r.status, 200);
  assert.equal((await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } })).status, 'FAILED');
});

test('reconciliation reads the provider, not the operator', async () => {
  const { student, app } = await approvedApplication();
  const order = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
  const payment = await prisma.payment.findFirstOrThrow({ where: { applicationId: app.id } });
  const none = await finance.post(`/api/training/admin/payments/${payment.id}/reconcile`);
  assert.equal(none.body.data.result, 'UNCHANGED');
  gateway.pay(order.body.data.orderId); // paid at Razorpay, but the callback/webhook never arrived
  const r = await finance.post(`/api/training/admin/payments/${payment.id}/reconcile`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.result, 'PAID');
  assert.equal(await prisma.enrollment.count({ where: { applicationId: app.id } }), 1);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: payment.id, action: 'payment.reconciled' } }));
});

test('offline payment: ADMIN only, DB amount, mandatory reference and audit trail', async () => {
  const { app } = await approvedApplication(1_500_000);
  const missing = await admin.post(`/api/training/admin/applications/${app.id}/offline-payment`, { method: 'CASH' });
  assert.equal(missing.status, 422);
  const r = await admin.post(`/api/training/admin/applications/${app.id}/offline-payment`, { method: 'CASH', reference: 'RCPT-0042', reason: 'Paid at the Bhopal office', amountPaise: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.amountPaise, 1_500_000);
  assert.equal(r.body.data.verifiedVia, 'OFFLINE_RECORD');
  const dup = await admin.post(`/api/training/admin/applications/${app.id}/offline-payment`, { method: 'CASH', reference: 'RCPT-0043', reason: 'again' });
  assert.equal(dup.status, 409);
  const log = await prisma.auditLog.findFirst({ where: { entityId: r.body.data.id, action: 'payment.offline_recorded' } });
  assert.ok(log?.actorId && log.reason);
});

test('payments not configured -> 503, never a simulated success', async () => {
  const { student, app } = await approvedApplication();
  gateway.configured = false;
  try {
    const r = await student.client.post('/api/training/student/payments/order', { applicationId: app.id });
    assert.equal(r.status, 503);
  } finally {
    gateway.configured = true;
  }
});

test('course fee: confirmation email carries the receipt PDF; receipt resend is logged; offline receipts too', async () => {
  const { testOutbox } = await import('./helpers');
  const { student, app } = await approvedApplication(1_850_000);
  testOutbox.length = 0;
  const { recordId } = await payApplication(student.client, gateway, app.id);
  const mail = testOutbox.find((m) => m.to === student.email && /Payment received/.test(m.subject));
  assert.ok(mail, 'confirmation sent to the student');
  assert.match(mail!.html, /₹18,500\.00/);
  assert.match(mail!.html, /Next steps/);
  assert.equal(mail!.attachments?.[0].content.subarray(0, 5).toString(), '%PDF-');
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { paymentId: recordId } });
  assert.ok(inv.pdfFileId, 'receipt stored privately');
  assert.equal(await prisma.emailLog.count({ where: { entityType: 'Invoice', entityId: inv.id, status: 'SENT' } }), 2, 'student confirmation + team alert');

  const pdf = await student.client.raw(`/api/training/student/invoices/${inv.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal((await finance.raw(`/api/training/admin/payments/${recordId}/receipt.pdf`)).status, 200);
  const resend = await finance.post(`/api/training/admin/payments/${recordId}/receipt/resend`);
  assert.equal(resend.status, 200);
  assert.equal(resend.body.data.status, 'SENT');
  assert.equal(await prisma.emailLog.count({ where: { entityType: 'Invoice', entityId: inv.id, kind: 'payment.confirmation' } }), 2);

  // Offline payments recorded by an admin get the same receipt + email.
  const second = await approvedApplication(900_000);
  testOutbox.length = 0;
  const off = await admin.post(`/api/training/admin/applications/${second.app.id}/offline-payment`, { method: 'BANK_TRANSFER', reference: 'NEFT-123', reason: 'Paid at the office' });
  assert.equal(off.status, 201, JSON.stringify(off.body));
  assert.ok(testOutbox.some((m) => m.to === second.student.email && m.attachments?.length === 1));
});
