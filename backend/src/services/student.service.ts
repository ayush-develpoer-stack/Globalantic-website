import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit } from '../lib/audit';
import { AfterCommit, notify } from './notification.service';
import { attendancePercent, enrollmentProgress } from './learning.service';
import { certificateEligibility } from './certificate.service';
import { assertAttachable, publicFile } from './file.service';

/**
 * Student portal. Every query is scoped by the authenticated student's id —
 * there is no endpoint that accepts a student id from the client. Ids of
 * other students' records therefore behave exactly like non-existent ids (404).
 */

const ACCESSIBLE_ENROLLMENT = { in: ['ACTIVE', 'COMPLETED'] as ('ACTIVE' | 'COMPLETED')[] };

async function myEnrollment(studentId: string, enrollmentId: string) {
  const e = await prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId } });
  if (!e) throw ApiError.notFound('Enrollment not found');
  return e;
}

/** Batch ids the student may read learning content from. */
async function myBatchIds(studentId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({ where: { studentId, status: ACCESSIBLE_ENROLLMENT }, select: { batchId: true } });
  return rows.map((r) => r.batchId);
}

export async function getProfile(studentId: string) {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerifiedAt: true,
      createdAt: true,
      studentProfile: { select: { city: true, dateOfBirth: true, qualification: true, institution: true, graduationYear: true, consentAt: true } },
    },
  });
  if (!user) throw ApiError.notFound('Profile not found');
  return user;
}

/** Only these fields are editable by the student. Email/phone changes go through support. */
export async function updateProfile(
  studentId: string,
  input: { name?: string; city?: string | null; dateOfBirth?: Date | null; qualification?: string | null; institution?: string | null; graduationYear?: number | null },
) {
  const { name, ...profile } = input;
  await prisma.$transaction(async (tx) => {
    if (name) await tx.user.update({ where: { id: studentId }, data: { name: name.trim() } });
    if (Object.keys(profile).length) await tx.studentProfile.update({ where: { userId: studentId }, data: profile });
    await audit(tx, { id: studentId, role: 'STUDENT' }, { action: 'student.profile_updated', entityType: 'User', entityId: studentId, after: Object.keys(input) });
  });
  return getProfile(studentId);
}

export async function dashboard(studentId: string) {
  const [user, enrollments, applications, unread, announcements] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { name: true, emailVerifiedAt: true } }),
    prisma.enrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        batch: { select: { id: true, name: true, startDate: true, endDate: true, mode: true, status: true, schedules: true } },
        attendance: { select: { status: true } },
      },
    }),
    prisma.admissionApplication.findMany({
      where: { studentId, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] } },
      select: { id: true, applicationNumber: true, status: true, payablePaise: true, course: { select: { title: true } }, batch: { select: { name: true } } },
    }),
    prisma.notification.count({ where: { userId: studentId, readAt: null } }),
    announcementsFor(studentId, 5),
  ]);
  const batchIds = enrollments.filter((e) => e.status === 'ACTIVE').map((e) => e.batchId);
  const pending = await prisma.assignment.findMany({
    where: { batchId: { in: batchIds }, status: 'PUBLISHED', deletedAt: null, dueAt: { gte: new Date() }, submissions: { none: { studentId } } },
    orderBy: { dueAt: 'asc' },
    take: 5,
    select: { id: true, title: true, dueAt: true, batchId: true },
  });
  return {
    name: user.name,
    emailVerified: Boolean(user.emailVerifiedAt),
    enrollments: enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      course: e.course,
      batch: { ...e.batch, schedules: e.batch.schedules },
      attendancePercent: attendancePercent(e.attendance),
    })),
    openApplications: applications,
    pendingAssignments: pending,
    unreadNotifications: unread,
    announcements,
  };
}

export async function listEnrollments(studentId: string) {
  return prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { enrolledAt: 'desc' },
    include: {
      course: { select: { id: true, title: true, slug: true, durationLabel: true, mode: true } },
      batch: { select: { id: true, name: true, startDate: true, endDate: true, status: true, mode: true, venue: true } },
    },
  });
}

export async function getEnrollment(studentId: string, enrollmentId: string) {
  await myEnrollment(studentId, enrollmentId);
  const e = await prisma.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      course: { include: { modules: { orderBy: { order: 'asc' } } } },
      batch: {
        include: {
          schedules: { orderBy: { dayOfWeek: 'asc' } },
          trainers: { where: { removedAt: null }, select: { role: true, trainer: { select: { name: true } } } },
        },
      },
      application: { select: { applicationNumber: true, payablePaise: true } },
    },
  });
  const { deletedAt: _cd, ...course } = e.course;
  return { ...e, course, progress: await enrollmentProgress(prisma, enrollmentId) };
}

export async function timetable(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: {
      course: { select: { title: true } },
      batch: { select: { id: true, name: true, startDate: true, endDate: true, mode: true, venue: true, schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } } },
    },
  });
  return enrollments.flatMap((e) =>
    e.batch.schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      topic: s.topic,
      location: s.location ?? e.batch.venue,
      mode: e.batch.mode,
      course: e.course.title,
      batch: e.batch.name,
      batchId: e.batch.id,
      from: e.batch.startDate,
      to: e.batch.endDate,
    })),
  );
}

export async function attendance(studentId: string, enrollmentId: string) {
  await myEnrollment(studentId, enrollmentId);
  const records = await prisma.attendance.findMany({
    where: { enrollmentId, studentId },
    orderBy: { sessionDate: 'desc' },
    select: { sessionDate: true, status: true, remarks: true },
  });
  const counts = records.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  return { percent: attendancePercent(records), counts, records };
}

export async function materials(studentId: string) {
  const batchIds = await myBatchIds(studentId);
  const rows = await prisma.learningMaterial.findMany({
    where: { batchId: { in: batchIds }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      batch: { select: { name: true, course: { select: { title: true } } } },
      file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
    },
  });
  return rows.map((m) => ({ ...m, file: m.file ? publicFile(m.file) : null }));
}

export async function assignments(studentId: string) {
  const batchIds = await myBatchIds(studentId);
  const rows = await prisma.assignment.findMany({
    where: { batchId: { in: batchIds }, deletedAt: null, status: { not: 'DRAFT' } },
    orderBy: { dueAt: 'asc' },
    include: {
      batch: { select: { name: true, course: { select: { title: true } } } },
      submissions: { where: { studentId }, select: { id: true, status: true, marks: true, submittedAt: true } },
    },
  });
  return rows.map(({ submissions, ...a }) => ({ ...a, submission: submissions[0] ?? null }));
}

export async function assignment(studentId: string, assignmentId: string) {
  const batchIds = await myBatchIds(studentId);
  const a = await prisma.assignment.findFirst({
    where: { id: assignmentId, batchId: { in: batchIds }, deletedAt: null, status: { not: 'DRAFT' } },
    include: { batch: { select: { name: true, course: { select: { title: true } } } }, submissions: { where: { studentId }, include: { file: true } } },
  });
  if (!a) throw ApiError.notFound('Assignment not found');
  const { submissions, ...rest } = a;
  const s = submissions[0];
  return {
    ...rest,
    submission: s
      ? { id: s.id, status: s.status, content: s.content, linkUrl: s.linkUrl, file: s.file ? publicFile(s.file) : null, submittedAt: s.submittedAt, marks: s.marks, feedback: s.feedback, gradedAt: s.gradedAt }
      : null,
  };
}

export async function submitAssignment(studentId: string, assignmentId: string, input: { content?: string; linkUrl?: string; fileId?: string }) {
  if (!input.content?.trim() && !input.linkUrl?.trim() && !input.fileId) {
    throw ApiError.validation([{ field: 'content', message: 'Add your answer, a link or a file' }]);
  }
  return prisma.$transaction(async (tx) => {
    const a = await tx.assignment.findFirst({ where: { id: assignmentId, deletedAt: null } });
    if (!a) throw ApiError.notFound('Assignment not found');
    const enrollment = await tx.enrollment.findFirst({ where: { studentId, batchId: a.batchId, status: 'ACTIVE' } });
    if (!enrollment) throw ApiError.notFound('Assignment not found');
    if (a.status !== 'PUBLISHED') throw ApiError.conflict('This assignment is closed for submissions');
    const existing = await tx.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
    if (existing && existing.status === 'GRADED') throw ApiError.conflict('This assignment has already been graded');
    if (input.fileId) await assertAttachable(tx, studentId, input.fileId, 'ASSIGNMENT_SUBMISSION', { submissionId: existing?.id });
    const status = Date.now() > a.dueAt.getTime() ? 'LATE' : 'SUBMITTED';
    const data = { content: input.content?.trim() || null, linkUrl: input.linkUrl?.trim() || null, fileId: input.fileId ?? null, status, submittedAt: new Date() } as const;
    const saved = existing
      ? await tx.assignmentSubmission.update({ where: { id: existing.id }, data: { ...data, marks: null, feedback: existing.feedback } })
      : await tx.assignmentSubmission.create({ data: { ...data, assignmentId, studentId, enrollmentId: enrollment.id } });
    await audit(tx, { id: studentId, role: 'STUDENT' }, { action: existing ? 'submission.updated' : 'submission.created', entityType: 'AssignmentSubmission', entityId: saved.id, after: { status } });
    return { id: saved.id, status: saved.status, submittedAt: saved.submittedAt };
  });
}

/** Only published results are visible to the student. */
export async function results(studentId: string) {
  const rows = await prisma.result.findMany({
    where: { studentId, assessment: { resultsPublished: true } },
    orderBy: { createdAt: 'desc' },
    include: { assessment: { select: { title: true, type: true, maxMarks: true, passMarks: true, heldOn: true, batch: { select: { name: true, course: { select: { title: true } } } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    marks: r.marks,
    remarks: r.remarks,
    passed: r.marks >= r.assessment.passMarks,
    assessment: r.assessment,
  }));
}

export async function assessments(studentId: string) {
  const batchIds = await myBatchIds(studentId);
  return prisma.assessment.findMany({
    where: { batchId: { in: batchIds } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, type: true, maxMarks: true, passMarks: true, heldOn: true, resultsPublished: true, batch: { select: { name: true } } },
  });
}

export async function feedback(studentId: string) {
  return prisma.feedback.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true, rating: true, createdAt: true, trainer: { select: { name: true } }, batch: { select: { name: true } } },
  });
}

export async function announcementsFor(studentId: string, take = 50) {
  const batchIds = await myBatchIds(studentId);
  return prisma.announcement.findMany({
    where: { OR: [{ batchId: { in: batchIds } }, ...(batchIds.length ? [{ batchId: null }] : [])] },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, title: true, body: true, createdAt: true, batch: { select: { name: true } } },
  });
}

export async function certificates(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: {
      course: { select: { title: true } },
      batch: { select: { name: true, startDate: true, endDate: true } },
      certificate: true,
    },
  });
  return Promise.all(
    enrollments.map(async (e) => ({
      enrollmentId: e.id,
      course: e.course.title,
      batch: e.batch,
      certificate:
        e.certificate && e.certificate.status === 'ISSUED'
          ? { id: e.certificate.id, certificateNumber: e.certificate.certificateNumber, verificationCode: e.certificate.verificationCode, issuedAt: e.certificate.issuedAt }
          : null,
      revoked: e.certificate?.status === 'REVOKED',
      eligibility: e.certificate ? null : await certificateEligibility(e.id),
    })),
  );
}

export async function certificate(studentId: string, certificateId: string) {
  const c = await prisma.certificate.findFirst({
    where: { id: certificateId, studentId, status: 'ISSUED' },
    include: { student: { select: { name: true } }, course: { select: { title: true, durationLabel: true } }, batch: { select: { name: true, startDate: true, endDate: true, mode: true } } },
  });
  if (!c) throw ApiError.notFound('Certificate not found');
  return c;
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export async function createSupportRequest(studentId: string, input: { subject: string; message: string }) {
  return prisma.supportRequest.create({ data: { studentId, subject: input.subject.trim(), message: input.message.trim() } });
}

export async function listSupportRequests(studentId: string) {
  return prisma.supportRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, subject: true, message: true, status: true, response: true, respondedAt: true, createdAt: true },
  });
}

export async function adminListSupport(q: { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; skip: number; take: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.supportRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take, include: { student: { select: { id: true, name: true, email: true } } } }),
    prisma.supportRequest.count({ where }),
  ]);
  return { items, total };
}

export async function adminRespondSupport(actor: { id: string; role: string }, id: string, input: { status: 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; response?: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.supportRequest.findUnique({ where: { id } });
    if (!req) throw ApiError.notFound('Support request not found');
    const updated = await tx.supportRequest.update({
      where: { id },
      data: { status: input.status, ...(input.response ? { response: input.response, respondedById: actor.id, respondedAt: new Date() } : {}) },
    });
    await audit(tx, actor, { action: 'support.updated', entityType: 'SupportRequest', entityId: id, before: { status: req.status }, after: { status: input.status } });
    if (input.response) {
      await notify(tx, req.studentId, { type: 'SUPPORT', title: `Support: ${req.subject}`, body: input.response.slice(0, 300), email: true }, after);
    }
    return updated;
  });
  await after.flush();
  return result;
}
