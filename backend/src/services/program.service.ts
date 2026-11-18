import crypto from 'node:crypto';
import { Prisma, type Payment, type ProgramEnrollmentStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { randomCode } from '../lib/crypto';
import { formatPaise } from '../lib/money';
import { renderCertificatePdf } from '../lib/pdf/documents';
import { AfterCommit, notify } from './notification.service';
import { emitAdminEvent } from './admin-events.service';
import { paymentGateway } from './payment-gateway';
import { companySnapshot, getProfile } from './business-profile.service';
import { esc, layout, sendLogged } from './email.service';
import { readStored, storageConfigured, storeGenerated } from './file.service';

/**
 * Paid certificate program — a separate module from courses, internships and intern exams.
 *
 *  register -> PENDING_PAYMENT -> (verified payment) ACTIVE -> lessons + final assessment
 *  -> certificate (automatic, only when every rule below holds) -> COMPLETED
 *
 * Certificate eligibility (checked again inside the issuing transaction):
 *  - the fee is paid: a PAID, non-refunded payment for this enrollment
 *  - every required lesson is completed (each lesson enforces its minimum time)
 *  - a submitted final-assessment attempt scored at least the pass mark
 * Paying alone never produces a certificate. Answer keys never leave the server.
 */

type Db = Prisma.TransactionClient | typeof prisma;
const SUBMIT_GRACE_MS = 2 * 60_000;
const certificateVerifyUrl = (code: string) => `${env.trainingUrl}/certificates/verify?code=${encodeURIComponent(code)}`;

// ===========================================================================
// Public
// ===========================================================================

const publicSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  feePaise: true,
  currency: true,
  passPercent: true,
  maxAttempts: true,
  timeLimitMinutes: true,
  certificateTitle: true,
  lessons: { where: { archivedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, minMinutes: true, required: true } },
} satisfies Prisma.CertificateProgramSelect;

export async function listPublicPrograms() {
  return prisma.certificateProgram.findMany({ where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, select: publicSelect });
}

export async function getPublicProgram(slug: string) {
  const p = await prisma.certificateProgram.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { ...publicSelect, _count: { select: { questions: { where: { archivedAt: null } } } } } });
  if (!p) throw ApiError.notFound('Program not found');
  const { _count, ...rest } = p;
  return { ...rest, questionCount: _count.questions };
}

// ===========================================================================
// Eligibility
// ===========================================================================

export interface ProgramEligibility {
  eligible: boolean;
  paid: boolean;
  lessonsDone: number;
  lessonsRequired: number;
  passedAttempt: { id: string; scorePercent: number } | null;
  reasons: string[];
}

export async function programEligibility(db: Db, enrollmentId: string): Promise<ProgramEligibility> {
  const e = await db.programEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: { select: { lessons: { where: { archivedAt: null, required: true }, select: { id: true } } } },
      lessonProgress: { where: { completedAt: { not: null } }, select: { lessonId: true } },
      attempts: { where: { passed: true, submittedAt: { not: null } }, orderBy: { scorePercent: 'desc' }, take: 1, select: { id: true, scorePercent: true } },
      payments: { where: { status: 'PAID' }, select: { id: true } },
    },
  });
  if (!e) throw ApiError.notFound('Enrollment not found');
  const required = e.program.lessons.map((l) => l.id);
  const done = new Set(e.lessonProgress.map((p) => p.lessonId));
  const lessonsDone = required.filter((id) => done.has(id)).length;
  const paid = e.payments.length > 0 && (e.status === 'ACTIVE' || e.status === 'COMPLETED');
  const passed = e.attempts[0] ? { id: e.attempts[0].id, scorePercent: e.attempts[0].scorePercent ?? 0 } : null;
  const reasons: string[] = [];
  if (!paid) reasons.push('The program fee has not been verified');
  if (lessonsDone < required.length) reasons.push(`${required.length - lessonsDone} required lesson(s) not completed`);
  if (!passed) reasons.push('The final assessment has not been passed');
  return { eligible: reasons.length === 0, paid, lessonsDone, lessonsRequired: required.length, passedAttempt: passed, reasons };
}

// ===========================================================================
// Student
// ===========================================================================

async function lockEnrollment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "program_enrollments" WHERE id = ${id} FOR UPDATE`;
}

async function ownEnrollment(db: Db, studentId: string, enrollmentId: string) {
  const e = await db.programEnrollment.findFirst({ where: { id: enrollmentId, studentId }, include: { program: true } });
  if (!e) throw ApiError.notFound('Enrollment not found');
  return e;
}

function assertActive(e: { status: ProgramEnrollmentStatus }) {
  if (e.status === 'PENDING_PAYMENT') throw ApiError.forbidden('Complete the program fee payment to unlock the lessons');
  if (e.status !== 'ACTIVE' && e.status !== 'COMPLETED') throw ApiError.forbidden('This enrollment is not active');
}

export async function register(studentId: string, slug: string) {
  const program = await prisma.certificateProgram.findFirst({ where: { slug, status: 'PUBLISHED' } });
  if (!program) throw ApiError.notFound('Program not found');
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.programEnrollment.findUnique({ where: { programId_studentId: { programId: program.id, studentId } } });
    if (existing) {
      if (existing.status !== 'CANCELLED') return { enrollment: existing, created: false };
      // A cancelled (never paid) registration can be re-opened at the current fee.
      const reopened = await tx.programEnrollment.update({ where: { id: existing.id }, data: { status: 'PENDING_PAYMENT', feePaise: program.feePaise, cancelledAt: null } });
      await audit(tx, { id: studentId, role: 'STUDENT' }, { action: 'program.reregistered', entityType: 'ProgramEnrollment', entityId: existing.id, after: { feePaise: program.feePaise } });
      return { enrollment: reopened, created: false };
    }
    const enrollment = await tx.programEnrollment.create({
      data: { enrollmentNumber: await nextNumber(tx, 'PRG'), programId: program.id, studentId, feePaise: program.feePaise, currency: program.currency },
    });
    await audit(tx, { id: studentId, role: 'STUDENT' }, { action: 'program.registered', entityType: 'ProgramEnrollment', entityId: enrollment.id, after: { programId: program.id, feePaise: program.feePaise } });
    await notify(tx, studentId, { type: 'PROGRAM', title: `Registered: ${program.title}`, body: `Enrollment ${enrollment.enrollmentNumber}. Pay the program fee of ${formatPaise(enrollment.feePaise)} to unlock the lessons.`, link: `${env.internPortalUrl}/program/${enrollment.id}` });
    return { enrollment, created: true };
  });
  if (result.created || result.enrollment.status === 'PENDING_PAYMENT') {
    await emitAdminEvent({
      dedupeKey: `program.registered:${result.enrollment.id}:${result.enrollment.updatedAt.getTime()}`,
      category: 'program',
      severity: 'info',
      title: `Program registration: ${program.title}`,
      body: `Enrollment ${result.enrollment.enrollmentNumber} — awaiting payment`,
      link: `/programs/enrollments/${result.enrollment.id}`,
      entityType: 'ProgramEnrollment',
      entityId: result.enrollment.id,
    });
  }
  return result;
}

/** Razorpay order for the enrollment's fee snapshot (the amount is never taken from the client). */
export async function createOrder(studentId: string, enrollmentId: string) {
  const gateway = paymentGateway();
  if (!gateway.isConfigured()) throw new ApiError(503, 'Online payments are not configured yet. Please contact us to complete your registration.');
  const e = await prisma.programEnrollment.findFirst({ where: { id: enrollmentId, studentId }, include: { program: { select: { title: true } }, student: { select: { name: true, email: true } } } });
  if (!e) throw ApiError.notFound('Enrollment not found');
  if (e.status !== 'PENDING_PAYMENT') throw ApiError.conflict(e.status === 'ACTIVE' || e.status === 'COMPLETED' ? 'The program fee is already paid' : 'This enrollment cannot be paid');
  if (e.feePaise <= 0) throw ApiError.conflict('No payment is due');
  const busy = await prisma.payment.findFirst({ where: { programEnrollmentId: e.id, status: { in: ['PAID', 'PENDING'] } } });
  if (busy) throw ApiError.conflict(busy.status === 'PAID' ? 'The program fee is already paid' : 'A payment is already being processed');

  let payment = await prisma.payment.findFirst({ where: { programEnrollmentId: e.id, provider: 'RAZORPAY', status: { in: ['CREATED', 'FAILED'] }, amountPaise: e.feePaise }, orderBy: { createdAt: 'desc' } });
  if (!payment) {
    const order = await gateway.createOrder({ amountPaise: e.feePaise, currency: e.currency, receipt: e.enrollmentNumber, notes: { programEnrollmentId: e.id, studentId } });
    if (order.amount !== e.feePaise) throw new ApiError(502, 'The payment provider returned an unexpected amount');
    payment = await prisma.payment.create({ data: { studentId, programEnrollmentId: e.id, provider: 'RAZORPAY', providerOrderId: order.id, amountPaise: e.feePaise, currency: e.currency } });
    await audit(prisma, { id: studentId, role: 'STUDENT' }, { action: 'payment.order_created', entityType: 'Payment', entityId: payment.id, after: { amountPaise: payment.amountPaise, programEnrollmentId: e.id } });
  }
  return {
    paymentId: payment.id,
    keyId: gateway.publicKeyId(),
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    name: 'Globalantic',
    description: `${e.program.title} — program fee`,
    prefill: { name: e.student.name, email: e.student.email },
  };
}

/** Called by payment.service inside the verified-payment transaction. */
export async function onProgramPaymentVerifiedTx(tx: Prisma.TransactionClient, payment: Payment, after: AfterCommit): Promise<{ invoiceId: string; title: string }> {
  const id = payment.programEnrollmentId!;
  await lockEnrollment(tx, id);
  const e = await tx.programEnrollment.findUniqueOrThrow({ where: { id }, include: { program: { select: { title: true } } } });
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: await nextNumber(tx, 'INV'),
      studentId: e.studentId,
      programEnrollmentId: e.id,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      lineItems: [{ description: `${e.program.title} (program fee)`, amountPaise: payment.amountPaise }],
    },
  });
  if (e.status === 'PENDING_PAYMENT') {
    await tx.programEnrollment.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: new Date() } });
    await audit(tx, null, { action: 'program.activated', entityType: 'ProgramEnrollment', entityId: id, after: { paymentId: payment.id } });
    await notify(tx, e.studentId, { type: 'PROGRAM', title: 'Program unlocked', body: `Your payment for ${e.program.title} is verified. You can start the lessons now.`, link: `${env.internPortalUrl}/program/${id}` }, after);
  } else {
    // Paid after cancellation (or a second order): keep the money record and flag it for a refund.
    await audit(tx, null, { action: 'payment.needs_attention', entityType: 'Payment', entityId: payment.id, reason: `program enrollment status ${e.status}` });
  }
  return { invoiceId: invoice.id, title: e.program.title };
}

/** Called by payment.service inside the refund transaction. */
export async function onProgramPaymentRefundedTx(tx: Prisma.TransactionClient, payment: Payment, actor: Actor | null) {
  const id = payment.programEnrollmentId!;
  await lockEnrollment(tx, id);
  const e = await tx.programEnrollment.findUniqueOrThrow({ where: { id }, include: { certificate: { select: { id: true, status: true, certificateNumber: true } } } });
  const stillPaid = await tx.payment.count({ where: { programEnrollmentId: id, status: 'PAID', id: { not: payment.id } } });
  if (stillPaid) return; // a duplicate payment was refunded; the enrollment stays paid
  if (e.certificate?.status === 'ISSUED') {
    // Never silently revoke an issued certificate: flag it for an admin decision.
    await audit(tx, actor, { action: 'program.refunded_after_certificate', entityType: 'ProgramEnrollment', entityId: id, after: { certificate: e.certificate.certificateNumber } });
    const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    for (const a of admins) await notify(tx, a.id, { type: 'PROGRAM', title: 'Refund after certificate issue', body: `Certificate ${e.certificate.certificateNumber} was issued before this refund. Decide whether to revoke it.`, link: `${env.adminPortalUrl}/programs/enrollments/${id}` });
    return;
  }
  await tx.programEnrollment.update({ where: { id }, data: { status: 'REFUNDED', cancelledAt: new Date() } });
  await audit(tx, actor, { action: 'program.refunded', entityType: 'ProgramEnrollment', entityId: id, before: { status: e.status }, after: { status: 'REFUNDED' } });
}

const ATTEMPT_SUMMARY = { id: true, scorePercent: true, passed: true, correctCount: true, startedAt: true, deadlineAt: true, submittedAt: true } satisfies Prisma.ProgramAttemptSelect;

export async function myEnrollments(studentId: string) {
  const rows = await prisma.programEnrollment.findMany({
    where: { studentId },
    orderBy: { registeredAt: 'desc' },
    include: {
      program: { select: { id: true, slug: true, title: true, summary: true } },
      certificate: { select: { id: true, certificateNumber: true, status: true, issuedAt: true } },
    },
  });
  return rows;
}

export async function myEnrollment(studentId: string, enrollmentId: string) {
  const e = await prisma.programEnrollment.findFirst({
    where: { id: enrollmentId, studentId },
    include: {
      program: { select: { id: true, slug: true, title: true, summary: true, description: true, passPercent: true, maxAttempts: true, timeLimitMinutes: true, questionsPerAttempt: true, certificateTitle: true, lessons: { where: { archivedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, minMinutes: true, required: true } } } },
      lessonProgress: { select: { lessonId: true, openedAt: true, completedAt: true } },
      attempts: { orderBy: { startedAt: 'desc' }, select: ATTEMPT_SUMMARY },
      certificate: { select: { id: true, certificateNumber: true, verificationCode: true, status: true, issuedAt: true, scorePercent: true } },
      payments: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, amountPaise: true, currency: true, method: true, verifiedAt: true, createdAt: true, invoice: { select: { id: true, invoiceNumber: true } } } },
    },
  });
  if (!e) throw ApiError.notFound('Enrollment not found');
  const eligibility = await programEligibility(prisma, e.id);
  const used = e.attempts.filter((a) => a.submittedAt).length;
  const allowed = e.program.maxAttempts + e.extraAttempts;
  const open = e.attempts.find((a) => !a.submittedAt && a.deadlineAt.getTime() + SUBMIT_GRACE_MS > Date.now()) ?? null;
  const { extraAttempts, ...rest } = e;
  void extraAttempts;
  return { ...rest, eligibility, attemptsUsed: used, attemptsAllowed: allowed, openAttemptId: open?.id ?? null, verifyUrl: e.certificate ? certificateVerifyUrl(e.certificate.verificationCode) : null };
}

export async function openLesson(studentId: string, enrollmentId: string, lessonId: string) {
  const e = await ownEnrollment(prisma, studentId, enrollmentId);
  assertActive(e);
  const lesson = await prisma.programLesson.findFirst({ where: { id: lessonId, programId: e.programId, archivedAt: null } });
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const progress = await prisma.programLessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: { enrollmentId, lessonId },
    update: {},
  });
  const readyAt = new Date(progress.openedAt.getTime() + lesson.minMinutes * 60_000);
  return { lesson: { id: lesson.id, title: lesson.title, body: lesson.body, videoUrl: lesson.videoUrl, minMinutes: lesson.minMinutes, required: lesson.required, position: lesson.position }, openedAt: progress.openedAt, completedAt: progress.completedAt, canCompleteAt: readyAt, serverNow: new Date() };
}

/** Tolerated difference between the database clock and the API server clock. */
const CLOCK_SKEW_MS = 5_000;

export async function completeLesson(studentId: string, enrollmentId: string, lessonId: string) {
  const e = await ownEnrollment(prisma, studentId, enrollmentId);
  assertActive(e);
  const lesson = await prisma.programLesson.findFirst({ where: { id: lessonId, programId: e.programId, archivedAt: null } });
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const p = await prisma.programLessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId } } });
  if (!p) throw ApiError.conflict('Open the lesson first');
  if (p.completedAt) return { completedAt: p.completedAt };
  // openedAt comes from the database clock, Date.now() from the API server's: allow for skew
  // between them, and never block a lesson that has no minimum time.
  const readyAt = p.openedAt.getTime() + lesson.minMinutes * 60_000 - CLOCK_SKEW_MS;
  if (lesson.minMinutes > 0 && Date.now() < readyAt) throw ApiError.conflict(`Spend at least ${lesson.minMinutes} minute(s) on this lesson before marking it complete`);
  const done = await prisma.programLessonProgress.update({ where: { enrollmentId_lessonId: { enrollmentId, lessonId } }, data: { completedAt: new Date() } });
  return { completedAt: done.completedAt };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function attemptQuestions(ids: string[]) {
  const qs = await prisma.programQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, prompt: true, options: true } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((q) => ({ id: q!.id, prompt: q!.prompt, options: q!.options as string[] }));
}

export async function startAttempt(studentId: string, enrollmentId: string) {
  return prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, enrollmentId);
    const e = await ownEnrollment(tx, studentId, enrollmentId);
    assertActive(e);
    const elig = await programEligibility(tx, e.id);
    if (elig.passedAttempt) throw ApiError.conflict('You have already passed the final assessment');
    if (elig.lessonsDone < elig.lessonsRequired) throw ApiError.conflict('Complete every required lesson before the final assessment');
    const attempts = await tx.programAttempt.findMany({ where: { enrollmentId }, orderBy: { startedAt: 'desc' } });
    const open = attempts.find((a) => !a.submittedAt && a.deadlineAt.getTime() + SUBMIT_GRACE_MS > Date.now());
    if (open) return { attemptId: open.id, resumed: true, deadlineAt: open.deadlineAt, questions: await attemptQuestions(open.questionIds as string[]) };
    // Expired, never-submitted attempts count as used (scored 0).
    for (const a of attempts.filter((x) => !x.submittedAt)) {
      await tx.programAttempt.update({ where: { id: a.id }, data: { submittedAt: a.deadlineAt, correctCount: 0, scorePercent: 0, passed: false } });
    }
    const used = attempts.length;
    if (used >= e.program.maxAttempts + e.extraAttempts) throw ApiError.conflict('No assessment attempts left. Contact us if you need another attempt.');
    const pool = await tx.programQuestion.findMany({ where: { programId: e.programId, archivedAt: null }, select: { id: true } });
    if (!pool.length) throw ApiError.conflict('The final assessment is not available yet');
    const n = Math.min(e.program.questionsPerAttempt ?? pool.length, pool.length);
    const ids = shuffle(pool.map((q) => q.id)).slice(0, n);
    const attempt = await tx.programAttempt.create({ data: { enrollmentId, questionIds: ids, deadlineAt: new Date(Date.now() + e.program.timeLimitMinutes * 60_000) } });
    return { attemptId: attempt.id, resumed: false, deadlineAt: attempt.deadlineAt, questions: await attemptQuestions(ids) };
  });
}

export async function getAttempt(studentId: string, attemptId: string) {
  const a = await prisma.programAttempt.findFirst({ where: { id: attemptId, enrollment: { studentId } } });
  if (!a) throw ApiError.notFound('Attempt not found');
  if (a.submittedAt) return { id: a.id, enrollmentId: a.enrollmentId, submitted: true, scorePercent: a.scorePercent, passed: a.passed, correctCount: a.correctCount, total: (a.questionIds as string[]).length, submittedAt: a.submittedAt };
  return { id: a.id, enrollmentId: a.enrollmentId, submitted: false, deadlineAt: a.deadlineAt, serverNow: new Date(), questions: await attemptQuestions(a.questionIds as string[]) };
}

export async function submitAttempt(studentId: string, attemptId: string, answers: Record<string, number>) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(
    async (tx) => {
      const a0 = await tx.programAttempt.findFirst({ where: { id: attemptId, enrollment: { studentId } } });
      if (!a0) throw ApiError.notFound('Attempt not found');
      await lockEnrollment(tx, a0.enrollmentId);
      const a = await tx.programAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { enrollment: { include: { program: true } } } });
      if (a.submittedAt) throw ApiError.conflict('This attempt has already been submitted');
      assertActive(a.enrollment);
      const late = Date.now() > a.deadlineAt.getTime() + SUBMIT_GRACE_MS;
      const ids = a.questionIds as string[];
      const keys = await tx.programQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, correctIndex: true } });
      const key = new Map(keys.map((k) => [k.id, k.correctIndex]));
      const clean: Record<string, number> = {};
      for (const id of ids) if (Number.isInteger(answers[id])) clean[id] = answers[id];
      const correct = late ? 0 : ids.filter((id) => clean[id] !== undefined && clean[id] === key.get(id)).length;
      const scorePercent = ids.length ? Math.floor((correct * 100) / ids.length) : 0;
      const passed = !late && scorePercent >= a.enrollment.program.passPercent;
      await tx.programAttempt.update({ where: { id: a.id }, data: { answers: clean, correctCount: correct, scorePercent, passed, submittedAt: new Date() } });
      await audit(tx, { id: studentId, role: 'STUDENT' }, { action: 'program.attempt_submitted', entityType: 'ProgramAttempt', entityId: a.id, after: { scorePercent, passed, late } });
      let certificate: { id: string; certificateNumber: string } | null = null;
      if (passed) certificate = await issueIfEligibleTx(tx, a.enrollmentId, null, after);
      return { scorePercent, passed, correctCount: correct, total: ids.length, late, passPercent: a.enrollment.program.passPercent, certificate };
    },
    { timeout: 20_000 },
  );
  await after.flush();
  return result;
}

// ===========================================================================
// Certificates
// ===========================================================================

/** Issues the certificate when (and only when) the enrollment is eligible. Returns null otherwise. */
async function issueIfEligibleTx(tx: Prisma.TransactionClient, enrollmentId: string, actor: Actor | null, after: AfterCommit) {
  await lockEnrollment(tx, enrollmentId);
  const e = await tx.programEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { certificate: true, program: true, student: { select: { id: true, name: true } } } });
  if (e.certificate) return e.certificate.status === 'ISSUED' ? e.certificate : null;
  const elig = await programEligibility(tx, enrollmentId);
  if (!elig.eligible || !elig.passedAttempt) return null;
  const cert = await tx.programCertificate.create({
    data: {
      certificateNumber: await nextNumber(tx, 'GCP'),
      verificationCode: randomCode(12),
      enrollmentId,
      programId: e.programId,
      studentId: e.studentId,
      studentName: e.student.name,
      programTitle: e.program.title,
      certificateTitle: e.program.certificateTitle,
      scorePercent: elig.passedAttempt.scorePercent,
      issuedById: actor?.id ?? null,
    },
  });
  await tx.programEnrollment.update({ where: { id: enrollmentId }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await audit(tx, actor, { action: 'program.certificate_issued', entityType: 'ProgramCertificate', entityId: cert.id, after: { enrollmentId, number: cert.certificateNumber, automatic: !actor } });
  await notify(tx, e.studentId, { type: 'CERTIFICATE', title: 'Your certificate is ready', body: `Certificate ${cert.certificateNumber} for ${e.program.title} has been issued.`, link: `${env.internPortalUrl}/program/${enrollmentId}` });
  after.add(() => afterCertificateIssued(cert.id));
  return cert;
}

/** Staff: issue manually when the automatic issue did not run (still requires full eligibility). */
export async function adminIssueCertificate(actor: Actor, enrollmentId: string) {
  const after = new AfterCommit();
  const cert = await prisma.$transaction(async (tx) => {
    const elig = await programEligibility(tx, enrollmentId);
    if (!elig.eligible) throw ApiError.conflict(`Not eligible: ${elig.reasons.join('; ')}`);
    const existing = await tx.programCertificate.findUnique({ where: { enrollmentId } });
    if (existing) throw ApiError.conflict(existing.status === 'ISSUED' ? 'A certificate has already been issued' : 'This certificate was revoked; re-issuing needs a manual review');
    return issueIfEligibleTx(tx, enrollmentId, actor, after);
  });
  await after.flush();
  if (!cert) throw ApiError.conflict('Not eligible');
  return cert;
}

export async function revokeCertificate(actor: Actor, certificateId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.programCertificate.updateMany({ where: { id: certificateId, status: 'ISSUED' }, data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason } });
    if (!res.count) throw ApiError.notFound('Issued certificate not found');
    await audit(tx, actor, { action: 'program.certificate_revoked', entityType: 'ProgramCertificate', entityId: certificateId, before: { status: 'ISSUED' }, after: { status: 'REVOKED' }, reason });
    return tx.programCertificate.findUniqueOrThrow({ where: { id: certificateId } });
  });
}

export async function certificatePdf(certificateId: string): Promise<{ pdf: Buffer; filename: string }> {
  const c = await prisma.programCertificate.findUnique({ where: { id: certificateId } });
  if (!c) throw ApiError.notFound('Certificate not found');
  const filename = `Certificate-${c.certificateNumber}.pdf`;
  if (c.pdfFileId && c.status === 'ISSUED') {
    const stored = await readStored(c.pdfFileId);
    if (stored) return { pdf: stored.data, filename };
  }
  const profile = await getProfile();
  const company = companySnapshot(profile);
  const { pdf } = await renderCertificatePdf({
    certificateTitle: c.certificateTitle,
    studentName: c.studentName,
    programTitle: c.programTitle,
    scorePercent: c.scorePercent,
    issuedAt: c.issuedAt.toISOString(),
    certificateNumber: c.certificateNumber,
    verificationCode: c.verificationCode,
    verifyUrl: certificateVerifyUrl(c.verificationCode),
    company,
    revoked: c.status === 'REVOKED',
  });
  if (storageConfigured() && !c.pdfFileId && c.status === 'ISSUED') {
    try {
      const f = await storeGenerated(prisma, c.studentId, pdf, filename);
      await prisma.programCertificate.updateMany({ where: { id: c.id, pdfFileId: null }, data: { pdfFileId: f.id } });
    } catch (err) {
      console.error('[program] could not store certificate PDF:', err instanceof Error ? err.message : err);
    }
  }
  return { pdf, filename };
}

/** "Your certificate is available" email with the PDF attached (separate from the payment email). */
export async function sendCertificateEmail(certificateId: string) {
  const c = await prisma.programCertificate.findUnique({ where: { id: certificateId }, include: { student: { select: { email: true } } } });
  if (!c || c.status !== 'ISSUED') throw ApiError.notFound('Issued certificate not found');
  const { pdf, filename } = await certificatePdf(certificateId);
  const html = layout(
    'Your certificate is ready',
    `<p style="font-size:14px;line-height:1.6;">Congratulations ${esc(c.studentName)}! You have completed <strong>${esc(c.programTitle)}</strong>.</p>
     <p style="font-size:14px;">Certificate no. <strong>${esc(c.certificateNumber)}</strong> · issued ${esc(c.issuedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }))}</p>
     <p style="font-size:14px;">Anyone can confirm it at <a href="${esc(certificateVerifyUrl(c.verificationCode))}" style="color:#6D22E6;">${esc(certificateVerifyUrl(c.verificationCode))}</a> (code ${esc(c.verificationCode)}).</p>
     <p style="font-size:12px;color:#777;">The certificate PDF is attached and is also available in your student portal.</p>`,
  );
  return sendLogged({ kind: 'program.certificate', entityType: 'ProgramCertificate', entityId: c.id }, { to: c.student.email, subject: `Your certificate: ${c.programTitle} (${c.certificateNumber})`, html, attachments: [{ filename, content: pdf }] });
}

async function afterCertificateIssued(certificateId: string) {
  await sendCertificateEmail(certificateId);
}

export async function myCertificatePdf(studentId: string, enrollmentId: string) {
  const c = await prisma.programCertificate.findFirst({ where: { enrollmentId, studentId } });
  if (!c) throw ApiError.notFound('Certificate not found');
  return certificatePdf(c.id);
}

/** Public verification (only what is printed on the certificate). */
export async function verifyProgramCertificate(code: string) {
  const c = await prisma.programCertificate.findUnique({ where: { verificationCode: code.trim().toUpperCase() } });
  if (!c) return null;
  return { valid: c.status === 'ISSUED', status: c.status, type: 'program' as const, certificateNumber: c.certificateNumber, studentName: c.studentName, program: c.programTitle, certificateTitle: c.certificateTitle, issuedAt: c.issuedAt };
}

// ===========================================================================
// Admin
// ===========================================================================

export interface ProgramInput {
  slug: string;
  title: string;
  summary: string;
  description: string;
  feePaise: number;
  passPercent: number;
  maxAttempts: number;
  questionsPerAttempt?: number | null;
  timeLimitMinutes: number;
  certificateTitle: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export async function adminListPrograms() {
  const programs = await prisma.certificateProgram.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { lessons: { where: { archivedAt: null } }, questions: { where: { archivedAt: null } }, enrollments: true, certificates: { where: { status: 'ISSUED' } } } } },
  });
  return programs;
}

export async function adminGetProgram(id: string) {
  const p = await prisma.certificateProgram.findUnique({
    where: { id },
    include: {
      lessons: { orderBy: { position: 'asc' } },
      questions: { orderBy: { createdAt: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!p) throw ApiError.notFound('Program not found');
  return p;
}

async function assertPublishable(db: Db, programId: string) {
  const [lessons, questions] = await Promise.all([
    db.programLesson.count({ where: { programId, archivedAt: null, required: true } }),
    db.programQuestion.count({ where: { programId, archivedAt: null } }),
  ]);
  if (!lessons || !questions) throw ApiError.conflict('Add at least one required lesson and one assessment question before publishing');
}

export async function createProgram(actor: Actor, input: ProgramInput) {
  return prisma.$transaction(async (tx) => {
    if (input.status === 'PUBLISHED') throw ApiError.conflict('Create the program as a draft, add lessons and questions, then publish it');
    const p = await tx.certificateProgram.create({ data: { ...input, status: input.status ?? 'DRAFT' } });
    await audit(tx, actor, { action: 'program.created', entityType: 'CertificateProgram', entityId: p.id, after: { title: p.title, feePaise: p.feePaise } });
    return p;
  });
}

export async function updateProgram(actor: Actor, id: string, input: Partial<ProgramInput>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.certificateProgram.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Program not found');
    if (input.status === 'PUBLISHED' && before.status !== 'PUBLISHED') await assertPublishable(tx, id);
    const p = await tx.certificateProgram.update({ where: { id }, data: input });
    const changed = (Object.keys(input) as (keyof ProgramInput)[]).filter((k) => (before as Record<string, unknown>)[k] !== (p as Record<string, unknown>)[k]);
    await audit(tx, actor, {
      action: before.feePaise !== p.feePaise ? 'program.fee_changed' : 'program.updated',
      entityType: 'CertificateProgram',
      entityId: id,
      before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])) as Prisma.InputJsonValue,
      after: Object.fromEntries(changed.map((k) => [k, (p as Record<string, unknown>)[k]])) as Prisma.InputJsonValue,
    });
    return p;
  });
}

export async function saveLesson(actor: Actor, programId: string, lessonId: string | null, input: { title: string; body: string; videoUrl?: string | null; minMinutes: number; required: boolean; position?: number }) {
  const program = await prisma.certificateProgram.findUnique({ where: { id: programId } });
  if (!program) throw ApiError.notFound('Program not found');
  if (lessonId) {
    const l = await prisma.programLesson.findFirst({ where: { id: lessonId, programId } });
    if (!l) throw ApiError.notFound('Lesson not found');
    const updated = await prisma.programLesson.update({ where: { id: lessonId }, data: { ...input, videoUrl: input.videoUrl ?? null } });
    await audit(prisma, actor, { action: 'program.lesson_updated', entityType: 'ProgramLesson', entityId: lessonId });
    return updated;
  }
  const last = await prisma.programLesson.aggregate({ where: { programId }, _max: { position: true } });
  const created = await prisma.programLesson.create({ data: { programId, ...input, videoUrl: input.videoUrl ?? null, position: input.position ?? (last._max.position ?? 0) + 1 } });
  await audit(prisma, actor, { action: 'program.lesson_created', entityType: 'ProgramLesson', entityId: created.id });
  return created;
}

export async function archiveLesson(actor: Actor, programId: string, lessonId: string, archived: boolean) {
  const res = await prisma.programLesson.updateMany({ where: { id: lessonId, programId }, data: { archivedAt: archived ? new Date() : null } });
  if (!res.count) throw ApiError.notFound('Lesson not found');
  if (archived) {
    const p = await prisma.certificateProgram.findUniqueOrThrow({ where: { id: programId } });
    if (p.status === 'PUBLISHED') await assertPublishable(prisma, programId).catch(async (err) => {
      await prisma.programLesson.update({ where: { id: lessonId }, data: { archivedAt: null } });
      throw err;
    });
  }
  await audit(prisma, actor, { action: archived ? 'program.lesson_archived' : 'program.lesson_restored', entityType: 'ProgramLesson', entityId: lessonId });
  return { archived };
}

export async function saveQuestion(actor: Actor, programId: string, questionId: string | null, input: { prompt: string; options: string[]; correctIndex: number; explanation?: string | null }) {
  if (input.correctIndex >= input.options.length) throw ApiError.validation([{ field: 'correctIndex', message: 'Pick one of the options as the correct answer' }]);
  const program = await prisma.certificateProgram.findUnique({ where: { id: programId } });
  if (!program) throw ApiError.notFound('Program not found');
  if (questionId) {
    const q = await prisma.programQuestion.findFirst({ where: { id: questionId, programId } });
    if (!q) throw ApiError.notFound('Question not found');
    const updated = await prisma.programQuestion.update({ where: { id: questionId }, data: { ...input, explanation: input.explanation ?? null } });
    await audit(prisma, actor, { action: 'program.question_updated', entityType: 'ProgramQuestion', entityId: questionId });
    return updated;
  }
  const created = await prisma.programQuestion.create({ data: { programId, ...input, explanation: input.explanation ?? null } });
  await audit(prisma, actor, { action: 'program.question_created', entityType: 'ProgramQuestion', entityId: created.id });
  return created;
}

export async function archiveQuestion(actor: Actor, programId: string, questionId: string, archived: boolean) {
  const res = await prisma.programQuestion.updateMany({ where: { id: questionId, programId }, data: { archivedAt: archived ? new Date() : null } });
  if (!res.count) throw ApiError.notFound('Question not found');
  await audit(prisma, actor, { action: archived ? 'program.question_archived' : 'program.question_restored', entityType: 'ProgramQuestion', entityId: questionId });
  return { archived };
}

export async function adminListEnrollments(q: { programId?: string; status?: ProgramEnrollmentStatus; search?: string; skip: number; take: number }) {
  const where: Prisma.ProgramEnrollmentWhereInput = {
    ...(q.programId ? { programId: q.programId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? { OR: [{ enrollmentNumber: { contains: q.search, mode: 'insensitive' } }, { student: { name: { contains: q.search, mode: 'insensitive' } } }, { student: { email: { contains: q.search, mode: 'insensitive' } } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.programEnrollment.findMany({
      where,
      orderBy: { registeredAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: {
        student: { select: { id: true, name: true, email: true } },
        program: { select: { id: true, title: true } },
        certificate: { select: { id: true, certificateNumber: true, status: true } },
        _count: { select: { lessonProgress: { where: { completedAt: { not: null } } }, attempts: true } },
      },
    }),
    prisma.programEnrollment.count({ where }),
  ]);
  return { items, total };
}

export async function adminGetEnrollment(id: string) {
  const e = await prisma.programEnrollment.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true, phone: true } },
      program: { select: { id: true, title: true, maxAttempts: true, passPercent: true, lessons: { where: { archivedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, required: true, minMinutes: true } } } },
      lessonProgress: true,
      attempts: { orderBy: { startedAt: 'desc' }, select: ATTEMPT_SUMMARY },
      certificate: true,
      payments: { orderBy: { createdAt: 'desc' }, include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } } },
    },
  });
  if (!e) throw ApiError.notFound('Enrollment not found');
  const [eligibility, history, emails] = await Promise.all([
    programEligibility(prisma, id),
    prisma.auditLog.findMany({ where: { entityType: 'ProgramEnrollment', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { name: true } } } }),
    prisma.emailLog.findMany({
      where: { OR: [{ entityType: 'Invoice', entityId: { in: e.payments.map((p) => p.invoice?.id).filter((x): x is string => Boolean(x)) } }, ...(e.certificate ? [{ entityType: 'ProgramCertificate', entityId: e.certificate.id }] : [])] },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, kind: true, to: true, status: true, error: true, createdAt: true },
    }),
  ]);
  return { ...e, eligibility, history, emails };
}

export async function grantExtraAttempt(actor: Actor, enrollmentId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, enrollmentId);
    const e = await tx.programEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw ApiError.notFound('Enrollment not found');
    if (e.status !== 'ACTIVE') throw ApiError.conflict('Extra attempts can only be granted to active enrollments');
    const updated = await tx.programEnrollment.update({ where: { id: enrollmentId }, data: { extraAttempts: { increment: 1 } } });
    await audit(tx, actor, { action: 'program.extra_attempt_granted', entityType: 'ProgramEnrollment', entityId: enrollmentId, after: { extraAttempts: updated.extraAttempts }, reason });
    return updated;
  });
}

export async function cancelEnrollment(actor: Actor, enrollmentId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockEnrollment(tx, enrollmentId);
    const e = await tx.programEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw ApiError.notFound('Enrollment not found');
    if (e.status !== 'PENDING_PAYMENT') throw ApiError.conflict('Only unpaid registrations can be cancelled here. Paid enrollments are closed by recording a refund.');
    const pending = await tx.payment.count({ where: { programEnrollmentId: enrollmentId, status: 'PENDING' } });
    if (pending) throw ApiError.conflict('A payment is being processed. Reconcile it first.');
    const updated = await tx.programEnrollment.update({ where: { id: enrollmentId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await audit(tx, actor, { action: 'program.cancelled', entityType: 'ProgramEnrollment', entityId: enrollmentId, before: { status: e.status }, after: { status: 'CANCELLED' }, reason });
    return updated;
  });
}

export async function resendCertificate(actor: Actor, certificateId: string) {
  const r = await sendCertificateEmail(certificateId);
  await audit(prisma, actor, { action: 'program.certificate_resent', entityType: 'ProgramCertificate', entityId: certificateId, after: { status: r.status } });
  return { status: r.status, error: r.status === 'FAILED' ? r.error : undefined };
}

export async function report(q: { programId?: string; from?: Date; to?: Date }) {
  const createdAt = q.from || q.to ? { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } : undefined;
  const programs = await prisma.certificateProgram.findMany({ where: q.programId ? { id: q.programId } : {}, select: { id: true, title: true, feePaise: true } });
  const rows = [];
  for (const p of programs) {
    const enrollWhere = { programId: p.id, ...(createdAt ? { registeredAt: createdAt } : {}) };
    const [byStatus, paid, refunded, issued, revoked, attempts] = await Promise.all([
      prisma.programEnrollment.groupBy({ by: ['status'], where: enrollWhere, _count: true }),
      prisma.payment.aggregate({ where: { programEnrollment: { programId: p.id }, status: 'PAID', ...(createdAt ? { verifiedAt: createdAt } : {}) }, _sum: { amountPaise: true }, _count: true }),
      prisma.payment.aggregate({ where: { programEnrollment: { programId: p.id }, status: 'REFUNDED', ...(createdAt ? { refundedAt: createdAt } : {}) }, _sum: { amountPaise: true }, _count: true }),
      prisma.programCertificate.count({ where: { programId: p.id, status: 'ISSUED', ...(createdAt ? { issuedAt: createdAt } : {}) } }),
      prisma.programCertificate.count({ where: { programId: p.id, status: 'REVOKED' } }),
      prisma.programAttempt.groupBy({ by: ['passed'], where: { enrollment: { programId: p.id }, submittedAt: { not: null, ...(createdAt ?? {}) } }, _count: true }),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    const passedAttempts = attempts.find((a) => a.passed === true)?._count ?? 0;
    const totalAttempts = attempts.reduce((s, a) => s + a._count, 0);
    rows.push({
      programId: p.id,
      program: p.title,
      currentFeePaise: p.feePaise,
      registrations: byStatus.reduce((s, x) => s + x._count, 0),
      pendingPayment: status.PENDING_PAYMENT ?? 0,
      active: status.ACTIVE ?? 0,
      completed: status.COMPLETED ?? 0,
      cancelled: status.CANCELLED ?? 0,
      refunded: status.REFUNDED ?? 0,
      paidPayments: paid._count,
      collectedPaise: paid._sum.amountPaise ?? 0,
      refundedPaise: refunded._sum.amountPaise ?? 0,
      certificatesIssued: issued,
      certificatesRevoked: revoked,
      attempts: totalAttempts,
      attemptPassRate: totalAttempts ? Math.round((passedAttempts * 1000) / totalAttempts) / 10 : null,
    });
  }
  return { rows };
}

export async function exportEnrollments(actor: Actor, q: { programId?: string; status?: ProgramEnrollmentStatus }) {
  const rows = await prisma.programEnrollment.findMany({
    where: { ...(q.programId ? { programId: q.programId } : {}), ...(q.status ? { status: q.status } : {}) },
    orderBy: { registeredAt: 'desc' },
    take: 5000,
    include: {
      student: { select: { name: true, email: true } },
      program: { select: { title: true } },
      certificate: { select: { certificateNumber: true, status: true, scorePercent: true } },
      payments: { where: { status: { in: ['PAID', 'REFUNDED'] } }, select: { status: true, amountPaise: true, providerPaymentId: true, verifiedAt: true } },
      _count: { select: { lessonProgress: { where: { completedAt: { not: null } } } } },
    },
  });
  await audit(prisma, actor, { action: 'report.exported', entityType: 'Report', entityId: 'program_enrollments', after: { rows: rows.length } });
  return rows.map((e) => ({
    enrollment: e.enrollmentNumber,
    program: e.program.title,
    student: e.student.name,
    email: e.student.email,
    status: e.status,
    feePaise: e.feePaise,
    payment: e.payments[0]?.status ?? '',
    paymentRef: e.payments[0]?.providerPaymentId ?? '',
    paidAt: e.payments[0]?.verifiedAt?.toISOString() ?? '',
    lessonsCompleted: e._count.lessonProgress,
    certificate: e.certificate?.certificateNumber ?? '',
    certificateStatus: e.certificate?.status ?? '',
    score: e.certificate?.scorePercent ?? '',
    registered: e.registeredAt.toISOString(),
  }));
}
