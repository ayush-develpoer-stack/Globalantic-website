import { Prisma, type Payment, type PaymentStatus, type PaymentVerification } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { sha256 } from '../lib/crypto';
import { AfterCommit, notify } from './notification.service';
import { emitAdminEvent, recordAdminEvent } from './admin-events.service';
import { confirmEnrollmentTx } from './admission.service';
import { onPaymentRefunded, onVerifiedPayment } from './referral.service';
import { afterPaymentVerified } from './receipt.service';
import { onProgramPaymentRefundedTx, onProgramPaymentVerifiedTx } from './program.service';
import { paymentGateway, verifyCheckoutSignature, verifyWebhookSignature, type GatewayPayment } from './payment-gateway';

/**
 * Payment flow (Razorpay):
 *  1. Student asks for an order -> server reads the payable amount from the
 *     application snapshot (DB) and creates the provider order.
 *  2. Checkout returns {order_id, payment_id, signature} -> server verifies the
 *     HMAC signature AND re-fetches the payment from Razorpay (status + amount).
 *  3. Webhooks (signature-verified, deduplicated by event id) reach the same
 *     idempotent markPaid() path, so whichever arrives first wins.
 *  4. markPaid runs in one transaction with a row lock: payment PAID ->
 *     invoice/receipt -> enrollment -> referral reward -> notification.
 *  5. After commit: receipt PDF, student confirmation email (receipt attached), team alert.
 *
 * Payments belong to an admission application (course / internship) OR a certificate-program
 * enrollment. Program payments never touch the referral system.
 */

const PAYABLE_APP_STATUS = 'APPROVED';

async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${paymentId} FOR UPDATE`;
}

// ---------------------------------------------------------------------------
// Student: create order
// ---------------------------------------------------------------------------

export async function createOrder(studentId: string, applicationId: string) {
  const gateway = paymentGateway();
  if (!gateway.isConfigured()) {
    throw new ApiError(503, 'Online payments are not configured yet. Please contact the admissions team.');
  }
  const app = await prisma.admissionApplication.findFirst({
    where: { id: applicationId, studentId },
    include: { course: { select: { title: true } }, batch: { select: { name: true, status: true } }, student: { select: { name: true, email: true, phone: true } } },
  });
  if (!app) throw ApiError.notFound('Application not found');
  if (app.status !== PAYABLE_APP_STATUS) throw ApiError.conflict('Payment is only possible once your application is approved');
  if (app.payablePaise <= 0) throw ApiError.conflict('No payment is due for this application');
  if (app.batch.status === 'CANCELLED') throw ApiError.conflict('This batch has been cancelled');

  const paid = await prisma.payment.findFirst({ where: { applicationId, status: { in: ['PAID', 'PENDING'] } } });
  if (paid) throw ApiError.conflict(paid.status === 'PAID' ? 'This application is already paid' : 'A payment is already being processed');

  // Re-use an open order for the same amount instead of creating duplicates.
  let payment = await prisma.payment.findFirst({
    where: { applicationId, provider: 'RAZORPAY', status: { in: ['CREATED', 'FAILED'] }, amountPaise: app.payablePaise },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    const order = await gateway.createOrder({
      amountPaise: app.payablePaise,
      currency: 'INR',
      receipt: app.applicationNumber,
      notes: { applicationId: app.id, studentId },
    });
    if (order.amount !== app.payablePaise) throw new ApiError(502, 'The payment provider returned an unexpected amount');
    payment = await prisma.payment.create({
      data: { studentId, applicationId, provider: 'RAZORPAY', providerOrderId: order.id, amountPaise: app.payablePaise, currency: 'INR' },
    });
    await audit(prisma, { id: studentId, role: 'STUDENT' }, { action: 'payment.order_created', entityType: 'Payment', entityId: payment.id, after: { amountPaise: payment.amountPaise } });
  }

  // Only public values go to the browser.
  return {
    paymentId: payment.id,
    keyId: gateway.publicKeyId(),
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    name: 'Globalantic Training',
    description: `${app.course.title} — ${app.batch.name}`,
    prefill: { name: app.student.name, email: app.student.email },
  };
}

// ---------------------------------------------------------------------------
// The single path that turns a payment into PAID
// ---------------------------------------------------------------------------

interface MarkPaidInput {
  paymentId: string;
  providerPaymentId: string | null;
  method: string | null;
  via: PaymentVerification;
  actor?: Actor | null;
}

export async function markPaidTx(tx: Prisma.TransactionClient, input: MarkPaidInput, after: AfterCommit): Promise<Payment> {
  await lockPayment(tx, input.paymentId);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  if (payment.status === 'PAID') return payment; // idempotent (checkout + webhook race, replays)
  if (payment.status === 'REFUNDED') return payment;

  if (input.providerPaymentId) {
    const clash = await tx.payment.findUnique({ where: { providerPaymentId: input.providerPaymentId } });
    if (clash && clash.id !== payment.id) throw ApiError.conflict('This provider payment is already linked to another record');
  }

  if (payment.programEnrollmentId) return programPaidTx(tx, payment, input, after);
  if (!payment.applicationId) throw new Error(`Payment ${payment.id} has no purpose`);

  const app = await tx.admissionApplication.findUniqueOrThrow({
    where: { id: payment.applicationId },
    include: { course: { select: { title: true } }, batch: { select: { name: true } } },
  });
  const otherPaid = await tx.payment.count({ where: { applicationId: app.id, status: 'PAID', id: { not: payment.id } } });

  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: 'PAID',
      providerPaymentId: input.providerPaymentId ?? payment.providerPaymentId,
      method: input.method ?? payment.method,
      verifiedAt: new Date(),
      verifiedVia: input.via,
      failureReason: otherPaid ? 'DUPLICATE_PAYMENT_REFUND_REQUIRED' : null,
    },
  });
  await audit(tx, input.actor ?? null, {
    action: 'payment.paid',
    entityType: 'Payment',
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: 'PAID', via: input.via, duplicate: Boolean(otherPaid) },
  });

  if (otherPaid) {
    // The seat is already paid for: never enroll or reward twice. Finance refunds this one.
    await audit(tx, null, { action: 'payment.duplicate_detected', entityType: 'AdmissionApplication', entityId: app.id, after: { paymentId: payment.id } });
    await duplicatePaymentEvent(tx, payment, after);
    return updated;
  }

  const invoiceNumber = await nextNumber(tx, 'INV');
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      studentId: app.studentId,
      applicationId: app.id,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      lineItems: [
        { description: `${app.course.title} — ${app.batch.name} (course fee)`, amountPaise: app.feePaise },
        ...(app.discountPaise > 0 ? [{ description: 'Discount', amountPaise: -app.discountPaise }] : []),
      ],
    },
  });

  if (app.status === 'APPROVED') {
    await confirmEnrollmentTx(tx, app.id, after);
  } else if (app.status !== 'ENROLLED') {
    // Paid after withdrawal/rejection/cancellation: keep the money record, flag for refund.
    await audit(tx, null, { action: 'payment.needs_attention', entityType: 'Payment', entityId: payment.id, reason: `application status ${app.status}` });
  }

  await onVerifiedPayment(tx, { id: payment.id, studentId: app.studentId, amountPaise: payment.amountPaise }, after);
  await notify(
    tx,
    app.studentId,
    {
      type: 'PAYMENT',
      title: 'Payment received',
      body: `We received your payment for ${app.course.title}. Receipt ${invoiceNumber} is available in your portal.`,
      link: `${env.internPortalUrl}/payments`,
    },
    after,
  );
  await notifyAdminsOfPayment(tx, `${app.course.title} — ${app.batch.name}`, payment.amountPaise, payment.id, after);
  // The confirmation email carries the receipt PDF (replaces the plain notification email).
  after.add(() => afterPaymentVerified(invoice.id));
  return updated;
}

/** Admin notification centre: verified payment (the receipt service sends the dedicated team email). */
async function notifyAdminsOfPayment(tx: Prisma.TransactionClient, what: string, amountPaise: number, paymentId: string, after: AfterCommit) {
  await recordAdminEvent(
    tx,
    {
      dedupeKey: `payment.paid:${paymentId}`,
      category: 'payment',
      type: 'PAYMENT',
      severity: 'important',
      title: `Payment verified: Rs ${(amountPaise / 100).toFixed(2)}`,
      body: what,
      link: `/payments/${paymentId}`,
      entityType: 'Payment',
      entityId: paymentId,
      email: false,
    },
    after,
  );
}

async function duplicatePaymentEvent(tx: Prisma.TransactionClient, payment: Payment, after: AfterCommit) {
  await recordAdminEvent(
    tx,
    {
      dedupeKey: `payment.duplicate:${payment.id}`,
      category: 'payment',
      severity: 'critical',
      title: `Duplicate payment — refund required: Rs ${(payment.amountPaise / 100).toFixed(2)}`,
      body: 'A second payment was captured for something already paid. Nothing was enrolled twice; record the refund.',
      link: `/payments/${payment.id}`,
      entityType: 'Payment',
      entityId: payment.id,
    },
    after,
  );
}

/** Certificate-program fee: receipt + enrollment activation (program.service), no referral reward. */
async function programPaidTx(tx: Prisma.TransactionClient, payment: Payment, input: MarkPaidInput, after: AfterCommit): Promise<Payment> {
  const otherPaid = await tx.payment.count({ where: { programEnrollmentId: payment.programEnrollmentId, status: 'PAID', id: { not: payment.id } } });
  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: 'PAID',
      providerPaymentId: input.providerPaymentId ?? payment.providerPaymentId,
      method: input.method ?? payment.method,
      verifiedAt: new Date(),
      verifiedVia: input.via,
      failureReason: otherPaid ? 'DUPLICATE_PAYMENT_REFUND_REQUIRED' : null,
    },
  });
  await audit(tx, input.actor ?? null, { action: 'payment.paid', entityType: 'Payment', entityId: payment.id, before: { status: payment.status }, after: { status: 'PAID', via: input.via, duplicate: Boolean(otherPaid) } });
  if (otherPaid) {
    await audit(tx, null, { action: 'payment.duplicate_detected', entityType: 'ProgramEnrollment', entityId: payment.programEnrollmentId!, after: { paymentId: payment.id } });
    await duplicatePaymentEvent(tx, payment, after);
    return updated;
  }
  const { invoiceId, title } = await onProgramPaymentVerifiedTx(tx, updated, after);
  await notifyAdminsOfPayment(tx, title, payment.amountPaise, payment.id, after);
  after.add(() => afterPaymentVerified(invoiceId));
  return updated;
}

async function markPaid(input: MarkPaidInput): Promise<Payment> {
  const after = new AfterCommit();
  const result = await prisma.$transaction((tx) => markPaidTx(tx, input, after), { timeout: 20_000 });
  await after.flush();
  return result;
}

function assertGatewayPaymentMatches(gp: GatewayPayment, payment: Payment) {
  if (gp.orderId !== payment.providerOrderId || gp.amount !== payment.amountPaise || gp.currency !== payment.currency) {
    throw ApiError.badRequest('Payment details do not match the order');
  }
}

// ---------------------------------------------------------------------------
// Student: verify checkout result
// ---------------------------------------------------------------------------

export async function verifyCheckout(studentId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.orderId } });
  if (!payment || payment.studentId !== studentId) throw ApiError.notFound('Payment not found');

  if (!verifyCheckoutSignature(input.orderId, input.paymentId, input.signature)) {
    await audit(prisma, { id: studentId, role: 'STUDENT' }, { action: 'payment.invalid_signature', entityType: 'Payment', entityId: payment.id });
    throw ApiError.badRequest('Payment verification failed');
  }
  if (payment.status === 'PAID') return { status: payment.status as PaymentStatus, paymentId: payment.id };

  // Trusted server-side data: re-fetch the payment from the provider.
  const gp = await paymentGateway().fetchPayment(input.paymentId);
  assertGatewayPaymentMatches(gp, payment);
  if (gp.status === 'captured') {
    const paid = await markPaid({ paymentId: payment.id, providerPaymentId: gp.id, method: gp.method, via: 'CHECKOUT_SIGNATURE' });
    return { status: paid.status, paymentId: paid.id };
  }
  if (gp.status === 'authorized') {
    await prisma.payment.updateMany({ where: { id: payment.id, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'PENDING', providerPaymentId: gp.id } });
    return { status: 'PENDING' as const, paymentId: payment.id };
  }
  await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
    data: { status: 'FAILED', failureReason: gp.errorDescription?.slice(0, 300) ?? `Provider status: ${gp.status}` },
  });
  return { status: 'FAILED' as const, paymentId: payment.id };
}

/** Checkout reported a failure/dismissal. Informational only: it can never mark anything paid. */
export async function reportCheckoutFailure(studentId: string, orderId: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment || payment.studentId !== studentId) throw ApiError.notFound('Payment not found');
  const res = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'CREATED' },
    data: { status: 'FAILED', failureReason: reason.slice(0, 300) },
  });
  if (res.count) await paymentFailedEvent(payment.id, payment.amountPaise, reason);
  // Report the real state: a late failure report never overrides a verified payment.
  return { status: res.count ? ('FAILED' as const) : payment.status };
}

function paymentFailedEvent(paymentId: string, amountPaise: number, reason: string) {
  return emitAdminEvent({
    dedupeKey: `payment.failed:${paymentId}`,
    category: 'payment',
    severity: 'info',
    title: `Payment failed: Rs ${(amountPaise / 100).toFixed(2)}`,
    body: reason.slice(0, 200) || 'The checkout did not complete.',
    link: `/payments/${paymentId}`,
    entityType: 'Payment',
    entityId: paymentId,
  });
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

interface RazorpayWebhook {
  event: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    refund?: { entity?: Record<string, unknown> };
    dispute?: { entity?: Record<string, unknown> };
  };
}

export async function handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined, eventIdHeader: string | undefined) {
  if (!verifyWebhookSignature(rawBody, signature)) {
    // Failed security event (no payload or signature values are stored).
    await prisma.auditLog
      .create({ data: { actorId: null, actorRole: 'ANONYMOUS', action: 'security.webhook_invalid_signature', entityType: 'PaymentWebhook', entityId: 'razorpay' } })
      .catch(() => {});
    await emitAdminEvent({
      dedupeKey: `system.webhook_invalid_signature:${new Date().toISOString().slice(0, 13)}`,
      category: 'system',
      severity: 'important',
      title: 'Payment webhook rejected: invalid signature',
      body: 'A request to the Razorpay webhook failed signature verification. If this repeats, check RAZORPAY_WEBHOOK_SECRET.',
      link: '/audit',
      entityType: 'PaymentWebhook',
      entityId: 'razorpay',
      email: false,
    });
    throw ApiError.badRequest('Invalid webhook signature');
  }
  let body: RazorpayWebhook;
  try {
    body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhook;
  } catch {
    throw ApiError.badRequest('Invalid webhook payload');
  }
  const eventId = (eventIdHeader && eventIdHeader.slice(0, 100)) || `sha256:${sha256(rawBody)}`;

  // Replay protection: the event id is unique; a second delivery inserts nothing.
  const inserted = await prisma.paymentWebhookEvent.createMany({
    data: [{ provider: 'RAZORPAY', eventId, eventType: String(body.event).slice(0, 60), payloadHash: sha256(rawBody) }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return { duplicate: true, outcome: 'ignored (replay)' };

  let outcome: string;
  try {
    outcome = await processWebhookEvent(body);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode < 500) {
      // Permanent rejection (e.g. amount mismatch): record it, do not ask for a retry.
      outcome = `rejected: ${err.message}`;
      await audit(prisma, null, { action: 'payment.webhook_rejected', entityType: 'PaymentWebhookEvent', entityId: eventId, reason: err.message });
    } else {
      // Transient failure: forget this delivery so the provider's retry is processed.
      await prisma.paymentWebhookEvent.delete({ where: { eventId } }).catch(() => {});
      throw err;
    }
  }
  await prisma.paymentWebhookEvent.update({ where: { eventId }, data: { processedAt: new Date(), outcome } });
  return { duplicate: false, outcome };
}

const DISPUTE_EVENTS: Record<string, string> = {
  'payment.dispute.created': 'OPEN',
  'payment.dispute.action_required': 'OPEN',
  'payment.dispute.under_review': 'UNDER_REVIEW',
  'payment.dispute.won': 'WON',
  'payment.dispute.lost': 'LOST',
  'payment.dispute.closed': 'CLOSED',
};

/**
 * Chargebacks: the dispute state is recorded on the payment and flagged to admins. The money
 * status is not changed automatically — a lost dispute is settled by finance (refund record).
 */
async function processDispute(body: RazorpayWebhook, state: string): Promise<string> {
  const providerPaymentId = String(body.payload?.dispute?.entity?.payment_id ?? body.payload?.payment?.entity?.id ?? '');
  if (!providerPaymentId) return 'ignored (dispute without payment id)';
  const payment = await prisma.payment.findUnique({ where: { providerPaymentId } });
  if (!payment) return 'ignored (unknown payment)';
  const after = new AfterCommit();
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { disputeStatus: state, disputedAt: payment.disputedAt ?? new Date() } });
    await audit(tx, null, { action: 'payment.dispute', entityType: 'Payment', entityId: payment.id, before: { disputeStatus: payment.disputeStatus }, after: { disputeStatus: state, event: body.event } });
    await recordAdminEvent(
      tx,
      {
        dedupeKey: `payment.dispute:${payment.id}:${state}`,
        category: 'payment',
        type: 'PAYMENT_DISPUTE',
        severity: 'critical',
        title: `Payment dispute ${state.toLowerCase().replace('_', ' ')}`,
        body: `Payment ${providerPaymentId} — review it in the payments screen${state === 'LOST' ? ' and record the refund' : ''}.`,
        link: `/payments/${payment.id}`,
        entityType: 'Payment',
        entityId: payment.id,
      },
      after,
    );
  });
  await after.flush();
  return `dispute ${state.toLowerCase()}`;
}

async function processWebhookEvent(body: RazorpayWebhook): Promise<string> {
  if (DISPUTE_EVENTS[body.event]) return processDispute(body, DISPUTE_EVENTS[body.event]);
  const entity = body.payload?.payment?.entity;
  if (!entity) return 'ignored (no payment entity)';
  const gp: GatewayPayment = {
    id: String(entity.id),
    orderId: (entity.order_id as string) ?? null,
    amount: Number(entity.amount),
    currency: String(entity.currency ?? 'INR'),
    status: String(entity.status),
    method: (entity.method as string) ?? null,
    errorDescription: (entity.error_description as string) ?? null,
  };
  if (!gp.orderId) return 'ignored (no order id)';
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: gp.orderId } });
  if (!payment) return 'ignored (unknown order)';

  switch (body.event) {
    case 'payment.captured':
    case 'order.paid': {
      assertGatewayPaymentMatches(gp, payment);
      await markPaid({ paymentId: payment.id, providerPaymentId: gp.id, method: gp.method, via: 'WEBHOOK' });
      return 'paid';
    }
    case 'payment.authorized': {
      await prisma.payment.updateMany({ where: { id: payment.id, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'PENDING', providerPaymentId: gp.id } });
      return 'pending';
    }
    case 'payment.failed': {
      const res = await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
        data: { status: 'FAILED', failureReason: gp.errorDescription?.slice(0, 300) ?? 'Payment failed' },
      });
      if (res.count) await paymentFailedEvent(payment.id, payment.amountPaise, gp.errorDescription ?? 'Payment failed');
      return res.count ? 'failed' : 'ignored (already final)';
    }
    case 'refund.processed':
    case 'payment.refunded': {
      // Razorpay sends refund.processed for partial refunds too. Only a full refund (entity status
      // 'refunded', or the whole amount returned) may revoke the enrollment and reverse rewards.
      const refundedPaise = Number(entity.amount_refunded ?? 0);
      if (gp.status !== 'refunded' && !(refundedPaise >= payment.amountPaise)) {
        await audit(prisma, null, {
          action: 'payment.partial_refund',
          entityType: 'Payment',
          entityId: payment.id,
          after: { status: payment.status, amountRefundedPaise: refundedPaise },
          reason: 'Partial refund processed by provider',
        });
        await emitAdminEvent({
          dedupeKey: `payment.partial_refund:${payment.id}:${refundedPaise}`,
          category: 'payment',
          severity: 'important',
          title: `Partial refund: Rs ${(refundedPaise / 100).toFixed(2)} of Rs ${(payment.amountPaise / 100).toFixed(2)}`,
          body: 'The payment stays PAID and access is unchanged. Review it in the payments list.',
          link: `/payments/${payment.id}`,
          entityType: 'Payment',
          entityId: payment.id,
        });
        return 'partial refund recorded';
      }
      await markRefunded(payment.id, null, 'Refund processed by provider');
      return 'refunded';
    }
    default:
      return `ignored (${body.event})`;
  }
}

async function markRefunded(paymentId: string, actor: Actor | null, reason: string) {
  const after = new AfterCommit();
  await prisma.$transaction(async (tx) => {
    await lockPayment(tx, paymentId);
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.status === 'REFUNDED') return;
    if (p.status !== 'PAID') throw ApiError.conflict('Only paid payments can be refunded');
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED', refundedAt: new Date() } });
    await tx.invoice.updateMany({ where: { paymentId }, data: { status: 'REFUNDED' } });
    if (p.programEnrollmentId) await onProgramPaymentRefundedTx(tx, p, actor);
    else await onPaymentRefunded(tx, paymentId);
    await audit(tx, actor, { action: 'payment.refunded', entityType: 'Payment', entityId: paymentId, before: { status: 'PAID' }, after: { status: 'REFUNDED' }, reason });
    await recordAdminEvent(
      tx,
      {
        dedupeKey: `payment.refunded:${paymentId}`,
        category: 'payment',
        severity: 'important',
        title: `Refund recorded: Rs ${(p.amountPaise / 100).toFixed(2)}`,
        body: reason.slice(0, 200),
        link: `/payments/${paymentId}`,
        entityType: 'Payment',
        entityId: paymentId,
      },
      after,
    );
  });
  await after.flush();
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminListPayments(q: { status?: PaymentStatus; search?: string; sort?: string; skip: number; take: number }) {
  const where: Prisma.PaymentWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { providerOrderId: { contains: q.search } },
            { providerPaymentId: { contains: q.search } },
            { student: { email: { contains: q.search, mode: 'insensitive' } } },
            { student: { name: { contains: q.search, mode: 'insensitive' } } },
            { application: { applicationNumber: { contains: q.search, mode: 'insensitive' } } },
            { programEnrollment: { enrollmentNumber: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total, totals] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: orderByFrom<Prisma.PaymentOrderByWithRelationInput>(q.sort, { createdAt: (d) => ({ createdAt: d }), amountPaise: (d) => ({ amountPaise: d }), status: (d) => ({ status: d }), verifiedAt: (d) => ({ verifiedAt: d }) }, { createdAt: 'desc' }),
      skip: q.skip,
      take: q.take,
      include: {
        student: { select: { id: true, name: true, email: true } },
        application: { select: { id: true, applicationNumber: true, course: { select: { title: true } }, batch: { select: { name: true } } } },
        programEnrollment: { select: { id: true, enrollmentNumber: true, program: { select: { title: true } } } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['status'], _count: true, _sum: { amountPaise: true } }),
  ]);
  return { items, total, totals: Object.fromEntries(totals.map((t) => [t.status, { count: t._count, amountPaise: t._sum.amountPaise ?? 0 }])) };
}

export async function adminGetPayment(id: string) {
  const p = await prisma.payment.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true } },
      application: { select: { id: true, applicationNumber: true, status: true, payablePaise: true } },
      programEnrollment: { select: { id: true, enrollmentNumber: true, status: true, feePaise: true, program: { select: { title: true } } } },
      invoice: { select: { id: true, invoiceNumber: true, amountPaise: true, status: true, issuedAt: true, pdfFileId: true } },
      referralReward: { select: { id: true, status: true, amountPaise: true } },
    },
  });
  if (!p) throw ApiError.notFound('Payment not found');
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'Payment', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { name: true, role: true } } },
  });
  const emails = p.invoice ? await prisma.emailLog.findMany({ where: { entityType: 'Invoice', entityId: p.invoice.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, kind: true, to: true, status: true, error: true, createdAt: true } }) : [];
  return { ...p, history, emails };
}

/** Asks Razorpay what actually happened to an order and applies it. Never trusts the operator's opinion. */
export async function reconcilePayment(actor: Actor, id: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.provider !== 'RAZORPAY' || !payment.providerOrderId) throw ApiError.conflict('Only online payments can be reconciled');
  const attempts = await paymentGateway().fetchOrderPayments(payment.providerOrderId);
  const captured = attempts.find((a) => a.status === 'captured' && a.amount === payment.amountPaise && a.currency === payment.currency);
  let result: string;
  if (captured) {
    await markPaid({ paymentId: id, providerPaymentId: captured.id, method: captured.method, via: 'RECONCILIATION', actor });
    result = 'PAID';
  } else if (attempts.some((a) => a.status === 'refunded') && payment.status === 'PAID') {
    await markRefunded(id, actor, 'Reconciliation found a refund');
    result = 'REFUNDED';
  } else if (attempts.length && attempts.every((a) => a.status === 'failed') && payment.status !== 'PAID') {
    await prisma.payment.updateMany({ where: { id, status: { in: ['CREATED', 'PENDING'] } }, data: { status: 'FAILED', failureReason: 'All attempts failed (reconciled)' } });
    result = 'FAILED';
  } else {
    result = 'UNCHANGED';
  }
  await audit(prisma, actor, { action: 'payment.reconciled', entityType: 'Payment', entityId: id, after: { result, attempts: attempts.length } });
  return { result, attempts: attempts.map((a) => ({ id: a.id, status: a.status, amount: a.amount, method: a.method })) };
}

/**
 * Records a payment received outside Razorpay (cash / bank transfer at the office).
 * ADMIN-only permission, mandatory reference + reason, amount taken from the DB,
 * full audit trail, and the resulting referral reward always goes to manual review.
 */
export async function recordOfflinePayment(actor: Actor, applicationId: string, input: { method: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'; reference: string; reason: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "admission_applications" WHERE id = ${applicationId} FOR UPDATE`;
      const app = await tx.admissionApplication.findUnique({ where: { id: applicationId } });
      if (!app) throw ApiError.notFound('Application not found');
      if (app.status !== 'APPROVED') throw ApiError.conflict('Offline payments can only be recorded for approved applications');
      if (app.payablePaise <= 0) throw ApiError.conflict('No payment is due for this application');
      const existing = await tx.payment.count({ where: { applicationId, status: { in: ['PAID', 'PENDING'] } } });
      if (existing) throw ApiError.conflict('This application already has a paid or pending payment');

      const payment = await tx.payment.create({
        data: {
          studentId: app.studentId,
          applicationId,
          provider: 'OFFLINE',
          amountPaise: app.payablePaise,
          status: 'CREATED',
          method: input.method,
          offlineReference: input.reference.trim(),
          recordedById: actor.id,
        },
      });
      await audit(tx, actor, {
        action: 'payment.offline_recorded',
        entityType: 'Payment',
        entityId: payment.id,
        after: { amountPaise: payment.amountPaise, method: input.method, reference: input.reference.trim() },
        reason: input.reason,
      });
      const paid = await markPaidTx(tx, { paymentId: payment.id, providerPaymentId: null, method: input.method, via: 'OFFLINE_RECORD', actor }, after);
      // Offline payments never auto-qualify a referral reward: it always goes to manual review.
      await tx.referralReward.updateMany({ where: { paymentId: paid.id, status: 'PENDING' }, data: { status: 'UNDER_REVIEW' } });
      return paid;
    },
    { timeout: 20_000 },
  );
  await after.flush();
  return result;
}

export async function adminRefundRecord(actor: Actor, id: string, reason: string) {
  // Records a refund that finance already executed in the Razorpay dashboard / bank.
  await markRefunded(id, actor, reason);
  return prisma.payment.findUniqueOrThrow({ where: { id } });
}

// ---------------------------------------------------------------------------
// Student views
// ---------------------------------------------------------------------------

export async function listMyPayments(studentId: string) {
  return prisma.payment.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      amountPaise: true,
      currency: true,
      provider: true,
      method: true,
      verifiedAt: true,
      failureReason: true,
      createdAt: true,
      application: { select: { id: true, applicationNumber: true, course: { select: { title: true } }, batch: { select: { name: true } } } },
      programEnrollment: { select: { id: true, enrollmentNumber: true, program: { select: { title: true } } } },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  });
}

export async function listMyInvoices(studentId: string) {
  return prisma.invoice.findMany({
    where: { studentId },
    orderBy: { issuedAt: 'desc' },
    include: { application: { select: { applicationNumber: true, course: { select: { title: true } }, batch: { select: { name: true } } } }, programEnrollment: { select: { enrollmentNumber: true, program: { select: { title: true } } } } },
  });
}

export async function getMyInvoice(studentId: string, id: string) {
  const inv = await prisma.invoice.findFirst({
    where: { id, studentId },
    include: {
      student: { select: { name: true, email: true } },
      payment: { select: { provider: true, providerPaymentId: true, method: true, verifiedAt: true } },
      application: { select: { applicationNumber: true, course: { select: { title: true } }, batch: { select: { name: true } } } },
      programEnrollment: { select: { enrollmentNumber: true, program: { select: { title: true } } } },
    },
  });
  if (!inv) throw ApiError.notFound('Invoice not found');
  return inv;
}
