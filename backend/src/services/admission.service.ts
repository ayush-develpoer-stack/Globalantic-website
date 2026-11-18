import { Prisma, type AdmissionApplication, type ApplicationStatus, type EnrollmentStatus } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { canonicalEmail } from '../lib/identity';
import { AfterCommit, notify } from './notification.service';
import { recordAdminEvent } from './admin-events.service';
import { ADMISSION_BLOCK_MESSAGE, admissionBlock, feeFor, lockBatch, seatsTaken } from './catalog.service';
import { attachReferralOnRegistration, markReferralAdmitted } from './referral.service';
import { assertAttachable } from './file.service';

/**
 * Admission lifecycle:
 *   SUBMITTED -> UNDER_REVIEW -> APPROVED --(verified payment / zero fee)--> ENROLLED
 *          \-> REJECTED (reason)     \-> WITHDRAWN (by the student, before payment)
 *
 * The fee is snapshotted from the database at submission. Nothing about money
 * or status is ever accepted from the client.
 */

const ACTIVE_STATUSES: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ENROLLED'];

export interface ApplyInput {
  batchId: string;
  documentFileId?: string;
  qualification: string;
  institution?: string;
  graduationYear?: number;
  statement?: string;
  referralCode?: string;
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
}

export async function submitApplication(studentId: string, input: ApplyInput, ipHash: string | null) {
  const after = new AfterCommit();
  const application = await prisma.$transaction(async (tx) => {
    // Serialises all admission attempts of one student (duplicate protection under concurrency).
    await lockUser(tx, studentId);
    const student = await tx.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true, referredBy: { select: { id: true } } },
    });
    if (!student || student.role !== 'STUDENT') throw ApiError.forbidden('Only student accounts can apply');
    if (!student.emailVerifiedAt) throw ApiError.forbidden('Please verify your email address before applying');

    const batch = await tx.batch.findFirst({ where: { id: input.batchId, deletedAt: null }, include: { course: true } });
    if (!batch) throw ApiError.notFound('Batch not found');
    const available = batch.capacity - (await seatsTaken(tx, batch.id));
    const block = admissionBlock(batch.course, batch, available);
    if (block) throw ApiError.conflict(ADMISSION_BLOCK_MESSAGE[block]);

    const existingSameCourse = await tx.admissionApplication.findFirst({
      where: { studentId, courseId: batch.courseId, status: { in: ACTIVE_STATUSES } },
      select: { id: true, batchId: true },
    });
    if (existingSameCourse) {
      throw ApiError.conflict(
        existingSameCourse.batchId === batch.id
          ? 'You have already applied for this batch'
          : 'You already have an active application for this course',
      );
    }
    const activeEnrollment = await tx.enrollment.findFirst({
      where: { studentId, courseId: batch.courseId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      select: { id: true },
    });
    if (activeEnrollment) throw ApiError.conflict('You are already enrolled in this course');

    const fee = feeFor(batch.course, batch);
    const previousForBatch = await tx.admissionApplication.findUnique({ where: { studentId_batchId: { studentId, batchId: batch.id } }, select: { id: true } });
    if (input.documentFileId) await assertAttachable(tx, studentId, input.documentFileId, 'ADMISSION_DOCUMENT', { applicationId: previousForBatch?.id });
    const details = {
      documentFileId: input.documentFileId ?? null,
      qualification: input.qualification.trim(),
      institution: input.institution?.trim() || null,
      graduationYear: input.graduationYear ?? null,
      statement: input.statement?.trim() || null,
    };
    // A previously withdrawn/rejected application for this batch is reopened (unique studentId+batchId).
    const previous = await tx.admissionApplication.findUnique({ where: { studentId_batchId: { studentId, batchId: batch.id } } });
    const app = previous
      ? await tx.admissionApplication.update({
          where: { id: previous.id },
          data: { ...details, ...fee, status: 'SUBMITTED', rejectionReason: null, reviewedAt: null, reviewedById: null },
        })
      : await tx.admissionApplication.create({
          data: {
            applicationNumber: await nextNumber(tx, 'APP'),
            studentId,
            courseId: batch.courseId,
            batchId: batch.id,
            ...details,
            ...fee,
          },
        });

    await tx.studentProfile.update({
      where: { userId: studentId },
      data: { qualification: details.qualification, institution: details.institution, graduationYear: details.graduationYear },
    });

    // A referral code may also be entered at application time if none was used at registration.
    if (input.referralCode && !student.referredBy && student.studentProfile && student.phone) {
      await attachReferralOnRegistration(tx, {
        code: input.referralCode,
        referredUserId: studentId,
        referredEmailCanonical: student.studentProfile.emailCanonical ?? canonicalEmail(student.email),
        referredPhone: student.phone,
        ipHash,
      });
    }

    await audit(tx, { id: studentId, role: 'STUDENT', ipHash }, {
      action: previous ? 'application.resubmitted' : 'application.submitted',
      entityType: 'AdmissionApplication',
      entityId: app.id,
      after: { batchId: batch.id, payablePaise: app.payablePaise },
    });
    await recordAdminEvent(
      tx,
      {
        dedupeKey: `admission.submitted:${app.id}:${app.updatedAt.getTime()}`,
        category: 'admission',
        severity: 'important',
        title: `${previous ? 'Application resubmitted' : 'New application'}: ${app.applicationNumber}`,
        body: `${batch.course.title} (${batch.name}) — awaiting review`,
        link: `/applications/${app.id}`,
        entityType: 'AdmissionApplication',
        entityId: app.id,
      },
      after,
    );
    await notify(
      tx,
      studentId,
      {
        type: 'APPLICATION',
        title: 'Application received',
        body: `Your application ${app.applicationNumber} for ${batch.course.title} (${batch.name}) has been received and is awaiting review.`,
        link: `${env.internPortalUrl}/applications/${app.id}`,
        email: true,
      },
      after,
    );
    return app;
  });
  await after.flush();
  return application;
}

const studentApplicationInclude = {
  course: { select: { id: true, title: true, slug: true, durationLabel: true } },
  batch: { select: { id: true, name: true, startDate: true, endDate: true, mode: true, status: true } },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, status: true, amountPaise: true, currency: true, provider: true, verifiedAt: true, createdAt: true, failureReason: true },
  },
  invoices: { select: { id: true, invoiceNumber: true, amountPaise: true, issuedAt: true, status: true } },
  enrollment: { select: { id: true, status: true } },
  documentFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
} satisfies Prisma.AdmissionApplicationInclude;

/** Student-facing projection: no reviewer ids, no internal notes. */
function forStudent<T extends AdmissionApplication>(a: T) {
  const { reviewedById: _r, documentsVerifiedBy: _d, ...rest } = a;
  return rest;
}

export async function listMyApplications(studentId: string) {
  const rows = await prisma.admissionApplication.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: studentApplicationInclude,
  });
  return rows.map(forStudent);
}

/** Ownership enforced in the query: someone else's id behaves exactly like a missing one. */
export async function getMyApplication(studentId: string, id: string) {
  const row = await prisma.admissionApplication.findFirst({ where: { id, studentId }, include: studentApplicationInclude });
  if (!row) throw ApiError.notFound('Application not found');
  return forStudent(row);
}

export async function withdrawApplication(studentId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findFirst({ where: { id, studentId } });
    if (!app) throw ApiError.notFound('Application not found');
    const paid = await tx.payment.count({ where: { applicationId: id, status: { in: ['PAID', 'PENDING'] } } });
    if (paid) throw ApiError.conflict('A payment has been made for this application. Please contact support to withdraw.');
    const res = await tx.admissionApplication.updateMany({
      where: { id, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] } },
      data: { status: 'WITHDRAWN' },
    });
    if (res.count !== 1) throw ApiError.conflict(`An application in status ${app.status} cannot be withdrawn`);
    await tx.payment.updateMany({ where: { applicationId: id, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    await audit(tx, { id: studentId, role: 'STUDENT' }, {
      action: 'application.withdrawn',
      entityType: 'AdmissionApplication',
      entityId: id,
      before: { status: app.status },
      after: { status: 'WITHDRAWN' },
    });
    return { id, status: 'WITHDRAWN' as const };
  });
}

// ---------------------------------------------------------------------------
// Enrollment confirmation (shared by admin approval of free courses and payments)
// ---------------------------------------------------------------------------

/**
 * Turns an APPROVED application into an enrollment. Idempotent: an existing
 * enrollment is returned as-is. Must run inside the caller's transaction.
 */
export async function confirmEnrollmentTx(tx: Prisma.TransactionClient, applicationId: string, after: AfterCommit) {
  const app = await tx.admissionApplication.findUniqueOrThrow({
    where: { id: applicationId },
    include: { enrollment: true, course: true, batch: true },
  });
  if (app.enrollment) return app.enrollment;
  if (app.status !== 'APPROVED') {
    throw ApiError.conflict(`Enrollment can only be confirmed for an approved application (current: ${app.status})`);
  }
  const enrollment = await tx.enrollment.create({
    data: { studentId: app.studentId, courseId: app.courseId, batchId: app.batchId, applicationId: app.id },
  });
  await tx.admissionApplication.update({ where: { id: app.id }, data: { status: 'ENROLLED' } });
  await markReferralAdmitted(tx, app.studentId);
  await audit(tx, null, { action: 'enrollment.confirmed', entityType: 'Enrollment', entityId: enrollment.id, after: { applicationId: app.id } });
  await notify(
    tx,
    app.studentId,
    {
      type: 'ENROLLMENT',
      title: 'Enrollment confirmed',
      body: `You are enrolled in ${app.course.title} — ${app.batch.name}. Classes start on ${app.batch.startDate.toISOString().slice(0, 10)}.`,
      link: `${env.internPortalUrl}/enrollments/${enrollment.id}`,
      email: true,
    },
    after,
  );
  return enrollment;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminListApplications(q: {
  status?: ApplicationStatus;
  courseId?: string;
  batchId?: string;
  search?: string;
  pendingPayment?: boolean;
  sort?: string;
  skip: number;
  take: number;
}) {
  const where: Prisma.AdmissionApplicationWhereInput = {
    ...(q.pendingPayment ? { status: 'APPROVED', payablePaise: { gt: 0 } } : q.status ? { status: q.status } : {}),
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.batchId ? { batchId: q.batchId } : {}),
    ...(q.search
      ? {
          OR: [
            { applicationNumber: { contains: q.search, mode: 'insensitive' } },
            { student: { name: { contains: q.search, mode: 'insensitive' } } },
            { student: { email: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total, counts] = await Promise.all([
    prisma.admissionApplication.findMany({
      where,
      orderBy: orderByFrom<Prisma.AdmissionApplicationOrderByWithRelationInput>(q.sort, { createdAt: (d) => ({ createdAt: d }), status: (d) => ({ status: d }), applicationNumber: (d) => ({ applicationNumber: d }), payablePaise: (d) => ({ payablePaise: d }) }, { createdAt: 'desc' }),
      skip: q.skip,
      take: q.take,
      include: {
        student: { select: { id: true, name: true, email: true, phone: true } },
        course: { select: { id: true, title: true } },
        batch: { select: { id: true, name: true, status: true } },
        payments: { select: { status: true, amountPaise: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.admissionApplication.count({ where }),
    prisma.admissionApplication.groupBy({ by: ['status'], _count: true }),
  ]);
  return { items, total, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
}

export async function adminGetApplication(id: string) {
  const app = await prisma.admissionApplication.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true, phone: true, status: true, emailVerifiedAt: true, studentProfile: true } },
      documentFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
      course: { select: { id: true, title: true, slug: true } },
      batch: { select: { id: true, name: true, status: true, capacity: true, startDate: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      invoices: true,
      enrollment: true,
    },
  });
  if (!app) throw ApiError.notFound('Application not found');
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'AdmissionApplication', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { name: true, role: true } } },
  });
  return { ...app, history };
}

export type ReviewAction = 'UNDER_REVIEW' | 'APPROVE' | 'REJECT';

export async function reviewApplication(actor: Actor, id: string, action: ReviewAction, reason?: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.admissionApplication.findUnique({ where: { id }, include: { course: true, batch: true } });
    if (!current) throw ApiError.notFound('Application not found');

    let next: ApplicationStatus;
    let allowedFrom: ApplicationStatus[];
    if (action === 'UNDER_REVIEW') {
      next = 'UNDER_REVIEW';
      allowedFrom = ['SUBMITTED'];
    } else if (action === 'APPROVE') {
      next = 'APPROVED';
      allowedFrom = ['SUBMITTED', 'UNDER_REVIEW'];
      await lockBatch(tx, current.batchId);
      if (current.batch.status === 'CANCELLED' || current.batch.status === 'COMPLETED') {
        throw ApiError.conflict('This batch is no longer accepting students');
      }
      const taken = await seatsTaken(tx, current.batchId);
      if (taken >= current.batch.capacity) throw ApiError.conflict('No seats are left in this batch');
    } else {
      if (!reason?.trim()) throw ApiError.validation([{ field: 'reason', message: 'A rejection reason is required' }]);
      next = 'REJECTED';
      allowedFrom = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];
      const paid = await tx.payment.count({ where: { applicationId: id, status: { in: ['PAID', 'PENDING'] } } });
      if (paid) throw ApiError.conflict('This application has a payment. Refund it before rejecting.');
    }

    const res = await tx.admissionApplication.updateMany({
      where: { id, status: { in: allowedFrom } },
      data: {
        status: next,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: next === 'REJECTED' ? reason!.trim() : null,
      },
    });
    if (res.count !== 1) throw ApiError.conflict(`An application in status ${current.status} cannot be moved to ${next}`);
    if (next === 'REJECTED') {
      await tx.payment.updateMany({ where: { applicationId: id, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    }

    await audit(tx, actor, {
      action: `application.${next.toLowerCase()}`,
      entityType: 'AdmissionApplication',
      entityId: id,
      before: { status: current.status },
      after: { status: next },
      reason: reason ?? null,
    });

    if (next === 'APPROVED') {
      if (current.payablePaise === 0) {
        await confirmEnrollmentTx(tx, id, after);
      } else {
        await notify(
          tx,
          current.studentId,
          {
            type: 'APPLICATION',
            title: 'Application approved — complete your payment',
            body: `Your application ${current.applicationNumber} for ${current.course.title} has been approved. Complete the fee payment to confirm your seat.`,
            link: `${env.internPortalUrl}/applications/${id}`,
            email: true,
          },
          after,
        );
      }
    } else if (next === 'REJECTED') {
      await notify(
        tx,
        current.studentId,
        {
          type: 'APPLICATION',
          title: 'Application update',
          body: `Your application ${current.applicationNumber} for ${current.course.title} was not approved. Reason: ${reason}`,
          link: `${env.internPortalUrl}/applications/${id}`,
          email: true,
        },
        after,
      );
    }
    return tx.admissionApplication.findUniqueOrThrow({ where: { id } });
  });
  await after.flush();
  return result;
}

export async function verifyApplicationDocuments(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findUnique({ where: { id } });
    if (!app) throw ApiError.notFound('Application not found');
    const updated = await tx.admissionApplication.update({
      where: { id },
      data: { documentsVerifiedAt: new Date(), documentsVerifiedBy: actor.id },
    });
    await audit(tx, actor, { action: 'application.documents_verified', entityType: 'AdmissionApplication', entityId: id });
    return updated;
  });
}

/** Re-runs confirmation for an approved application whose payment is verified (or whose fee is zero). */
export async function adminConfirmEnrollment(actor: Actor, id: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findUnique({ where: { id }, include: { enrollment: true } });
    if (!app) throw ApiError.notFound('Application not found');
    if (app.enrollment) return app.enrollment;
    const paid = await tx.payment.count({ where: { applicationId: id, status: 'PAID' } });
    if (app.payablePaise > 0 && !paid) {
      throw ApiError.conflict('Enrollment needs a verified payment. Use payment reconciliation or record an offline payment.');
    }
    const enrollment = await confirmEnrollmentTx(tx, id, after);
    await audit(tx, actor, { action: 'enrollment.confirmed_by_admin', entityType: 'AdmissionApplication', entityId: id });
    return enrollment;
  });
  await after.flush();
  return result;
}

/** Moves an application (not yet enrolled) or an enrollment to another batch of the same course. */
export async function transferToBatch(actor: Actor, applicationId: string, targetBatchId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findUnique({ where: { id: applicationId }, include: { enrollment: true } });
    if (!app) throw ApiError.notFound('Application not found');
    if (app.batchId === targetBatchId) throw ApiError.conflict('The application is already in this batch');
    if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ENROLLED'].includes(app.status)) {
      throw ApiError.conflict(`An application in status ${app.status} cannot be transferred`);
    }
    await lockBatch(tx, targetBatchId);
    const target = await tx.batch.findFirst({ where: { id: targetBatchId, deletedAt: null } });
    if (!target || target.courseId !== app.courseId) {
      throw ApiError.validation([{ field: 'batchId', message: 'Choose a batch of the same course' }]);
    }
    if (target.status === 'CANCELLED' || target.status === 'COMPLETED') throw ApiError.conflict('The target batch is closed');
    const consumesSeat = app.status === 'APPROVED' || app.status === 'ENROLLED';
    if (consumesSeat && (await seatsTaken(tx, targetBatchId)) >= target.capacity) throw ApiError.conflict('The target batch is full');
    const clash = await tx.admissionApplication.findUnique({ where: { studentId_batchId: { studentId: app.studentId, batchId: targetBatchId } } });
    if (clash) throw ApiError.conflict('The student already has an application record for the target batch');

    await tx.admissionApplication.update({ where: { id: app.id }, data: { batchId: targetBatchId } });
    if (app.enrollment) await tx.enrollment.update({ where: { id: app.enrollment.id }, data: { batchId: targetBatchId } });
    await audit(tx, actor, {
      action: 'application.batch_transferred',
      entityType: 'AdmissionApplication',
      entityId: app.id,
      before: { batchId: app.batchId },
      after: { batchId: targetBatchId },
      reason,
    });
    return { id: app.id, batchId: targetBatchId };
  });
}

const ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  ACTIVE: ['COMPLETED', 'DROPPED', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'DROPPED'],
  COMPLETED: ['ACTIVE'],
  DROPPED: [],
};

export async function setEnrollmentStatus(actor: Actor, enrollmentId: string, status: EnrollmentStatus, reason: string) {
  return prisma.$transaction(async (tx) => {
    const e = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw ApiError.notFound('Enrollment not found');
    if (!ENROLLMENT_TRANSITIONS[e.status].includes(status)) throw ApiError.conflict(`A ${e.status} enrollment cannot be moved to ${status}`);
    const updated = await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { status, completedAt: status === 'COMPLETED' ? new Date() : status === 'ACTIVE' ? null : e.completedAt },
    });
    await audit(tx, actor, { action: 'enrollment.status_changed', entityType: 'Enrollment', entityId: enrollmentId, before: { status: e.status }, after: { status }, reason });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// "Request more information" loop
// ---------------------------------------------------------------------------

/** Staff asks the applicant for more information; the application moves to UNDER_REVIEW. */
export async function requestApplicationInfo(actor: Actor, id: string, message: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findUnique({ where: { id }, include: { course: { select: { title: true } } } });
    if (!app) throw ApiError.notFound('Application not found');
    const res = await tx.admissionApplication.updateMany({
      where: { id, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      data: { status: 'UNDER_REVIEW', infoRequest: message.trim(), infoRequestedAt: new Date(), infoResponse: null, infoRespondedAt: null, reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (res.count !== 1) throw ApiError.conflict(`More information cannot be requested for a ${app.status.toLowerCase()} application`);
    await audit(tx, actor, { action: 'application.info_requested', entityType: 'AdmissionApplication', entityId: id, before: { status: app.status }, after: { status: 'UNDER_REVIEW' }, reason: message });
    await notify(
      tx,
      app.studentId,
      {
        type: 'APPLICATION',
        title: 'More information needed for your application',
        body: `Admissions needs more information about application ${app.applicationNumber} (${app.course.title}): ${message.trim().slice(0, 300)}`,
        link: `${env.internPortalUrl}/applications/${id}`,
        email: true,
      },
      after,
    );
    return tx.admissionApplication.findUniqueOrThrow({ where: { id } });
  });
  await after.flush();
  return result;
}

/** The applicant answers an open information request (optionally with a new document). */
export async function respondToInfoRequest(studentId: string, id: string, input: { message: string; documentFileId?: string }) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findFirst({ where: { id, studentId } });
    if (!app) throw ApiError.notFound('Application not found');
    const open = app.infoRequestedAt && (!app.infoRespondedAt || app.infoRespondedAt < app.infoRequestedAt);
    if (!open || app.status !== 'UNDER_REVIEW') throw ApiError.conflict('There is no open information request for this application');
    if (input.documentFileId) await assertAttachable(tx, studentId, input.documentFileId, 'ADMISSION_DOCUMENT', { applicationId: id });
    const updated = await tx.admissionApplication.update({
      where: { id },
      data: { infoResponse: input.message.trim(), infoRespondedAt: new Date(), ...(input.documentFileId ? { documentFileId: input.documentFileId } : {}) },
    });
    await audit(tx, { id: studentId, role: 'STUDENT' }, { action: 'application.info_provided', entityType: 'AdmissionApplication', entityId: id });
    return forStudent(updated);
  });
}
