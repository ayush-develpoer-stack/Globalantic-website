import { Prisma, type AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { AfterCommit, notify } from './notification.service';
import { assertAttachable, publicFile } from './file.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Trainer-side learning operations. Every function takes the acting trainer
 * and first proves the batch is assigned to them (assertTrainerBatch); a batch
 * that is not theirs is reported as "not found" so ids cannot be probed.
 */

// ---------------------------------------------------------------------------
// Access & shared maths
// ---------------------------------------------------------------------------

export async function assertTrainerBatch(db: Db, trainerId: string, batchId: string) {
  const assignment = await db.trainerAssignment.findFirst({
    where: { trainerId, batchId, removedAt: null, batch: { deletedAt: null } },
    select: { id: true },
  });
  if (!assignment) throw ApiError.notFound('Batch not found');
}

export function toSessionDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function attendancePercent(records: { status: AttendanceStatus }[]): number | null {
  const counted = records.filter((r) => r.status !== 'EXCUSED');
  if (!counted.length) return null;
  const attended = counted.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  return Math.round((attended * 100) / counted.length);
}

async function notifyBatchStudents(tx: Prisma.TransactionClient, batchId: string, input: Parameters<typeof notify>[2], after: AfterCommit) {
  const enrolled = await tx.enrollment.findMany({ where: { batchId, status: 'ACTIVE' }, select: { studentId: true } });
  for (const e of enrolled) await notify(tx, e.studentId, input, after);
}

// ---------------------------------------------------------------------------
// Dashboard, batches, roster
// ---------------------------------------------------------------------------

export async function trainerDashboard(trainerId: string) {
  const assignments = await prisma.trainerAssignment.findMany({
    where: { trainerId, removedAt: null, batch: { deletedAt: null } },
    include: {
      batch: {
        include: {
          course: { select: { id: true, title: true } },
          schedules: true,
          _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
        },
      },
    },
  });
  const batchIds = assignments.map((a) => a.batchId);
  const today = new Date().getUTCDay();
  const [toGrade, assignmentsDue] = await Promise.all([
    prisma.assignmentSubmission.count({ where: { assignment: { batchId: { in: batchIds } }, status: { in: ['SUBMITTED', 'LATE'] } } }),
    prisma.assignment.count({ where: { batchId: { in: batchIds }, status: 'PUBLISHED', dueAt: { gte: new Date() } } }),
  ]);
  return {
    batches: assignments.map((a) => ({
      id: a.batch.id,
      name: a.batch.name,
      status: a.batch.status,
      role: a.role,
      course: a.batch.course,
      startDate: a.batch.startDate,
      endDate: a.batch.endDate,
      mode: a.batch.mode,
      activeStudents: a.batch._count.enrollments,
    })),
    todaysClasses: assignments.flatMap((a) =>
      a.batch.schedules
        .filter((s) => s.dayOfWeek === today && ['OPEN', 'FULL', 'IN_PROGRESS', 'UPCOMING'].includes(a.batch.status))
        .map((s) => ({ ...s, batchId: a.batch.id, batchName: a.batch.name, course: a.batch.course.title })),
    ),
    submissionsToGrade: toGrade,
    openAssignments: assignmentsDue,
  };
}

export async function trainerBatch(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  return prisma.batch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      course: { include: { modules: { orderBy: { order: 'asc' } } } },
      schedules: { orderBy: { dayOfWeek: 'asc' } },
      trainers: { where: { removedAt: null }, include: { trainer: { select: { id: true, name: true } } } },
      _count: { select: { enrollments: true, assignments: true, assessments: true, materials: true } },
    },
  });
}

/** Roster: name + email only — no phone, payments or other personal data. */
export async function trainerRoster(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  const enrollments = await prisma.enrollment.findMany({
    where: { batchId },
    orderBy: { student: { name: 'asc' } },
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      student: { select: { id: true, name: true, email: true } },
      attendance: { select: { status: true } },
    },
  });
  return enrollments.map((e) => ({
    enrollmentId: e.id,
    status: e.status,
    enrolledAt: e.enrolledAt,
    student: e.student,
    attendancePercent: attendancePercent(e.attendance),
  }));
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function getAttendanceForDate(trainerId: string, batchId: string, date: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  const [roster, records] = await Promise.all([
    prisma.enrollment.findMany({
      where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      orderBy: { student: { name: 'asc' } },
      select: { id: true, student: { select: { id: true, name: true } } },
    }),
    prisma.attendance.findMany({ where: { batchId, sessionDate: toSessionDate(date) } }),
  ]);
  const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
  return roster.map((e) => {
    const r = byEnrollment.get(e.id);
    return { enrollmentId: e.id, student: e.student, status: r?.status ?? null, remarks: r?.remarks ?? null, recordId: r?.id ?? null };
  });
}

export async function markAttendance(
  actor: Actor,
  batchId: string,
  input: { date: string; records: { enrollmentId: string; status: AttendanceStatus; remarks?: string }[] },
) {
  const sessionDate = toSessionDate(input.date);
  return prisma.$transaction(async (tx) => {
    await assertTrainerBatch(tx, actor.id, batchId);
    const batch = await tx.batch.findUniqueOrThrow({ where: { id: batchId } });
    const day = (d: Date) => d.toISOString().slice(0, 10);
    if (input.date < day(batch.startDate) || input.date > day(batch.endDate)) {
      throw ApiError.validation([{ field: 'date', message: 'The date must fall within the batch dates' }]);
    }
    if (input.date > day(new Date(Date.now() + 14 * 3600_000))) {
      throw ApiError.validation([{ field: 'date', message: 'Attendance cannot be marked for a future date' }]);
    }
    const enrollments = await tx.enrollment.findMany({
      where: { id: { in: input.records.map((r) => r.enrollmentId) }, batchId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { id: true, studentId: true },
    });
    const valid = new Map(enrollments.map((e) => [e.id, e.studentId]));
    const invalid = input.records.filter((r) => !valid.has(r.enrollmentId));
    if (invalid.length) {
      throw ApiError.validation([{ field: 'records', message: 'Some students are not enrolled in this batch' }]);
    }

    let created = 0;
    let updated = 0;
    for (const r of input.records) {
      const existing = await tx.attendance.findUnique({ where: { enrollmentId_sessionDate: { enrollmentId: r.enrollmentId, sessionDate } } });
      if (!existing) {
        await tx.attendance.create({
          data: { batchId, enrollmentId: r.enrollmentId, studentId: valid.get(r.enrollmentId)!, sessionDate, status: r.status, remarks: r.remarks ?? null, markedById: actor.id },
        });
        created += 1;
      } else if (existing.status !== r.status || (existing.remarks ?? null) !== (r.remarks ?? null)) {
        await tx.attendance.update({ where: { id: existing.id }, data: { status: r.status, remarks: r.remarks ?? null, updatedById: actor.id } });
        // Every edit of an existing mark is audited with before/after.
        await audit(tx, actor, {
          action: 'attendance.edited',
          entityType: 'Attendance',
          entityId: existing.id,
          before: { status: existing.status, remarks: existing.remarks },
          after: { status: r.status, remarks: r.remarks ?? null },
        });
        updated += 1;
      }
    }
    await audit(tx, actor, { action: 'attendance.marked', entityType: 'Batch', entityId: batchId, after: { date: input.date, created, updated } });
    return { date: input.date, created, updated };
  });
}

export async function attendanceHistory(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  const rows = await prisma.attendance.groupBy({ by: ['sessionDate', 'status'], where: { batchId }, _count: true, orderBy: { sessionDate: 'desc' } });
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = r.sessionDate.toISOString().slice(0, 10);
    byDate.set(key, { ...(byDate.get(key) ?? {}), [r.status]: r._count });
  }
  return [...byDate.entries()].map(([date, counts]) => ({ date, counts }));
}

// ---------------------------------------------------------------------------
// Assignments & submissions
// ---------------------------------------------------------------------------

export interface AssignmentInput {
  title: string;
  description: string;
  resourceUrl?: string | null;
  dueAt: Date;
  maxMarks: number;
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
}

export async function listBatchAssignments(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  return prisma.assignment.findMany({
    where: { batchId, deletedAt: null },
    orderBy: { dueAt: 'desc' },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function createAssignment(actor: Actor, batchId: string, input: AssignmentInput) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    await assertTrainerBatch(tx, actor.id, batchId);
    const a = await tx.assignment.create({ data: { ...input, status: input.status ?? 'PUBLISHED', batchId, createdById: actor.id } });
    await audit(tx, actor, { action: 'assignment.created', entityType: 'Assignment', entityId: a.id, after: { batchId, title: a.title } });
    if (a.status === 'PUBLISHED') {
      await notifyBatchStudents(tx, batchId, { type: 'ASSIGNMENT', title: 'New assignment', body: `${a.title} — due ${a.dueAt.toISOString().slice(0, 10)}`, link: `${env.internPortalUrl}/assignments/${a.id}` }, after);
    }
    return a;
  });
  await after.flush();
  return result;
}

async function assignmentForTrainer(db: Db, trainerId: string, assignmentId: string) {
  const a = await db.assignment.findFirst({ where: { id: assignmentId, deletedAt: null } });
  if (!a) throw ApiError.notFound('Assignment not found');
  await assertTrainerBatch(db, trainerId, a.batchId);
  return a;
}

export async function updateAssignment(actor: Actor, assignmentId: string, input: Partial<AssignmentInput>) {
  return prisma.$transaction(async (tx) => {
    const before = await assignmentForTrainer(tx, actor.id, assignmentId);
    if (input.maxMarks !== undefined) {
      const over = await tx.assignmentSubmission.count({ where: { assignmentId, marks: { gt: input.maxMarks } } });
      if (over) throw ApiError.conflict('Some submissions already have more marks than the new maximum');
    }
    const after = await tx.assignment.update({ where: { id: assignmentId }, data: input });
    await audit(tx, actor, { action: 'assignment.updated', entityType: 'Assignment', entityId: assignmentId, before: { status: before.status, dueAt: before.dueAt, maxMarks: before.maxMarks }, after: input });
    return after;
  });
}

export async function getAssignmentWithSubmissions(trainerId: string, assignmentId: string) {
  const a = await assignmentForTrainer(prisma, trainerId, assignmentId);
  const [submissions, roster] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: { student: { select: { id: true, name: true, email: true } }, file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } },
      orderBy: { submittedAt: 'asc' },
    }),
    prisma.enrollment.count({ where: { batchId: a.batchId, status: 'ACTIVE' } }),
  ]);
  return { assignment: a, submissions, expected: roster };
}

export async function gradeSubmission(actor: Actor, submissionId: string, input: { marks: number; feedback?: string; returnForResubmission?: boolean }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const s = await tx.assignmentSubmission.findUnique({ where: { id: submissionId }, include: { assignment: true } });
    if (!s) throw ApiError.notFound('Submission not found');
    await assertTrainerBatch(tx, actor.id, s.assignment.batchId);
    if (input.marks > s.assignment.maxMarks) {
      throw ApiError.validation([{ field: 'marks', message: `Marks cannot exceed ${s.assignment.maxMarks}` }]);
    }
    const status = input.returnForResubmission ? 'RETURNED' : 'GRADED';
    const updated = await tx.assignmentSubmission.update({
      where: { id: submissionId },
      data: { marks: input.marks, feedback: input.feedback ?? null, status, gradedById: actor.id, gradedAt: new Date() },
    });
    await audit(tx, actor, { action: 'submission.graded', entityType: 'AssignmentSubmission', entityId: submissionId, before: { marks: s.marks, status: s.status }, after: { marks: input.marks, status } });
    await notify(tx, s.studentId, { type: 'ASSIGNMENT', title: status === 'RETURNED' ? 'Assignment returned for changes' : 'Assignment graded', body: `${s.assignment.title}: ${input.marks}/${s.assignment.maxMarks}`, link: `${env.internPortalUrl}/assignments/${s.assignmentId}` }, after);
    return updated;
  });
  await after.flush();
  return result;
}

// ---------------------------------------------------------------------------
// Materials & announcements
// ---------------------------------------------------------------------------

export async function listMaterials(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  const rows = await prisma.learningMaterial.findMany({ where: { batchId, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { file: { select: FILE_META } } });
  return rows.map((m) => ({ ...m, file: m.file ? publicFile(m.file) : null }));
}

const FILE_META = { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } as const;

export async function addMaterial(actor: Actor, batchId: string, input: { title: string; description?: string; type: 'LINK' | 'DOCUMENT' | 'VIDEO'; url?: string; fileId?: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    await assertTrainerBatch(tx, actor.id, batchId);
    if (input.fileId) await assertAttachable(tx, actor.id, input.fileId, 'LEARNING_MATERIAL');
    const m = await tx.learningMaterial.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        // An uploaded file is always a DOCUMENT; links keep the chosen type.
        type: input.fileId ? 'DOCUMENT' : input.type,
        url: input.fileId ? null : (input.url ?? null),
        fileId: input.fileId ?? null,
        batchId,
        uploadedById: actor.id,
      },
    });
    await audit(tx, actor, { action: 'material.added', entityType: 'LearningMaterial', entityId: m.id, after: { batchId, title: m.title } });
    await notifyBatchStudents(tx, batchId, { type: 'MATERIAL', title: 'New learning material', body: m.title, link: `${env.internPortalUrl}/materials` }, after);
    return m;
  });
  await after.flush();
  return result;
}

export async function removeMaterial(actor: Actor, materialId: string) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.learningMaterial.findFirst({ where: { id: materialId, deletedAt: null } });
    if (!m) throw ApiError.notFound('Material not found');
    await assertTrainerBatch(tx, actor.id, m.batchId);
    await tx.learningMaterial.update({ where: { id: materialId }, data: { deletedAt: new Date() } });
    await audit(tx, actor, { action: 'material.removed', entityType: 'LearningMaterial', entityId: materialId });
    return { id: materialId };
  });
}

export async function listBatchAnnouncements(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  return prisma.announcement.findMany({ where: { batchId }, orderBy: { createdAt: 'desc' }, take: 100 });
}

/** batchId null = programme-wide (admin only; enforced by the route). */
export async function postAnnouncement(actor: Actor, batchId: string | null, input: { title: string; body: string }, opts: { asTrainer: boolean }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    if (opts.asTrainer) {
      if (!batchId) throw ApiError.forbidden('Trainers can only post to their own batches');
      await assertTrainerBatch(tx, actor.id, batchId);
    } else if (batchId && !(await tx.batch.findFirst({ where: { id: batchId, deletedAt: null } }))) {
      throw ApiError.notFound('Batch not found');
    }
    const a = await tx.announcement.create({ data: { batchId, title: input.title, body: input.body, createdById: actor.id } });
    await audit(tx, actor, { action: 'announcement.posted', entityType: 'Announcement', entityId: a.id, after: { batchId } });
    const recipients = batchId
      ? await tx.enrollment.findMany({ where: { batchId, status: 'ACTIVE' }, select: { studentId: true } })
      : await tx.enrollment.findMany({ where: { status: 'ACTIVE' }, distinct: ['studentId'], select: { studentId: true } });
    for (const r of recipients) {
      await notify(tx, r.studentId, { type: 'ANNOUNCEMENT', title: input.title, body: input.body.slice(0, 300), link: `${env.internPortalUrl}/announcements` }, after);
    }
    return a;
  });
  await after.flush();
  return result;
}

// ---------------------------------------------------------------------------
// Assessments & results
// ---------------------------------------------------------------------------

export async function listAssessments(trainerId: string, batchId: string) {
  await assertTrainerBatch(prisma, trainerId, batchId);
  return prisma.assessment.findMany({ where: { batchId }, orderBy: { createdAt: 'desc' }, include: { _count: { select: { results: true } } } });
}

export async function createAssessment(
  actor: Actor,
  batchId: string,
  input: { title: string; type: 'QUIZ' | 'TEST' | 'PROJECT' | 'FINAL'; maxMarks: number; passMarks: number; heldOn?: Date | null },
) {
  if (input.passMarks > input.maxMarks) {
    throw ApiError.validation([{ field: 'passMarks', message: 'Pass marks cannot exceed maximum marks' }]);
  }
  return prisma.$transaction(async (tx) => {
    await assertTrainerBatch(tx, actor.id, batchId);
    const a = await tx.assessment.create({ data: { ...input, heldOn: input.heldOn ?? null, batchId, createdById: actor.id } });
    await audit(tx, actor, { action: 'assessment.created', entityType: 'Assessment', entityId: a.id, after: { batchId, title: a.title } });
    return a;
  });
}

export async function getAssessmentResults(trainerId: string, assessmentId: string) {
  const a = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!a) throw ApiError.notFound('Assessment not found');
  await assertTrainerBatch(prisma, trainerId, a.batchId);
  const [roster, results] = await Promise.all([
    prisma.enrollment.findMany({ where: { batchId: a.batchId, status: { in: ['ACTIVE', 'COMPLETED'] } }, select: { id: true, student: { select: { id: true, name: true } } }, orderBy: { student: { name: 'asc' } } }),
    prisma.result.findMany({ where: { assessmentId } }),
  ]);
  const byEnrollment = new Map(results.map((r) => [r.enrollmentId, r]));
  return { assessment: a, rows: roster.map((e) => ({ enrollmentId: e.id, student: e.student, marks: byEnrollment.get(e.id)?.marks ?? null, remarks: byEnrollment.get(e.id)?.remarks ?? null })) };
}

export async function recordResults(actor: Actor, assessmentId: string, rows: { enrollmentId: string; marks: number; remarks?: string }[]) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
    if (!a) throw ApiError.notFound('Assessment not found');
    await assertTrainerBatch(tx, actor.id, a.batchId);
    if (rows.some((r) => r.marks > a.maxMarks)) {
      throw ApiError.validation([{ field: 'rows', message: `Marks cannot exceed ${a.maxMarks}` }]);
    }
    const enrollments = await tx.enrollment.findMany({ where: { id: { in: rows.map((r) => r.enrollmentId) }, batchId: a.batchId }, select: { id: true, studentId: true } });
    const valid = new Map(enrollments.map((e) => [e.id, e.studentId]));
    if (rows.some((r) => !valid.has(r.enrollmentId))) {
      throw ApiError.validation([{ field: 'rows', message: 'Some students are not enrolled in this batch' }]);
    }
    for (const r of rows) {
      const existing = await tx.result.findUnique({ where: { assessmentId_studentId: { assessmentId, studentId: valid.get(r.enrollmentId)! } } });
      if (existing && existing.marks !== r.marks) {
        await audit(tx, actor, { action: 'result.edited', entityType: 'Result', entityId: existing.id, before: { marks: existing.marks }, after: { marks: r.marks } });
      }
      await tx.result.upsert({
        where: { assessmentId_studentId: { assessmentId, studentId: valid.get(r.enrollmentId)! } },
        update: { marks: r.marks, remarks: r.remarks ?? null, recordedById: actor.id },
        create: { assessmentId, enrollmentId: r.enrollmentId, studentId: valid.get(r.enrollmentId)!, marks: r.marks, remarks: r.remarks ?? null, recordedById: actor.id },
      });
    }
    await audit(tx, actor, { action: 'results.recorded', entityType: 'Assessment', entityId: assessmentId, after: { rows: rows.length } });
    return { saved: rows.length };
  });
}

export async function publishResults(actor: Actor, assessmentId: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
    if (!a) throw ApiError.notFound('Assessment not found');
    await assertTrainerBatch(tx, actor.id, a.batchId);
    const updated = await tx.assessment.update({ where: { id: assessmentId }, data: { resultsPublished: true } });
    await audit(tx, actor, { action: 'results.published', entityType: 'Assessment', entityId: assessmentId });
    if (!a.resultsPublished) {
      const results = await tx.result.findMany({ where: { assessmentId }, select: { studentId: true } });
      for (const r of results) {
        await notify(tx, r.studentId, { type: 'RESULT', title: 'Result published', body: `Your result for ${a.title} is available.`, link: `${env.internPortalUrl}/results` }, after);
      }
    }
    return updated;
  });
  await after.flush();
  return result;
}

// ---------------------------------------------------------------------------
// Feedback, progress & reports
// ---------------------------------------------------------------------------

export async function giveFeedback(actor: Actor, enrollmentId: string, input: { content: string; rating?: number }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const e = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw ApiError.notFound('Student not found');
    await assertTrainerBatch(tx, actor.id, e.batchId);
    const f = await tx.feedback.create({ data: { batchId: e.batchId, enrollmentId, studentId: e.studentId, trainerId: actor.id, content: input.content, rating: input.rating ?? null } });
    await notify(tx, e.studentId, { type: 'FEEDBACK', title: 'New feedback from your trainer', body: input.content.slice(0, 200), link: `${env.internPortalUrl}/feedback` }, after);
    return f;
  });
  await after.flush();
  return result;
}

export async function enrollmentProgress(db: Db, enrollmentId: string) {
  const e = await db.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      attendance: { select: { status: true, sessionDate: true } },
      submissions: { select: { assignmentId: true, status: true, marks: true } },
      results: { include: { assessment: { select: { title: true, maxMarks: true, passMarks: true, type: true, resultsPublished: true } } } },
    },
  });
  const assignments = await db.assignment.findMany({ where: { batchId: e.batchId, deletedAt: null, status: { not: 'DRAFT' } }, select: { id: true, maxMarks: true } });
  const graded = e.submissions.filter((s) => s.marks !== null);
  const maxById = new Map(assignments.map((a) => [a.id, a.maxMarks]));
  const assignmentAvg = graded.length
    ? Math.round((graded.reduce((sum, s) => sum + (s.marks! / (maxById.get(s.assignmentId) || 1)) * 100, 0) / graded.length))
    : null;
  return {
    enrollmentId,
    attendancePercent: attendancePercent(e.attendance),
    sessionsRecorded: e.attendance.length,
    assignmentsTotal: assignments.length,
    assignmentsSubmitted: e.submissions.length,
    assignmentsGraded: graded.length,
    assignmentAveragePercent: assignmentAvg,
    results: e.results.map((r) => ({
      assessment: r.assessment.title,
      type: r.assessment.type,
      marks: r.marks,
      maxMarks: r.assessment.maxMarks,
      passed: r.marks >= r.assessment.passMarks,
      published: r.assessment.resultsPublished,
    })),
  };
}

export async function trainerStudentProgress(trainerId: string, enrollmentId: string) {
  const e = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: { select: { id: true, name: true, email: true } } } });
  if (!e) throw ApiError.notFound('Student not found');
  await assertTrainerBatch(prisma, trainerId, e.batchId);
  const feedback = await prisma.feedback.findMany({ where: { enrollmentId }, orderBy: { createdAt: 'desc' } });
  return { student: e.student, status: e.status, progress: await enrollmentProgress(prisma, enrollmentId), feedback };
}

/** Allowed batch report: learning data only (no fees, phones or payment details). */
export async function batchReport(trainerId: string | null, batchId: string) {
  if (trainerId) await assertTrainerBatch(prisma, trainerId, batchId);
  const batch = await prisma.batch.findFirst({ where: { id: batchId, deletedAt: null }, include: { course: { select: { title: true, minAttendancePercent: true } } } });
  if (!batch) throw ApiError.notFound('Batch not found');
  const enrollments = await prisma.enrollment.findMany({ where: { batchId }, include: { student: { select: { name: true, email: true } } }, orderBy: { student: { name: 'asc' } } });
  const rows = [];
  for (const e of enrollments) {
    const p = await enrollmentProgress(prisma, e.id);
    rows.push({
      student: e.student.name,
      email: e.student.email,
      status: e.status,
      attendancePercent: p.attendancePercent,
      meetsAttendance: p.attendancePercent !== null && p.attendancePercent >= batch.course.minAttendancePercent,
      assignmentsSubmitted: p.assignmentsSubmitted,
      assignmentsTotal: p.assignmentsTotal,
      assignmentAveragePercent: p.assignmentAveragePercent,
      assessmentsPassed: p.results.filter((r) => r.passed).length,
      assessmentsTaken: p.results.length,
    });
  }
  return { batch: { id: batch.id, name: batch.name, course: batch.course.title, minAttendancePercent: batch.course.minAttendancePercent }, generatedAt: new Date(), rows };
}
