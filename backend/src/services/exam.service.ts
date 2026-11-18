import crypto from 'node:crypto';
import { Prisma, type Exam, type ExamQuestion, type ExamAssignmentTarget, type ExamKind, type ExamQuestionType, type ExamResultVisibility, type ExamTrack } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { AfterCommit, notify } from './notification.service';

/**
 * Marketing & Sales intern examinations.
 *
 * Integrity rules (all enforced here, never in the browser):
 * - Students only see published exams assigned to them (by student, batch, college or programme).
 * - The time window, attempt limit (+ retake grants) and one-active-attempt rule are checked on start.
 * - Each attempt stores its own question/option order and a server deadline.
 * - Answers are validated against the attempt's questions; saves after deadline + grace are refused.
 * - Late attempts are finalised (auto-submitted) lazily whenever anyone reads them.
 * - Scoring happens on the server. Answer keys, rubrics and explanations are only ever sent to
 *   staff, or to the student after their result is visible and the exam reveals answers.
 * - Attempt rows are locked (SELECT ... FOR UPDATE) for save / submit / evaluate, so a save can
 *   never land after a submission and a submission can never be applied twice.
 * The browser can report focus loss (counted, informational only). Nothing here claims to prevent
 * every form of cheating in a browser-based test.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Network allowance for a save that left the browser just before the deadline. */
export const GRACE_MS = 15_000;
const MAX_TEXT = 10_000;

export interface OptionInput {
  id?: string;
  text: string;
  correct?: boolean;
}
interface StoredOption {
  id: string;
  text: string;
}

const optionsOf = (q: Pick<ExamQuestion, 'options'>): StoredOption[] => (Array.isArray(q.options) ? (q.options as unknown as StoredOption[]) : []);
const newOptionId = () => crypto.randomBytes(5).toString('hex');

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Marks are kept to 2 decimals (negative marking produces fractions). */
const round2 = (n: number) => Math.round(n * 100) / 100;
const percentOf = (score: number, max: number) => (max > 0 ? Math.round((score * 1000) / max) / 10 : 0);
const passes = (score: number, max: number, passPercent: number) => max > 0 && score * 100 >= passPercent * max;

/** Locks one attempt row for the rest of the transaction. */
async function lockAttempt(tx: Prisma.TransactionClient, attemptId: string) {
  await tx.$queryRaw`SELECT id FROM "exam_attempts" WHERE id = ${attemptId} FOR UPDATE`;
}

// ===========================================================================
// Question bank (staff)
// ===========================================================================

export interface QuestionInput {
  track: ExamTrack;
  topic: string;
  type: ExamQuestionType;
  prompt: string;
  options?: OptionInput[];
  marks: number;
  guidance?: string | null;
  explanation?: string | null;
}

/** Builds stored options + answer key; keeps existing option ids when the text is edited. */
function buildOptions(input: QuestionInput, previous: StoredOption[] = []) {
  if (input.type === 'DESCRIPTIVE') return { options: Prisma.DbNull, correctOptionIds: [] as string[] };
  const opts = (input.options ?? []).map((o) => ({
    id: o.id && previous.some((p) => p.id === o.id) ? o.id : newOptionId(),
    text: o.text.trim(),
    correct: Boolean(o.correct),
  }));
  return { options: opts.map(({ id, text }) => ({ id, text })) as Prisma.InputJsonValue, correctOptionIds: opts.filter((o) => o.correct).map((o) => o.id) };
}

/** A question is locked once a non-draft exam uses it or any student has answered it. */
async function questionLocked(db: Db, questionId: string): Promise<boolean> {
  const [links, answers] = await Promise.all([
    db.examQuestionLink.count({ where: { questionId, exam: { status: { not: 'DRAFT' } } } }),
    db.examAnswer.count({ where: { questionId } }),
  ]);
  return links > 0 || answers > 0;
}

export async function listQuestions(q: { track?: ExamTrack; topic?: string; type?: ExamQuestionType; search?: string; archived?: boolean; skip: number; take: number }) {
  const where: Prisma.ExamQuestionWhereInput = {
    ...(q.track ? { track: q.track } : {}),
    ...(q.topic ? { topic: { equals: q.topic, mode: 'insensitive' } } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.search ? { prompt: { contains: q.search, mode: 'insensitive' } } : {}),
    archivedAt: q.archived ? { not: null } : null,
  };
  const [items, total] = await Promise.all([
    prisma.examQuestion.findMany({ where, orderBy: [{ track: 'asc' }, { topic: 'asc' }, { createdAt: 'desc' }], skip: q.skip, take: q.take, include: { _count: { select: { exams: true } } } }),
    prisma.examQuestion.count({ where }),
  ]);
  return { items, total };
}

export async function listTopics() {
  const rows = await prisma.examQuestion.groupBy({ by: ['track', 'topic'], where: { archivedAt: null }, _count: { _all: true }, orderBy: [{ track: 'asc' }, { topic: 'asc' }] });
  return rows.map((r) => ({ track: r.track, topic: r.topic, count: r._count._all }));
}

export async function getQuestion(id: string) {
  const q = await prisma.examQuestion.findUnique({ where: { id }, include: { _count: { select: { exams: true } } } });
  if (!q) throw ApiError.notFound('Question not found');
  return { ...q, locked: await questionLocked(prisma, id) };
}

export async function createQuestion(actor: Actor, input: QuestionInput) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.examQuestion.create({
      data: {
        track: input.track,
        topic: input.topic.trim(),
        type: input.type,
        prompt: input.prompt.trim(),
        marks: input.marks,
        guidance: input.guidance ?? null,
        explanation: input.explanation ?? null,
        createdById: actor.id,
        ...buildOptions(input),
      },
    });
    await audit(tx, actor, { action: 'exam.question_created', entityType: 'ExamQuestion', entityId: q.id, after: { track: q.track, topic: q.topic, type: q.type } });
    return q;
  });
}

export async function updateQuestion(actor: Actor, id: string, input: QuestionInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.examQuestion.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Question not found');
    if (await questionLocked(tx, id)) {
      throw ApiError.conflict('This question is used by a published exam or has answers. Archive it and create a new question instead.');
    }
    const q = await tx.examQuestion.update({
      where: { id },
      data: {
        track: input.track,
        topic: input.topic.trim(),
        type: input.type,
        prompt: input.prompt.trim(),
        marks: input.marks,
        guidance: input.guidance ?? null,
        explanation: input.explanation ?? null,
        ...buildOptions(input, optionsOf(before)),
      },
    });
    // A draft exam that uses it must stay on the same track.
    const otherTrack = await tx.examQuestionLink.count({ where: { questionId: id, exam: { track: { not: q.track } } } });
    if (otherTrack > 0) throw ApiError.conflict('This question is used by an exam on another track. Remove it from that exam first.');
    await audit(tx, actor, { action: 'exam.question_updated', entityType: 'ExamQuestion', entityId: id, before: { prompt: before.prompt, marks: before.marks }, after: { prompt: q.prompt, marks: q.marks } });
    return q;
  });
}

export async function setQuestionArchived(actor: Actor, id: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.examQuestion.findUnique({ where: { id } });
    if (!q) throw ApiError.notFound('Question not found');
    const updated = await tx.examQuestion.update({ where: { id }, data: { archivedAt: archived ? (q.archivedAt ?? new Date()) : null } });
    await audit(tx, actor, { action: archived ? 'exam.question_archived' : 'exam.question_restored', entityType: 'ExamQuestion', entityId: id });
    return updated;
  });
}

// ===========================================================================
// Exams (staff)
// ===========================================================================

export interface ExamInput {
  title: string;
  description?: string | null;
  instructions: string;
  eligibilityNote?: string | null;
  track: ExamTrack;
  kind: ExamKind;
  durationMinutes: number;
  passPercent: number;
  maxAttempts: number;
  questionsPerAttempt?: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultVisibility: ExamResultVisibility;
  revealAnswers: boolean;
  negativeMarkPercent: number;
  interviewMaxMarks?: number | null;
  opensAt?: Date | null;
  closesAt?: Date | null;
}

/** Fields that change how attempts are built or scored: frozen once an exam is published. */
const STRUCTURAL: (keyof ExamInput)[] = ['track', 'kind', 'durationMinutes', 'passPercent', 'questionsPerAttempt', 'shuffleQuestions', 'shuffleOptions', 'negativeMarkPercent', 'interviewMaxMarks'];

function examData(input: ExamInput) {
  return {
    title: input.title.trim(),
    description: input.description ?? null,
    instructions: input.instructions,
    eligibilityNote: input.eligibilityNote ?? null,
    track: input.track,
    kind: input.kind,
    durationMinutes: input.durationMinutes,
    passPercent: input.passPercent,
    maxAttempts: input.maxAttempts,
    questionsPerAttempt: input.kind === 'INTERVIEW' ? null : (input.questionsPerAttempt ?? null),
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    resultVisibility: input.resultVisibility,
    revealAnswers: input.revealAnswers,
    negativeMarkPercent: input.kind === 'INTERVIEW' ? 0 : input.negativeMarkPercent,
    interviewMaxMarks: input.kind === 'INTERVIEW' ? (input.interviewMaxMarks ?? null) : null,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
  };
}

export async function listExams(q: { status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; track?: ExamTrack; search?: string; skip: number; take: number }) {
  const where: Prisma.ExamWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.track ? { track: q.track } : {}),
    ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.exam.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: q.skip,
      take: q.take,
      include: { _count: { select: { questions: true, assignments: true, attempts: true } } },
    }),
    prisma.exam.count({ where }),
  ]);
  const pending = await prisma.examAttempt.groupBy({ by: ['examId'], where: { examId: { in: rows.map((r) => r.id) }, status: 'SUBMITTED' }, _count: { _all: true } });
  const pendingBy = new Map(pending.map((p) => [p.examId, p._count._all]));
  return { items: rows.map((r) => ({ ...r, pendingEvaluation: pendingBy.get(r.id) ?? 0 })), total };
}

async function loadExam(db: Db, id: string) {
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam) throw ApiError.notFound('Exam not found');
  return exam;
}

export async function getExam(id: string) {
  await finalizeExpired({ examId: id });
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { position: 'asc' }, include: { question: true } },
      assignments: {
        orderBy: { createdAt: 'asc' },
        include: {
          student: { select: { id: true, name: true, email: true } },
          batch: { select: { id: true, name: true, course: { select: { title: true } } } },
          course: { select: { id: true, title: true, programType: true } },
        },
      },
      _count: { select: { attempts: true, retakes: true } },
    },
  });
  if (!exam) throw ApiError.notFound('Exam not found');
  const byStatus = await prisma.examAttempt.groupBy({ by: ['status'], where: { examId: id }, _count: { _all: true } });
  const totalMarks = exam.questions.reduce((s, l) => s + l.question.marks, 0);
  return {
    ...exam,
    questions: exam.questions.map((l) => ({ position: l.position, ...l.question })),
    totalMarks: exam.kind === 'INTERVIEW' ? (exam.interviewMaxMarks ?? 0) : totalMarks,
    attemptCounts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
  };
}

export async function createExam(actor: Actor, input: ExamInput) {
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({ data: { ...examData(input), createdById: actor.id } });
    await audit(tx, actor, { action: 'exam.created', entityType: 'Exam', entityId: exam.id, after: { title: exam.title, track: exam.track, kind: exam.kind } });
    return exam;
  });
}

export async function updateExam(actor: Actor, id: string, input: ExamInput) {
  return prisma.$transaction(async (tx) => {
    const before = await loadExam(tx, id);
    if (before.status === 'ARCHIVED') throw ApiError.conflict('Archived exams cannot be edited');
    const data = examData(input);
    if (before.status === 'PUBLISHED') {
      const changed = STRUCTURAL.filter((k) => {
        const prev = (before as unknown as Record<string, unknown>)[k];
        const next = (data as Record<string, unknown>)[k];
        return (prev ?? null) !== (next ?? null);
      });
      if (changed.length) {
        throw ApiError.conflict(`These settings are fixed once an exam is published: ${changed.join(', ')}. Archive it and create a new exam to change them.`);
      }
    }
    if (data.track !== before.track) {
      const mismatched = await tx.examQuestionLink.count({ where: { examId: id, question: { track: { not: data.track } } } });
      if (mismatched > 0) throw ApiError.conflict('Remove the questions from the other track before changing the track');
    }
    const exam = await tx.exam.update({ where: { id }, data });
    await audit(tx, actor, {
      action: 'exam.updated',
      entityType: 'Exam',
      entityId: id,
      before: { opensAt: before.opensAt, closesAt: before.closesAt, maxAttempts: before.maxAttempts, resultVisibility: before.resultVisibility },
      after: { opensAt: exam.opensAt, closesAt: exam.closesAt, maxAttempts: exam.maxAttempts, resultVisibility: exam.resultVisibility },
    });
    return exam;
  });
}

export async function setExamQuestions(actor: Actor, id: string, questionIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, id);
    if (exam.status !== 'DRAFT') throw ApiError.conflict('Questions can only be changed while the exam is a draft');
    if (exam.kind === 'INTERVIEW') throw ApiError.conflict('Interview-stage exams have no questions');
    const unique = [...new Set(questionIds)];
    const found = await tx.examQuestion.findMany({ where: { id: { in: unique } }, select: { id: true, track: true, archivedAt: true } });
    const errors: { field: string; message: string }[] = [];
    if (found.length !== unique.length) errors.push({ field: 'questionIds', message: 'One or more questions do not exist' });
    if (found.some((q) => q.archivedAt)) errors.push({ field: 'questionIds', message: 'Archived questions cannot be added' });
    if (found.some((q) => q.track !== exam.track)) errors.push({ field: 'questionIds', message: `Only ${exam.track.toLowerCase()} questions can be added to this exam` });
    if (errors.length) throw ApiError.validation(errors);
    await tx.examQuestionLink.deleteMany({ where: { examId: id } });
    if (unique.length) await tx.examQuestionLink.createMany({ data: unique.map((questionId, position) => ({ examId: id, questionId, position })) });
    await audit(tx, actor, { action: 'exam.questions_set', entityType: 'Exam', entityId: id, after: { count: unique.length } });
    return { count: unique.length };
  });
}

/** Student ids an exam is assigned to (resolved now). Used for notifications only. */
async function assignedStudentIds(db: Db, examId: string, only?: { assignmentId: string }): Promise<string[]> {
  const assignments = await db.examAssignment.findMany({ where: { examId, ...(only ? { id: only.assignmentId } : {}) } });
  const ids = new Set<string>();
  for (const a of assignments) {
    if (a.target === 'STUDENT' && a.studentId) ids.add(a.studentId);
    if (a.target === 'BATCH' && a.batchId) {
      (await db.enrollment.findMany({ where: { batchId: a.batchId, status: 'ACTIVE' }, select: { studentId: true } })).forEach((e) => ids.add(e.studentId));
    }
    if (a.target === 'PROGRAM' && a.courseId) {
      (await db.enrollment.findMany({ where: { courseId: a.courseId, status: 'ACTIVE' }, select: { studentId: true } })).forEach((e) => ids.add(e.studentId));
    }
    if (a.target === 'INSTITUTION' && a.institution) {
      (
        await db.studentProfile.findMany({ where: { institution: { equals: a.institution, mode: 'insensitive' }, user: { status: 'ACTIVE', role: 'STUDENT' } }, select: { userId: true }, take: 2000 })
      ).forEach((p) => ids.add(p.userId));
    }
  }
  return [...ids];
}

async function notifyAssigned(db: Db, exam: Exam, studentIds: string[], after: AfterCommit) {
  for (const sid of studentIds.slice(0, 2000)) {
    await notify(db, sid, { type: 'EXAM', title: `New exam: ${exam.title}`, body: exam.opensAt ? `Opens ${exam.opensAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.` : 'You can take it from your portal.', link: `${env.internPortalUrl}/exams/${exam.id}` }, after);
  }
}

export async function publishExam(actor: Actor, id: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, id);
    if (exam.status !== 'DRAFT') throw ApiError.conflict('Only draft exams can be published');
    const errors: { field: string; message: string }[] = [];
    if (exam.kind === 'INTERVIEW') {
      if (!exam.interviewMaxMarks) errors.push({ field: 'interviewMaxMarks', message: 'Set the maximum marks for the interview' });
    } else {
      const count = await tx.examQuestionLink.count({ where: { examId: id } });
      if (count === 0) errors.push({ field: 'questions', message: 'Add at least one question before publishing' });
      if (exam.questionsPerAttempt && exam.questionsPerAttempt > count) errors.push({ field: 'questionsPerAttempt', message: `Only ${count} questions are attached` });
    }
    if (exam.closesAt && exam.closesAt <= new Date()) errors.push({ field: 'closesAt', message: 'The closing time is in the past' });
    if (errors.length) throw ApiError.validation(errors, 'The exam is not ready to publish');
    const updated = await tx.exam.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await audit(tx, actor, { action: 'exam.published', entityType: 'Exam', entityId: id });
    await notifyAssigned(tx, updated, await assignedStudentIds(tx, id), after);
    return updated;
  });
  await after.flush();
  return result;
}

export async function archiveExam(actor: Actor, id: string) {
  await finalizeExpired({ examId: id });
  const open = await prisma.examAttempt.findMany({ where: { examId: id, status: 'IN_PROGRESS' }, select: { id: true } });
  // Archiving ends the exam: attempts still running are submitted as they are.
  for (const a of open) await prisma.$transaction((tx) => finalizeAttempt(tx, a.id, { auto: true, at: new Date() }));
  return prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, id);
    if (exam.status === 'ARCHIVED') return exam;
    const updated = await tx.exam.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    await audit(tx, actor, { action: 'exam.archived', entityType: 'Exam', entityId: id, after: { submittedOnArchive: open.length } });
    return updated;
  });
}

export async function releaseResults(actor: Actor, id: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, id);
    if (exam.status === 'DRAFT') throw ApiError.conflict('Publish the exam first');
    if (exam.resultsReleasedAt) throw ApiError.conflict('Results were already released');
    const updated = await tx.exam.update({ where: { id }, data: { resultsReleasedAt: new Date() } });
    const evaluated = await tx.examAttempt.findMany({ where: { examId: id, status: 'EVALUATED' }, select: { id: true, studentId: true } });
    for (const a of evaluated) {
      await notify(tx, a.studentId, { type: 'EXAM_RESULT', title: `Result available: ${exam.title}`, body: 'Your exam result has been published.', link: `${env.internPortalUrl}/exams/attempts/${a.id}` }, after);
    }
    const pending = await tx.examAttempt.count({ where: { examId: id, status: 'SUBMITTED' } });
    await audit(tx, actor, { action: 'exam.results_released', entityType: 'Exam', entityId: id, after: { evaluated: evaluated.length, pendingEvaluation: pending } });
    return { ...updated, notified: evaluated.length, pendingEvaluation: pending };
  });
  await after.flush();
  return result;
}

// ---- Assignments ------------------------------------------------------------

export interface AssignmentInput {
  target: ExamAssignmentTarget;
  studentId?: string;
  batchId?: string;
  courseId?: string;
  institution?: string;
}

export async function addAssignment(actor: Actor, examId: string, input: AssignmentInput) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, examId);
    if (exam.status === 'ARCHIVED') throw ApiError.conflict('Archived exams cannot be assigned');
    const data = { examId, target: input.target, studentId: null as string | null, batchId: null as string | null, courseId: null as string | null, institution: null as string | null, createdById: actor.id };
    if (input.target === 'STUDENT') {
      const s = input.studentId ? await tx.user.findFirst({ where: { id: input.studentId, role: 'STUDENT', deletedAt: null } }) : null;
      if (!s) throw ApiError.validation([{ field: 'studentId', message: 'Choose a student' }]);
      data.studentId = s.id;
    } else if (input.target === 'BATCH') {
      const b = input.batchId ? await tx.batch.findUnique({ where: { id: input.batchId } }) : null;
      if (!b) throw ApiError.validation([{ field: 'batchId', message: 'Choose a batch' }]);
      data.batchId = b.id;
    } else if (input.target === 'PROGRAM') {
      const c = input.courseId ? await tx.course.findUnique({ where: { id: input.courseId } }) : null;
      if (!c) throw ApiError.validation([{ field: 'courseId', message: 'Choose a programme' }]);
      data.courseId = c.id;
    } else {
      const name = input.institution?.trim();
      if (!name || name.length < 2) throw ApiError.validation([{ field: 'institution', message: 'Enter the college name' }]);
      data.institution = name;
    }
    const dup = await tx.examAssignment.findFirst({
      where: {
        examId,
        target: data.target,
        studentId: data.studentId,
        batchId: data.batchId,
        courseId: data.courseId,
        ...(data.institution ? { institution: { equals: data.institution, mode: 'insensitive' } } : { institution: null }),
      },
    });
    if (dup) throw ApiError.conflict('The exam is already assigned to this group');
    const a = await tx.examAssignment.create({ data });
    await audit(tx, actor, { action: 'exam.assigned', entityType: 'Exam', entityId: examId, after: { target: a.target, studentId: a.studentId, batchId: a.batchId, courseId: a.courseId, institution: a.institution } });
    if (exam.status === 'PUBLISHED') await notifyAssigned(tx, exam, await assignedStudentIds(tx, examId, { assignmentId: a.id }), after);
    return a;
  });
  await after.flush();
  return result;
}

export async function removeAssignment(actor: Actor, examId: string, assignmentId: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.examAssignment.findFirst({ where: { id: assignmentId, examId } });
    if (!a) throw ApiError.notFound('Assignment not found');
    await tx.examAssignment.delete({ where: { id: assignmentId } });
    await audit(tx, actor, { action: 'exam.unassigned', entityType: 'Exam', entityId: examId, before: { target: a.target, studentId: a.studentId, batchId: a.batchId, courseId: a.courseId, institution: a.institution } });
    return { id: assignmentId };
  });
}

/** Choices for the assignment form. */
export async function assignmentTargets(search?: string) {
  const [batches, programs, institutions, students] = await Promise.all([
    prisma.batch.findMany({ where: { status: { in: ['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS'] }, deletedAt: null }, orderBy: { startDate: 'desc' }, take: 200, select: { id: true, name: true, course: { select: { title: true } } } }),
    prisma.course.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: [{ programType: 'desc' }, { title: 'asc' }], take: 200, select: { id: true, title: true, programType: true } }),
    prisma.studentProfile.groupBy({ by: ['institution'], where: { institution: { not: null } }, _count: { _all: true }, orderBy: { institution: 'asc' }, take: 300 }),
    search && search.trim().length >= 2
      ? prisma.user.findMany({
          where: { role: 'STUDENT', deletedAt: null, OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] },
          take: 20,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true, studentProfile: { select: { institution: true } } },
        })
      : Promise.resolve([]),
  ]);
  return {
    batches: batches.map((b) => ({ id: b.id, name: b.name, course: b.course.title })),
    programs,
    institutions: institutions.filter((i) => i.institution).map((i) => ({ name: i.institution as string, students: i._count._all })),
    students: students.map((s) => ({ id: s.id, name: s.name, email: s.email, institution: s.studentProfile?.institution ?? null })),
  };
}

// ===========================================================================
// Eligibility (shared by student endpoints)
// ===========================================================================

async function studentScope(studentId: string) {
  const [enrollments, profile] = await Promise.all([
    prisma.enrollment.findMany({ where: { studentId, status: { in: ['ACTIVE', 'COMPLETED'] } }, select: { batchId: true, courseId: true } }),
    prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { institution: true } }),
  ]);
  return { batchIds: enrollments.map((e) => e.batchId), courseIds: [...new Set(enrollments.map((e) => e.courseId))], institution: profile?.institution?.trim() || null };
}

function assignedWhere(studentId: string, scope: Awaited<ReturnType<typeof studentScope>>): Prisma.ExamAssignmentWhereInput {
  return {
    OR: [
      { target: 'STUDENT', studentId },
      ...(scope.batchIds.length ? [{ target: 'BATCH' as const, batchId: { in: scope.batchIds } }] : []),
      ...(scope.courseIds.length ? [{ target: 'PROGRAM' as const, courseId: { in: scope.courseIds } }] : []),
      ...(scope.institution ? [{ target: 'INSTITUTION' as const, institution: { equals: scope.institution, mode: 'insensitive' as const } }] : []),
    ],
  };
}

/** The exam if it is published (or has this student's attempts) and assigned to them; otherwise 404. */
async function examForStudent(studentId: string, examId: string) {
  const scope = await studentScope(studentId);
  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      OR: [
        { status: 'PUBLISHED', assignments: { some: assignedWhere(studentId, scope) } },
        { status: { not: 'DRAFT' }, attempts: { some: { studentId } } },
      ],
    },
  });
  if (!exam) throw ApiError.notFound('Exam not found');
  return exam;
}

const resultVisible = (exam: Pick<Exam, 'resultVisibility' | 'resultsReleasedAt'>, attempt: { status: string }) =>
  attempt.status === 'EVALUATED' && (exam.resultVisibility === 'IMMEDIATE' || Boolean(exam.resultsReleasedAt));

type AttemptRow = Prisma.ExamAttemptGetPayload<object>;

function attemptSummary(exam: Exam, a: AttemptRow) {
  const visible = resultVisible(exam, a);
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    status: a.status,
    autoSubmitted: a.autoSubmitted,
    startedAt: a.startedAt,
    deadlineAt: a.deadlineAt,
    submittedAt: a.submittedAt,
    resultVisible: visible,
    ...(visible ? { score: a.score, maxScore: a.maxScore, percent: percentOf(a.score ?? 0, a.maxScore), passed: a.passed } : {}),
  };
}

async function allowedAttempts(db: Db, exam: Exam, studentId: string) {
  return exam.maxAttempts + (await db.examRetakeGrant.count({ where: { examId: exam.id, studentId } }));
}

function questionCountFor(exam: Exam, linked: number) {
  return exam.questionsPerAttempt ? Math.min(exam.questionsPerAttempt, linked) : linked;
}

async function studentExamView(exam: Exam, studentId: string, detail: boolean) {
  const [attempts, allowed, linked] = await Promise.all([
    prisma.examAttempt.findMany({ where: { examId: exam.id, studentId }, orderBy: { attemptNo: 'asc' } }),
    allowedAttempts(prisma, exam, studentId),
    prisma.examQuestionLink.count({ where: { examId: exam.id } }),
  ]);
  const now = new Date();
  const active = attempts.find((a) => a.status === 'IN_PROGRESS');
  let state: 'UPCOMING' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'NO_ATTEMPTS_LEFT' | 'INTERVIEW';
  let reason: string | null = null;
  if (exam.kind === 'INTERVIEW') {
    state = 'INTERVIEW';
    reason = 'This is an interview stage. The team will contact you with the schedule; the result appears here once recorded.';
  } else if (active) state = 'IN_PROGRESS';
  else if (exam.status !== 'PUBLISHED' || (exam.closesAt && now >= exam.closesAt)) {
    state = 'CLOSED';
    reason = 'This exam is closed.';
  } else if (exam.opensAt && now < exam.opensAt) {
    state = 'UPCOMING';
    reason = 'This exam has not opened yet.';
  } else if (attempts.length >= allowed) {
    state = 'NO_ATTEMPTS_LEFT';
    reason = allowed === 1 ? 'You have used your attempt.' : `You have used all ${allowed} attempts.`;
  } else state = 'OPEN';

  // Total marks only for exams that use every question (a random subset varies per attempt).
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    track: exam.track,
    kind: exam.kind,
    durationMinutes: exam.durationMinutes,
    passPercent: exam.passPercent,
    negativeMarkPercent: exam.negativeMarkPercent,
    opensAt: exam.opensAt,
    closesAt: exam.closesAt,
    eligibilityNote: exam.eligibilityNote,
    questionCount: exam.kind === 'INTERVIEW' ? 0 : questionCountFor(exam, linked),
    attemptsAllowed: allowed,
    attemptsUsed: attempts.length,
    state,
    canStart: state === 'OPEN' || state === 'IN_PROGRESS',
    reason,
    activeAttemptId: active?.id ?? null,
    attempts: attempts.map((a) => attemptSummary(exam, a)),
    ...(detail ? { instructions: exam.instructions, resultVisibility: exam.resultVisibility } : {}),
  };
}

// ===========================================================================
// Student endpoints
// ===========================================================================

export async function studentExams(studentId: string) {
  await finalizeExpired({ studentId });
  const scope = await studentScope(studentId);
  const exams = await prisma.exam.findMany({
    where: {
      OR: [
        { status: 'PUBLISHED', assignments: { some: assignedWhere(studentId, scope) } },
        { status: { not: 'DRAFT' }, attempts: { some: { studentId } } },
      ],
    },
    orderBy: [{ opensAt: 'asc' }, { createdAt: 'desc' }],
  });
  return Promise.all(exams.map((e) => studentExamView(e, studentId, false)));
}

export async function studentExam(studentId: string, examId: string) {
  await finalizeExpired({ studentId, examId });
  const exam = await examForStudent(studentId, examId);
  return studentExamView(exam, studentId, true);
}

export async function startAttempt(actor: Actor, examId: string, meta: { userAgent?: string }) {
  await finalizeExpired({ studentId: actor.id, examId });
  const exam = await examForStudent(actor.id, examId);
  if (exam.kind === 'INTERVIEW') throw ApiError.conflict('Interview-stage exams are not taken online');
  const existing = await prisma.examAttempt.findFirst({ where: { examId, studentId: actor.id, status: 'IN_PROGRESS' } });
  if (existing) return { attemptId: existing.id, resumed: true };
  const now = new Date();
  if (exam.status !== 'PUBLISHED') throw ApiError.conflict('This exam is closed');
  if (exam.opensAt && now < exam.opensAt) throw ApiError.conflict('This exam has not opened yet');
  if (exam.closesAt && now >= exam.closesAt) throw ApiError.conflict('This exam is closed');

  try {
    return await prisma.$transaction(async (tx) => {
      const used = await tx.examAttempt.count({ where: { examId, studentId: actor.id } });
      if (used >= (await allowedAttempts(tx, exam, actor.id))) throw ApiError.conflict('You have no attempts left for this exam');
      const links = await tx.examQuestionLink.findMany({ where: { examId }, orderBy: { position: 'asc' }, include: { question: true } });
      if (!links.length) throw ApiError.conflict('This exam has no questions yet');
      let picked = links;
      if (exam.questionsPerAttempt && exam.questionsPerAttempt < links.length) {
        const chosen = new Set(shuffle(links.map((l) => l.questionId)).slice(0, exam.questionsPerAttempt));
        picked = links.filter((l) => chosen.has(l.questionId));
      }
      if (exam.shuffleQuestions) picked = shuffle(picked);
      const optionOrder: Record<string, string[]> = {};
      for (const { question: q } of picked) {
        const ids = optionsOf(q).map((o) => o.id);
        if (ids.length) optionOrder[q.id] = exam.shuffleOptions && q.type !== 'TRUE_FALSE' ? shuffle(ids) : ids;
      }
      const end = new Date(now.getTime() + exam.durationMinutes * 60_000);
      const deadlineAt = exam.closesAt && exam.closesAt < end ? exam.closesAt : end;
      const attempt = await tx.examAttempt.create({
        data: {
          examId,
          studentId: actor.id,
          attemptNo: used + 1,
          startedAt: now,
          deadlineAt,
          questionIds: picked.map((l) => l.questionId),
          optionOrder,
          maxScore: picked.reduce((s, l) => s + l.question.marks, 0),
          ipHash: actor.ipHash ?? null,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
        },
      });
      await audit(tx, actor, { action: 'exam.attempt_started', entityType: 'ExamAttempt', entityId: attempt.id, after: { examId, attemptNo: attempt.attemptNo, deadlineAt } });
      return { attemptId: attempt.id, resumed: false };
    });
  } catch (err) {
    // Two starts at once: the unique (exam, student, attemptNo) lets only one through; resume it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const a = await prisma.examAttempt.findFirst({ where: { examId, studentId: actor.id, status: 'IN_PROGRESS' } });
      if (a) return { attemptId: a.id, resumed: true };
    }
    throw err;
  }
}

async function ownAttempt(studentId: string, attemptId: string) {
  const a = await prisma.examAttempt.findFirst({ where: { id: attemptId, studentId }, include: { exam: true } });
  if (!a) throw ApiError.notFound('Attempt not found');
  return a;
}

/** Questions as the student sees them: their order, no answer key, no rubric. */
async function studentQuestions(attempt: { questionIds: string[]; optionOrder: Prisma.JsonValue }) {
  const qs = await prisma.examQuestion.findMany({ where: { id: { in: attempt.questionIds } } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  const order = (attempt.optionOrder ?? {}) as Record<string, string[]>;
  return attempt.questionIds.map((id, i) => {
    const q = byId.get(id)!;
    const opts = new Map(optionsOf(q).map((o) => [o.id, o.text]));
    return {
      id: q.id,
      number: i + 1,
      type: q.type,
      topic: q.topic,
      prompt: q.prompt,
      marks: q.marks,
      options: (order[q.id] ?? []).filter((oid) => opts.has(oid)).map((oid) => ({ id: oid, text: opts.get(oid)! })),
    };
  });
}

export async function getStudentAttempt(studentId: string, attemptId: string) {
  let a = await ownAttempt(studentId, attemptId);
  if (a.status === 'IN_PROGRESS' && Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
    await prisma.$transaction((tx) => finalizeAttempt(tx, a.id, { auto: true, at: a.deadlineAt }));
    a = await ownAttempt(studentId, attemptId);
  }
  const answers = await prisma.examAnswer.findMany({ where: { attemptId }, select: { questionId: true, selectedOptionIds: true, text: true, savedAt: true } });
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    status: a.status,
    autoSubmitted: a.autoSubmitted,
    startedAt: a.startedAt,
    deadlineAt: a.deadlineAt,
    submittedAt: a.submittedAt,
    serverNow: new Date(),
    exam: { id: a.exam.id, title: a.exam.title, track: a.exam.track, kind: a.exam.kind, instructions: a.exam.instructions, durationMinutes: a.exam.durationMinutes },
    questions: await studentQuestions(a),
    answers: Object.fromEntries(answers.map((x) => [x.questionId, { selectedOptionIds: x.selectedOptionIds, text: x.text, savedAt: x.savedAt }])),
  };
}

export interface AnswerInput {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string | null;
}

/** Validates answers against the attempt's own questions and option ids. */
async function validateAnswers(tx: Prisma.TransactionClient, attempt: { questionIds: string[] }, answers: AnswerInput[]) {
  const qs = await tx.examQuestion.findMany({ where: { id: { in: answers.map((x) => x.questionId) } } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  const errors: { field: string; message: string }[] = [];
  answers.forEach((ans, i) => {
    const q = byId.get(ans.questionId);
    if (!q || !attempt.questionIds.includes(ans.questionId)) {
      errors.push({ field: `answers.${i}.questionId`, message: 'This question is not part of your attempt' });
      return;
    }
    const sel = [...new Set(ans.selectedOptionIds ?? [])];
    if (q.type === 'DESCRIPTIVE') {
      if (sel.length) errors.push({ field: `answers.${i}.selectedOptionIds`, message: 'This question needs a written answer' });
      if ((ans.text ?? '').length > MAX_TEXT) errors.push({ field: `answers.${i}.text`, message: `Keep your answer under ${MAX_TEXT} characters` });
      return;
    }
    if (ans.text) errors.push({ field: `answers.${i}.text`, message: 'This question needs an option' });
    const valid = new Set(optionsOf(q).map((o) => o.id));
    if (sel.some((id) => !valid.has(id))) errors.push({ field: `answers.${i}.selectedOptionIds`, message: 'Unknown option' });
    if (q.type !== 'MULTI_CHOICE' && sel.length > 1) errors.push({ field: `answers.${i}.selectedOptionIds`, message: 'Choose one option' });
  });
  if (errors.length) throw ApiError.validation(errors);
  return byId;
}

async function writeAnswers(tx: Prisma.TransactionClient, attemptId: string, answers: AnswerInput[], byId: Map<string, ExamQuestion>) {
  for (const ans of answers) {
    const q = byId.get(ans.questionId)!;
    const data = q.type === 'DESCRIPTIVE' ? { selectedOptionIds: [] as string[], text: ans.text?.trim() ? ans.text : null } : { selectedOptionIds: [...new Set(ans.selectedOptionIds ?? [])], text: null };
    await tx.examAnswer.upsert({ where: { attemptId_questionId: { attemptId, questionId: q.id } }, create: { attemptId, questionId: q.id, ...data }, update: data });
  }
}

export async function saveAnswers(studentId: string, attemptId: string, input: { answers: AnswerInput[]; focusLost?: number }) {
  await ownAttempt(studentId, attemptId);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const a = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (a.status !== 'IN_PROGRESS') return { closed: 'submitted' as const };
    if (Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
      await finalizeAttempt(tx, a.id, { auto: true, at: a.deadlineAt });
      return { closed: 'timeup' as const };
    }
    const byId = await validateAnswers(tx, a, input.answers);
    await writeAnswers(tx, attemptId, input.answers, byId);
    if (input.focusLost) await tx.examAttempt.update({ where: { id: attemptId }, data: { focusLossCount: { increment: Math.min(input.focusLost, 50) } } });
    return { savedAt: new Date(), deadlineAt: a.deadlineAt, serverNow: new Date() };
  });
  if ('closed' in outcome) {
    throw ApiError.conflict(outcome.closed === 'timeup' ? 'Time is up. Your attempt was submitted automatically with the answers saved so far.' : 'This attempt has already been submitted');
  }
  return outcome;
}

export async function submitAttempt(studentId: string, attemptId: string, input: { answers?: AnswerInput[] }) {
  await ownAttempt(studentId, attemptId);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const a = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (a.status !== 'IN_PROGRESS') return { duplicate: true as const };
    const late = Date.now() > a.deadlineAt.getTime() + GRACE_MS;
    // Final answers in the submit request count only within the deadline (+ grace).
    if (!late && input.answers?.length) {
      const byId = await validateAnswers(tx, a, input.answers);
      await writeAnswers(tx, attemptId, input.answers, byId);
    }
    await finalizeAttempt(tx, a.id, late ? { auto: true, at: a.deadlineAt } : { auto: false, at: new Date() });
    return { duplicate: false as const };
  });
  if (outcome.duplicate) throw ApiError.conflict('This attempt has already been submitted');
  return getStudentAttemptStatus(studentId, attemptId);
}

async function getStudentAttemptStatus(studentId: string, attemptId: string) {
  const a = await ownAttempt(studentId, attemptId);
  return attemptSummary(a.exam, a);
}

export async function studentAttempts(studentId: string) {
  await finalizeExpired({ studentId });
  const rows = await prisma.examAttempt.findMany({ where: { studentId }, orderBy: { startedAt: 'desc' }, include: { exam: true } });
  return rows.map((a) => ({ ...attemptSummary(a.exam, a), exam: { id: a.exam.id, title: a.exam.title, track: a.exam.track, kind: a.exam.kind } }));
}

/** Result for the student: only when visible; answer key only if the exam reveals answers. */
export async function studentResult(studentId: string, attemptId: string) {
  await finalizeExpired({ studentId });
  const a = await ownAttempt(studentId, attemptId);
  const base = { ...attemptSummary(a.exam, a), exam: { id: a.exam.id, title: a.exam.title, track: a.exam.track, kind: a.exam.kind, passPercent: a.exam.passPercent } };
  if (!base.resultVisible) {
    const message = a.status === 'IN_PROGRESS' ? 'This attempt is still in progress.' : a.status === 'SUBMITTED' ? 'Your answers are being evaluated.' : 'Results for this exam have not been released yet.';
    return { ...base, message, feedback: null, questions: [] };
  }
  const [qs, answers] = await Promise.all([prisma.examQuestion.findMany({ where: { id: { in: a.questionIds } } }), prisma.examAnswer.findMany({ where: { attemptId } })]);
  const qById = new Map(qs.map((q) => [q.id, q]));
  const aById = new Map(answers.map((x) => [x.questionId, x]));
  const reveal = a.exam.revealAnswers;
  return {
    ...base,
    message: null,
    feedback: a.feedback,
    questions: a.questionIds.map((id, i) => {
      const q = qById.get(id)!;
      const ans = aById.get(id);
      const opts = optionsOf(q);
      const text = (ids: string[]) => ids.map((oid) => opts.find((o) => o.id === oid)?.text).filter(Boolean) as string[];
      return {
        number: i + 1,
        prompt: q.prompt,
        type: q.type,
        topic: q.topic,
        marks: q.marks,
        awarded: ans ? (ans.manualMarks ?? ans.autoMarks ?? 0) : 0,
        comment: ans?.evaluatorComment ?? null,
        yourAnswer: q.type === 'DESCRIPTIVE' ? (ans?.text ?? null) : text(ans?.selectedOptionIds ?? []),
        ...(reveal ? { correctAnswer: q.type === 'DESCRIPTIVE' ? null : text(q.correctOptionIds), explanation: q.explanation } : {}),
      };
    }),
  };
}

// ===========================================================================
// Finalisation & scoring
// ===========================================================================

/**
 * Objective scoring. All-or-nothing: the selection must match the key exactly (multi-select included).
 * Unanswered = 0. A wrong answer = 0, or minus negativeMarkPercent % of the marks when negative marking is on.
 */
function autoMark(q: ExamQuestion, selected: string[] | undefined, negativeMarkPercent: number): number | null {
  if (q.type === 'DESCRIPTIVE') return null;
  const sel = new Set(selected ?? []);
  if (sel.size === 0) return 0;
  const key = new Set(q.correctOptionIds);
  if (sel.size === key.size && [...key].every((k) => sel.has(k))) return q.marks;
  return negativeMarkPercent > 0 ? -round2((q.marks * negativeMarkPercent) / 100) : 0;
}

/** Scores objective answers and closes the attempt. Caller holds the transaction. */
async function finalizeAttempt(tx: Prisma.TransactionClient, attemptId: string, opts: { auto: boolean; at: Date }) {
  await lockAttempt(tx, attemptId);
  const a = await tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { exam: true } });
  if (a.status !== 'IN_PROGRESS') return;
  const [qs, answers] = await Promise.all([tx.examQuestion.findMany({ where: { id: { in: a.questionIds } } }), tx.examAnswer.findMany({ where: { attemptId } })]);
  const aById = new Map(answers.map((x) => [x.questionId, x]));
  let objective = 0;
  for (const q of qs) {
    const ans = aById.get(q.id);
    const marks = autoMark(q, ans?.selectedOptionIds, a.exam.negativeMarkPercent);
    if (marks !== null) objective += marks;
    if (ans) await tx.examAnswer.update({ where: { id: ans.id }, data: { autoMarks: marks } });
  }
  const needsManual = qs.some((q) => q.type === 'DESCRIPTIVE');
  objective = Math.max(0, round2(objective)); // the total never goes below zero
  const passed = passes(objective, a.maxScore, a.exam.passPercent);
  await tx.examAttempt.update({
    where: { id: attemptId },
    data: needsManual
      ? { status: 'SUBMITTED', submittedAt: opts.at, autoSubmitted: opts.auto }
      : { status: 'EVALUATED', submittedAt: opts.at, autoSubmitted: opts.auto, score: objective, passed, evaluatedAt: new Date() },
  });
  await audit(tx, null, {
    action: opts.auto ? 'exam.attempt_auto_submitted' : 'exam.attempt_submitted',
    entityType: 'ExamAttempt',
    entityId: attemptId,
    after: { examId: a.examId, studentId: a.studentId, answered: answers.length, needsManualEvaluation: needsManual },
  });
}

/** Auto-submits attempts whose deadline (+ grace) has passed. Safe to call from any read. */
export async function finalizeExpired(where: { studentId?: string; examId?: string }) {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const late = await prisma.examAttempt.findMany({ where: { ...where, status: 'IN_PROGRESS', deadlineAt: { lt: cutoff } }, select: { id: true, deadlineAt: true }, take: 500 });
  for (const a of late) await prisma.$transaction((tx) => finalizeAttempt(tx, a.id, { auto: true, at: a.deadlineAt }));
  return late.length;
}

// ===========================================================================
// Attempts, evaluation, retakes, interviews, reports (staff)
// ===========================================================================

export async function listAttempts(examId: string, q: { status?: 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED'; search?: string; skip: number; take: number }) {
  await loadExam(prisma, examId);
  await finalizeExpired({ examId });
  const where: Prisma.ExamAttemptWhereInput = {
    examId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { student: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.examAttempt.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }],
      skip: q.skip,
      take: q.take,
      include: { student: { select: { id: true, name: true, email: true, studentProfile: { select: { institution: true } } } } },
    }),
    prisma.examAttempt.count({ where }),
  ]);
  return {
    items: rows.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      status: a.status,
      autoSubmitted: a.autoSubmitted,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      score: a.score,
      maxScore: a.maxScore,
      percent: a.score === null ? null : percentOf(a.score, a.maxScore),
      passed: a.passed,
      focusLossCount: a.focusLossCount,
      student: { id: a.student.id, name: a.student.name, email: a.student.email, institution: a.student.studentProfile?.institution ?? null },
    })),
    total,
  };
}

export async function getAttemptForStaff(attemptId: string) {
  const a0 = await prisma.examAttempt.findUnique({ where: { id: attemptId }, select: { examId: true } });
  if (!a0) throw ApiError.notFound('Attempt not found');
  await finalizeExpired({ examId: a0.examId });
  const a = await prisma.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { exam: true, student: { select: { id: true, name: true, email: true, studentProfile: { select: { institution: true } } } }, answers: true },
  });
  const qs = await prisma.examQuestion.findMany({ where: { id: { in: a.questionIds } } });
  const qById = new Map(qs.map((q) => [q.id, q]));
  const aById = new Map(a.answers.map((x) => [x.questionId, x]));
  return {
    id: a.id,
    attemptNo: a.attemptNo,
    status: a.status,
    autoSubmitted: a.autoSubmitted,
    startedAt: a.startedAt,
    deadlineAt: a.deadlineAt,
    submittedAt: a.submittedAt,
    evaluatedAt: a.evaluatedAt,
    score: a.score,
    maxScore: a.maxScore,
    percent: a.score === null ? null : percentOf(a.score, a.maxScore),
    passed: a.passed,
    feedback: a.feedback,
    focusLossCount: a.focusLossCount,
    exam: { id: a.exam.id, title: a.exam.title, track: a.exam.track, kind: a.exam.kind, passPercent: a.exam.passPercent, resultVisibility: a.exam.resultVisibility, resultsReleasedAt: a.exam.resultsReleasedAt },
    student: { id: a.student.id, name: a.student.name, email: a.student.email, institution: a.student.studentProfile?.institution ?? null },
    questions: a.questionIds.map((id, i) => {
      const q = qById.get(id)!;
      const ans = aById.get(id);
      return {
        id: q.id,
        number: i + 1,
        type: q.type,
        topic: q.topic,
        prompt: q.prompt,
        marks: q.marks,
        options: optionsOf(q),
        correctOptionIds: q.correctOptionIds,
        guidance: q.guidance,
        selectedOptionIds: ans?.selectedOptionIds ?? [],
        text: ans?.text ?? null,
        autoMarks: ans?.autoMarks ?? null,
        manualMarks: ans?.manualMarks ?? null,
        evaluatorComment: ans?.evaluatorComment ?? null,
      };
    }),
  };
}

export async function evaluateAttempt(actor: Actor, attemptId: string, input: { marks: { questionId: string; marks: number; comment?: string | null }[]; feedback?: string | null }) {
  const after = new AfterCommit();
  await prisma.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId);
    const a = await tx.examAttempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
    if (!a) throw ApiError.notFound('Attempt not found');
    if (a.status === 'IN_PROGRESS') throw ApiError.conflict('The student has not submitted this attempt yet');
    const qs = await tx.examQuestion.findMany({ where: { id: { in: a.questionIds } } });
    const qById = new Map(qs.map((q) => [q.id, q]));
    const errors: { field: string; message: string }[] = [];
    input.marks.forEach((m, i) => {
      const q = qById.get(m.questionId);
      if (!q) errors.push({ field: `marks.${i}.questionId`, message: 'Not a question in this attempt' });
      else if (m.marks > q.marks) errors.push({ field: `marks.${i}.marks`, message: `At most ${q.marks} marks` });
    });
    if (errors.length) throw ApiError.validation(errors);
    for (const m of input.marks) {
      await tx.examAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: m.questionId } },
        create: { attemptId, questionId: m.questionId, selectedOptionIds: [], text: null, manualMarks: m.marks, evaluatorComment: m.comment ?? null },
        update: { manualMarks: m.marks, evaluatorComment: m.comment ?? null },
      });
    }
    const answers = await tx.examAnswer.findMany({ where: { attemptId } });
    const aById = new Map(answers.map((x) => [x.questionId, x]));
    const missing = qs.filter((q) => q.type === 'DESCRIPTIVE' && aById.get(q.id)?.manualMarks == null);
    if (missing.length) throw ApiError.validation(missing.map((q) => ({ field: `marks.${q.id}`, message: 'Mark every written answer' })), 'Some written answers are not marked yet');
    const score = Math.max(
      0,
      round2(
        qs.reduce((s, q) => {
          const x = aById.get(q.id);
          return s + (x ? (x.manualMarks ?? x.autoMarks ?? 0) : 0);
        }, 0),
      ),
    );
    const passed = passes(score, a.maxScore, a.exam.passPercent);
    await tx.examAttempt.update({ where: { id: attemptId }, data: { status: 'EVALUATED', score, passed, feedback: input.feedback ?? a.feedback, evaluatedAt: new Date(), evaluatedById: actor.id } });
    await audit(tx, actor, { action: 'exam.attempt_evaluated', entityType: 'ExamAttempt', entityId: attemptId, before: { status: a.status, score: a.score, passed: a.passed }, after: { score, passed } });
    if (resultVisible(a.exam, { status: 'EVALUATED' })) {
      await notify(tx, a.studentId, { type: 'EXAM_RESULT', title: `Result available: ${a.exam.title}`, body: 'Your exam result is ready.', link: `${env.internPortalUrl}/exams/attempts/${a.id}` }, after);
    }
  });
  await after.flush();
  return getAttemptForStaff(attemptId);
}

async function assertAssigned(db: Db, examId: string, studentId: string) {
  const student = await db.user.findFirst({ where: { id: studentId, role: 'STUDENT', deletedAt: null } });
  if (!student) throw ApiError.validation([{ field: 'studentId', message: 'Choose a student' }]);
  const scope = await studentScope(studentId);
  const assigned = await db.examAssignment.count({ where: { examId, ...assignedWhere(studentId, scope) } });
  if (!assigned) throw ApiError.validation([{ field: 'studentId', message: 'This exam is not assigned to that student' }]);
}

export async function grantRetake(actor: Actor, examId: string, input: { studentId: string; reason: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, examId);
    if (exam.status !== 'PUBLISHED') throw ApiError.conflict('Retakes can only be granted for a published exam');
    await assertAssigned(tx, examId, input.studentId);
    const g = await tx.examRetakeGrant.create({ data: { examId, studentId: input.studentId, grantedById: actor.id, reason: input.reason } });
    await audit(tx, actor, { action: 'exam.retake_granted', entityType: 'Exam', entityId: examId, after: { studentId: input.studentId }, reason: input.reason });
    await notify(tx, input.studentId, { type: 'EXAM', title: `Retake allowed: ${exam.title}`, body: 'You can take this exam one more time.', link: `${env.internPortalUrl}/exams/${examId}` }, after);
    return g;
  });
  await after.flush();
  return result;
}

export async function recordInterviewResult(actor: Actor, examId: string, input: { studentId: string; score: number; feedback?: string | null }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const exam = await loadExam(tx, examId);
    if (exam.kind !== 'INTERVIEW') throw ApiError.conflict('Only interview-stage exams take recorded results');
    if (exam.status !== 'PUBLISHED') throw ApiError.conflict('Publish the exam first');
    const max = exam.interviewMaxMarks ?? 0;
    if (input.score > max) throw ApiError.validation([{ field: 'score', message: `At most ${max} marks` }]);
    await assertAssigned(tx, examId, input.studentId);
    const used = await tx.examAttempt.count({ where: { examId, studentId: input.studentId } });
    if (used >= (await allowedAttempts(tx, exam, input.studentId))) throw ApiError.conflict('A result is already recorded for this student (grant a retake to record another)');
    const now = new Date();
    const a = await tx.examAttempt.create({
      data: {
        examId,
        studentId: input.studentId,
        attemptNo: used + 1,
        status: 'EVALUATED',
        startedAt: now,
        deadlineAt: now,
        submittedAt: now,
        evaluatedAt: now,
        evaluatedById: actor.id,
        questionIds: [],
        optionOrder: {},
        maxScore: max,
        score: input.score,
        passed: passes(input.score, max, exam.passPercent),
        feedback: input.feedback ?? null,
      },
    });
    await audit(tx, actor, { action: 'exam.interview_recorded', entityType: 'ExamAttempt', entityId: a.id, after: { examId, studentId: input.studentId, score: input.score, passed: a.passed } });
    if (resultVisible(exam, a)) {
      await notify(tx, input.studentId, { type: 'EXAM_RESULT', title: `Result available: ${exam.title}`, body: 'Your interview result is ready.', link: `${env.internPortalUrl}/exams/attempts/${a.id}` }, after);
    }
    return a;
  });
  await after.flush();
  return result;
}

/** Summary statistics for one exam (finalised attempts only). */
export async function examReport(examId: string) {
  const exam = await loadExam(prisma, examId);
  await finalizeExpired({ examId });
  const attempts = await prisma.examAttempt.findMany({ where: { examId, status: { not: 'IN_PROGRESS' } }, include: { answers: true } });
  const evaluated = attempts.filter((a) => a.status === 'EVALUATED' && a.score !== null);
  const pcts = evaluated.map((a) => percentOf(a.score!, a.maxScore));
  const qIds = [...new Set(attempts.flatMap((a) => a.questionIds))];
  const qs = await prisma.examQuestion.findMany({ where: { id: { in: qIds } } });
  const perQuestion = qs.map((q) => {
    const shown = attempts.filter((a) => a.questionIds.includes(q.id));
    const scored = shown.map((a) => {
      const ans = a.answers.find((x) => x.questionId === q.id);
      return ans ? (ans.manualMarks ?? ans.autoMarks) : 0;
    });
    const marked = scored.filter((m): m is number => m !== null && m !== undefined);
    return {
      questionId: q.id,
      prompt: q.prompt,
      topic: q.topic,
      type: q.type,
      marks: q.marks,
      shown: shown.length,
      averagePercent: marked.length && q.marks ? Math.round((marked.reduce((s, m) => s + m, 0) * 1000) / (marked.length * q.marks)) / 10 : null,
    };
  });
  const topics = new Map<string, { got: number; max: number }>();
  for (const pq of perQuestion) {
    if (pq.averagePercent === null) continue;
    const t = topics.get(pq.topic) ?? { got: 0, max: 0 };
    t.got += (pq.averagePercent / 100) * pq.marks * pq.shown;
    t.max += pq.marks * pq.shown;
    topics.set(pq.topic, t);
  }
  const students = new Set(attempts.map((a) => a.studentId)).size;
  return {
    exam: { id: exam.id, title: exam.title, track: exam.track, kind: exam.kind, passPercent: exam.passPercent },
    students,
    attempts: attempts.length,
    evaluated: evaluated.length,
    pendingEvaluation: attempts.filter((a) => a.status === 'SUBMITTED').length,
    autoSubmitted: attempts.filter((a) => a.autoSubmitted).length,
    passed: evaluated.filter((a) => a.passed).length,
    failed: evaluated.filter((a) => a.passed === false).length,
    averagePercent: pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : null,
    highestPercent: pcts.length ? Math.max(...pcts) : null,
    lowestPercent: pcts.length ? Math.min(...pcts) : null,
    byTopic: [...topics.entries()].map(([topic, t]) => ({ topic, averagePercent: t.max ? Math.round((t.got * 1000) / t.max) / 10 : null })),
    byQuestion: perQuestion,
  };
}

/** Rows for a CSV export. Exports are audit events (never the data itself). */
export async function exportResults(actor: Actor, examId: string) {
  const exam = await loadExam(prisma, examId);
  await finalizeExpired({ examId });
  const rows = await prisma.examAttempt.findMany({
    where: { examId },
    orderBy: [{ studentId: 'asc' }, { attemptNo: 'asc' }],
    take: 5000,
    include: { student: { select: { name: true, email: true, studentProfile: { select: { institution: true } } } } },
  });
  await audit(prisma, actor, { action: 'report.exported', entityType: 'Report', entityId: `exam-results:${examId}`, after: { rows: rows.length } });
  return {
    exam: { id: exam.id, title: exam.title },
    rows: rows.map((a) => ({
      student: a.student.name,
      email: a.student.email,
      college: a.student.studentProfile?.institution ?? '',
      attempt: a.attemptNo,
      status: a.status,
      autoSubmitted: a.autoSubmitted ? 'yes' : 'no',
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? '',
      score: a.score ?? '',
      maxScore: a.maxScore,
      percent: a.score === null ? '' : percentOf(a.score, a.maxScore),
      result: a.passed === null ? '' : a.passed ? 'PASS' : 'FAIL',
      focusLosses: a.focusLossCount,
    })),
  };
}

/** Every exam attempt of one student (staff view, all scores). */
export async function studentPerformance(studentId: string) {
  const student = await prisma.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true, name: true, email: true, studentProfile: { select: { institution: true } } } });
  if (!student) throw ApiError.notFound('Student not found');
  await finalizeExpired({ studentId });
  const attempts = await prisma.examAttempt.findMany({ where: { studentId }, orderBy: { startedAt: 'desc' }, include: { exam: { select: { id: true, title: true, track: true, kind: true, passPercent: true } } } });
  const evaluated = attempts.filter((a) => a.status === 'EVALUATED' && a.score !== null);
  return {
    student: { id: student.id, name: student.name, email: student.email, institution: student.studentProfile?.institution ?? null },
    summary: {
      attempts: attempts.length,
      evaluated: evaluated.length,
      passed: evaluated.filter((a) => a.passed).length,
      averagePercent: evaluated.length ? Math.round((evaluated.reduce((s, a) => s + percentOf(a.score!, a.maxScore), 0) / evaluated.length) * 10) / 10 : null,
    },
    attempts: attempts.map((a) => ({
      id: a.id,
      exam: a.exam,
      attemptNo: a.attemptNo,
      status: a.status,
      autoSubmitted: a.autoSubmitted,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      score: a.score,
      maxScore: a.maxScore,
      percent: a.score === null ? null : percentOf(a.score, a.maxScore),
      passed: a.passed,
    })),
  };
}
