import { Prisma, type Batch, type BatchStatus, type Course, type CourseStatus } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { AfterCommit, notify } from './notification.service';
import { env } from '../config/env';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Courses, syllabus modules, batches, schedules and trainer assignments.
 *
 * Seat accounting: a seat is taken by every ACTIVE/COMPLETED enrollment and by
 * every APPROVED application that is still waiting for payment. Approval
 * therefore reserves the seat, and a verified payment can always be honoured.
 */

// ---------------------------------------------------------------------------
// Fees & seats
// ---------------------------------------------------------------------------

export function feeFor(course: Pick<Course, 'feePaise' | 'discountPaise'>, batch: Pick<Batch, 'feePaise'>) {
  const feePaise = batch.feePaise ?? course.feePaise;
  const discountPaise = Math.min(Math.max(course.discountPaise, 0), feePaise);
  return { feePaise, discountPaise, payablePaise: feePaise - discountPaise };
}

export async function seatsTaken(db: Db, batchId: string): Promise<number> {
  const [enrolled, reserved] = await Promise.all([
    db.enrollment.count({ where: { batchId, status: { in: ['ACTIVE', 'COMPLETED'] } } }),
    db.admissionApplication.count({ where: { batchId, status: 'APPROVED' } }),
  ]);
  return enrolled + reserved;
}

/** Locks the batch row for the rest of the transaction (serialises seat decisions). */
export async function lockBatch(tx: Prisma.TransactionClient, batchId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "batches" WHERE id = ${batchId} FOR UPDATE`;
}

export type AdmissionBlock = 'NOT_OPEN' | 'DEADLINE_PASSED' | 'FULL' | 'COURSE_UNAVAILABLE' | null;

export function admissionBlock(
  course: Pick<Course, 'status' | 'deletedAt'>,
  batch: Pick<Batch, 'status' | 'registrationDeadline' | 'deletedAt'>,
  availableSeats: number,
  now = new Date(),
): AdmissionBlock {
  if (course.status !== 'PUBLISHED' || course.deletedAt || batch.deletedAt) return 'COURSE_UNAVAILABLE';
  if (batch.status !== 'OPEN') return batch.status === 'FULL' ? 'FULL' : 'NOT_OPEN';
  if (batch.registrationDeadline.getTime() < now.getTime()) return 'DEADLINE_PASSED';
  if (availableSeats <= 0) return 'FULL';
  return null;
}

export const ADMISSION_BLOCK_MESSAGE: Record<Exclude<AdmissionBlock, null>, string> = {
  NOT_OPEN: 'Admissions are not open for this batch.',
  DEADLINE_PASSED: 'The registration deadline for this batch has passed.',
  FULL: 'This batch is full.',
  COURSE_UNAVAILABLE: 'This course is not available for admission.',
};

/** Public status: an OPEN batch with no seats left is shown as FULL. */
function effectiveStatus(status: BatchStatus, availableSeats: number): BatchStatus {
  return status === 'OPEN' && availableSeats <= 0 ? 'FULL' : status;
}

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------

const publicCourseWhere: Prisma.CourseWhereInput = { status: 'PUBLISHED', deletedAt: null };
const publicBatchWhere: Prisma.BatchWhereInput = { deletedAt: null, status: { not: 'CANCELLED' } };

function publicTrainers(trainers: { role: string; trainer: { name: string } }[]) {
  return trainers.map((t) => ({ name: t.trainer.name, role: t.role }));
}

async function presentBatch(
  b: Batch & { trainers?: { role: string; removedAt: Date | null; trainer: { name: string } }[]; schedules?: unknown[] },
  course: Course,
) {
  const taken = await seatsTaken(prisma, b.id);
  const availableSeats = Math.max(0, b.capacity - taken);
  const block = admissionBlock(course, b, availableSeats);
  return {
    id: b.id,
    courseId: b.courseId,
    name: b.name,
    startDate: b.startDate,
    endDate: b.endDate,
    registrationDeadline: b.registrationDeadline,
    mode: b.mode,
    venue: b.venue,
    capacity: b.capacity,
    availableSeats,
    status: effectiveStatus(b.status, availableSeats),
    admissionOpen: block === null,
    admissionBlockedReason: block ? ADMISSION_BLOCK_MESSAGE[block] : null,
    fee: feeFor(course, b),
    schedules: b.schedules ?? [],
    trainers: b.trainers ? publicTrainers(b.trainers.filter((t) => !t.removedAt)) : [],
  };
}

function presentCourseSummary(c: Course & { batches?: Batch[] }) {
  const { deletedAt: _d, order: _o, ...rest } = c;
  const fee = feeFor(c, { feePaise: null });
  return { ...rest, fee, openBatchCount: c.batches?.filter((b) => b.status === 'OPEN').length ?? 0 };
}

export interface PublicCourseQuery {
  search?: string;
  category?: string;
  mode?: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  programType?: 'TRAINING' | 'INTERNSHIP';
  skip: number;
  take: number;
}

export async function listPublicCourses(q: PublicCourseQuery) {
  const where: Prisma.CourseWhereInput = {
    ...publicCourseWhere,
    ...(q.category ? { category: q.category } : {}),
    ...(q.mode ? { mode: q.mode } : {}),
    ...(q.level ? { level: q.level } : {}),
    ...(q.programType ? { programType: q.programType } : {}),
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search, mode: 'insensitive' } },
            { shortDescription: { contains: q.search, mode: 'insensitive' } },
            { category: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total, categories] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      skip: q.skip,
      take: q.take,
      include: { batches: { where: { ...publicBatchWhere, status: 'OPEN' } } },
    }),
    prisma.course.count({ where }),
    prisma.course.findMany({ where: publicCourseWhere, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
  ]);
  return { items: items.map(presentCourseSummary), total, categories: categories.map((c) => c.category) };
}

export async function getPublicCourse(slug: string) {
  const course = await prisma.course.findFirst({
    where: { slug, ...publicCourseWhere },
    include: {
      modules: { orderBy: { order: 'asc' } },
      batches: {
        where: { ...publicBatchWhere, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
        orderBy: { startDate: 'asc' },
        include: { schedules: { orderBy: { dayOfWeek: 'asc' } }, trainers: { include: { trainer: { select: { name: true } } } } },
      },
    },
  });
  if (!course) throw ApiError.notFound('Course not found');
  const batches = await Promise.all(course.batches.map((b) => presentBatch(b, course)));
  return { ...presentCourseSummary(course), modules: course.modules, batches };
}

export async function listPublicBatches(q: { courseId?: string; mode?: string; status?: BatchStatus; skip: number; take: number }) {
  const where: Prisma.BatchWhereInput = {
    ...publicBatchWhere,
    status: q.status ? q.status : { notIn: ['CANCELLED', 'COMPLETED'] },
    course: publicCourseWhere,
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.mode ? { mode: q.mode as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      orderBy: { startDate: 'asc' },
      skip: q.skip,
      take: q.take,
      include: {
        course: true,
        schedules: { orderBy: { dayOfWeek: 'asc' } },
        trainers: { include: { trainer: { select: { name: true } } } },
      },
    }),
    prisma.batch.count({ where }),
  ]);
  const items = await Promise.all(
    rows.map(async (b) => ({
      ...(await presentBatch(b, b.course)),
      course: { id: b.course.id, slug: b.course.slug, title: b.course.title, category: b.course.category, level: b.course.level },
    })),
  );
  return { items, total };
}

export async function getPublicBatch(id: string) {
  const b = await prisma.batch.findFirst({
    where: { id, ...publicBatchWhere, course: publicCourseWhere },
    include: {
      course: true,
      schedules: { orderBy: { dayOfWeek: 'asc' } },
      trainers: { include: { trainer: { select: { name: true } } } },
    },
  });
  if (!b) throw ApiError.notFound('Batch not found');
  return {
    ...(await presentBatch(b, b.course)),
    course: { id: b.course.id, slug: b.course.slug, title: b.course.title, category: b.course.category, level: b.course.level, eligibility: b.course.eligibility },
  };
}

// ---------------------------------------------------------------------------
// Admin: courses
// ---------------------------------------------------------------------------

export interface CourseInput {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  programType: 'TRAINING' | 'INTERNSHIP';
  durationLabel: string;
  durationWeeks?: number | null;
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  skills: string[];
  eligibility: string;
  feePaise: number;
  discountPaise: number;
  discountLabel?: string | null;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  minAttendancePercent: number;
  order: number;
}

export async function adminListCourses(q: { search?: string; status?: CourseStatus; sort?: string; skip: number; take: number }) {
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      orderBy: orderByFrom<Prisma.CourseOrderByWithRelationInput[]>(q.sort, { title: (d) => [{ title: d }], createdAt: (d) => [{ createdAt: d }], feePaise: (d) => [{ feePaise: d }], status: (d) => [{ status: d }] }, [{ order: 'asc' }, { createdAt: 'desc' }]),
      skip: q.skip,
      take: q.take,
      include: { _count: { select: { batches: true, enrollments: true, applications: true } } },
    }),
    prisma.course.count({ where }),
  ]);
  return { items, total };
}

export async function adminGetCourse(id: string) {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: { modules: { orderBy: { order: 'asc' } }, batches: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } } },
  });
  if (!course) throw ApiError.notFound('Course not found');
  return course;
}

function assertDiscount(fee: number, discount: number) {
  if (discount > fee) throw ApiError.validation([{ field: 'discountPaise', message: 'Discount cannot exceed the fee' }]);
}

export async function createCourse(actor: Actor, input: CourseInput) {
  assertDiscount(input.feePaise, input.discountPaise);
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.create({ data: { ...input, status: 'DRAFT' } });
    await audit(tx, actor, { action: 'course.created', entityType: 'Course', entityId: course.id, after: { slug: course.slug, feePaise: course.feePaise } });
    return course;
  });
}

export async function updateCourse(actor: Actor, id: string, input: Partial<CourseInput>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.course.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw ApiError.notFound('Course not found');
    assertDiscount(input.feePaise ?? before.feePaise, input.discountPaise ?? before.discountPaise);
    const after = await tx.course.update({ where: { id }, data: input });
    const changed = Object.keys(input).filter((k) => JSON.stringify((before as never)[k]) !== JSON.stringify((after as never)[k]));
    await audit(tx, actor, {
      action: 'course.updated',
      entityType: 'Course',
      entityId: id,
      before: Object.fromEntries(changed.map((k) => [k, (before as never)[k]])),
      after: Object.fromEntries(changed.map((k) => [k, (after as never)[k]])),
    });
    return after;
  });
}

export async function setCourseStatus(actor: Actor, id: string, status: CourseStatus) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.course.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw ApiError.notFound('Course not found');
    if (status === 'PUBLISHED') {
      const modules = await tx.courseModule.count({ where: { courseId: id } });
      if (!modules) throw ApiError.conflict('Add at least one syllabus module before publishing');
    }
    const after = await tx.course.update({ where: { id }, data: { status } });
    await audit(tx, actor, { action: 'course.status_changed', entityType: 'Course', entityId: id, before: { status: before.status }, after: { status } });
    return after;
  });
}

export interface ModuleInput {
  title: string;
  description?: string | null;
  topics: string[];
  durationHours?: number | null;
}

/** Replaces the whole syllabus in one transaction (order = array position). */
export async function setCourseModules(actor: Actor, courseId: string, modules: ModuleInput[]) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: courseId, deletedAt: null } });
    if (!course) throw ApiError.notFound('Course not found');
    await tx.courseModule.deleteMany({ where: { courseId } });
    await tx.courseModule.createMany({
      data: modules.map((m, i) => ({ courseId, title: m.title, description: m.description ?? null, topics: m.topics, durationHours: m.durationHours ?? null, order: i })),
    });
    await audit(tx, actor, { action: 'course.syllabus_updated', entityType: 'Course', entityId: courseId, after: { modules: modules.length } });
    return tx.courseModule.findMany({ where: { courseId }, orderBy: { order: 'asc' } });
  });
}

// ---------------------------------------------------------------------------
// Admin: batches
// ---------------------------------------------------------------------------

export interface BatchInput {
  courseId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  registrationDeadline: Date;
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  venue?: string | null;
  capacity: number;
  feePaise?: number | null;
}

function assertBatchDates(b: Pick<BatchInput, 'startDate' | 'endDate' | 'registrationDeadline'>) {
  if (b.endDate.getTime() < b.startDate.getTime()) {
    throw ApiError.validation([{ field: 'endDate', message: 'End date must be after the start date' }]);
  }
  if (b.registrationDeadline.getTime() > b.endDate.getTime()) {
    throw ApiError.validation([{ field: 'registrationDeadline', message: 'Registration must close before the batch ends' }]);
  }
}

export async function adminListBatches(q: { courseId?: string; status?: BatchStatus; search?: string; sort?: string; skip: number; take: number }) {
  const where: Prisma.BatchWhereInput = {
    deletedAt: null,
    ...(q.courseId ? { courseId: q.courseId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      orderBy: orderByFrom<Prisma.BatchOrderByWithRelationInput>(q.sort, { startDate: (d) => ({ startDate: d }), name: (d) => ({ name: d }), capacity: (d) => ({ capacity: d }), status: (d) => ({ status: d }) }, { startDate: 'desc' }),
      skip: q.skip,
      take: q.take,
      include: {
        course: { select: { id: true, title: true, slug: true } },
        trainers: { where: { removedAt: null }, include: { trainer: { select: { id: true, name: true, email: true } } } },
        _count: { select: { enrollments: true, applications: true } },
      },
    }),
    prisma.batch.count({ where }),
  ]);
  const items = await Promise.all(rows.map(async (b) => ({ ...b, seatsTaken: await seatsTaken(prisma, b.id) })));
  return { items, total };
}

export async function adminGetBatch(id: string) {
  const b = await prisma.batch.findFirst({
    where: { id, deletedAt: null },
    include: {
      course: true,
      schedules: { orderBy: { dayOfWeek: 'asc' } },
      trainers: { include: { trainer: { select: { id: true, name: true, email: true } } } },
      enrollments: {
        orderBy: { enrolledAt: 'asc' },
        include: { student: { select: { id: true, name: true, email: true, phone: true, status: true } } },
      },
      _count: { select: { applications: true } },
    },
  });
  if (!b) throw ApiError.notFound('Batch not found');
  return { ...b, seatsTaken: await seatsTaken(prisma, id), fee: feeFor(b.course, b) };
}

export async function createBatch(actor: Actor, input: BatchInput) {
  assertBatchDates(input);
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: input.courseId, deletedAt: null } });
    if (!course) throw ApiError.validation([{ field: 'courseId', message: 'Course not found' }]);
    if (course.status === 'ARCHIVED') throw ApiError.conflict('Cannot add batches to an archived course');
    const batch = await tx.batch.create({ data: { ...input, status: 'UPCOMING' } });
    await audit(tx, actor, { action: 'batch.created', entityType: 'Batch', entityId: batch.id, after: { courseId: batch.courseId, name: batch.name, capacity: batch.capacity } });
    return batch;
  });
}

export async function updateBatch(actor: Actor, id: string, input: Partial<Omit<BatchInput, 'courseId'>>) {
  return prisma.$transaction(async (tx) => {
    await lockBatch(tx, id);
    const before = await tx.batch.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw ApiError.notFound('Batch not found');
    assertBatchDates({
      startDate: input.startDate ?? before.startDate,
      endDate: input.endDate ?? before.endDate,
      registrationDeadline: input.registrationDeadline ?? before.registrationDeadline,
    });
    if (input.capacity !== undefined) {
      const taken = await seatsTaken(tx, id);
      if (input.capacity < taken) {
        throw ApiError.validation([{ field: 'capacity', message: `Capacity cannot be lower than the ${taken} seats already taken` }]);
      }
    }
    const after = await tx.batch.update({ where: { id }, data: input });
    await audit(tx, actor, {
      action: 'batch.updated',
      entityType: 'Batch',
      entityId: id,
      before: Object.fromEntries(Object.keys(input).map((k) => [k, (before as never)[k]])),
      after: input,
    });
    return after;
  });
}

const BATCH_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  UPCOMING: ['OPEN', 'CANCELLED', 'IN_PROGRESS'],
  OPEN: ['UPCOMING', 'FULL', 'IN_PROGRESS', 'CANCELLED'],
  FULL: ['OPEN', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export async function setBatchStatus(actor: Actor, id: string, status: BatchStatus, reason?: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    await lockBatch(tx, id);
    const before = await tx.batch.findFirst({ where: { id, deletedAt: null }, include: { course: true } });
    if (!before) throw ApiError.notFound('Batch not found');
    if (!BATCH_TRANSITIONS[before.status].includes(status)) {
      throw ApiError.conflict(`A ${before.status} batch cannot be moved to ${status}`);
    }
    if (status === 'OPEN' && before.course.status !== 'PUBLISHED') throw ApiError.conflict('Publish the course before opening admissions');
    if (status === 'CANCELLED' && !reason?.trim()) {
      throw ApiError.validation([{ field: 'reason', message: 'A cancellation reason is required' }]);
    }
    const updated = await tx.batch.update({ where: { id }, data: { status } });
    if (status === 'CANCELLED') {
      // Tell everyone with an open application or enrollment; refunds are handled by finance.
      const affected = await tx.admissionApplication.findMany({
        where: { batchId: id, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ENROLLED'] } },
        select: { studentId: true },
      });
      await tx.payment.updateMany({ where: { application: { batchId: id }, status: { in: ['CREATED', 'FAILED'] } }, data: { status: 'CANCELLED' } });
      for (const a of affected) {
        await notify(
          tx,
          a.studentId,
          {
            type: 'BATCH_CANCELLED',
            title: 'Batch cancelled',
            body: `The batch "${before.name}" of ${before.course.title} has been cancelled. Our admissions team will contact you about the next steps and any refund due.`,
            link: `${env.internPortalUrl}/applications`,
            email: true,
          },
          after,
        );
      }
    }
    await audit(tx, actor, { action: 'batch.status_changed', entityType: 'Batch', entityId: id, before: { status: before.status }, after: { status }, reason: reason ?? null });
    return updated;
  });
  await after.flush();
  return result;
}

export interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  topic?: string | null;
  location?: string | null;
}

export async function setBatchSchedules(actor: Actor, batchId: string, schedules: ScheduleInput[]) {
  for (const s of schedules) {
    if (s.endTime <= s.startTime) throw ApiError.validation([{ field: 'schedules', message: 'Each class must end after it starts' }]);
  }
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!batch) throw ApiError.notFound('Batch not found');
    await tx.batchSchedule.deleteMany({ where: { batchId } });
    await tx.batchSchedule.createMany({ data: schedules.map((s) => ({ ...s, batchId })) });
    await audit(tx, actor, { action: 'batch.schedule_updated', entityType: 'Batch', entityId: batchId, after: { slots: schedules.length } });
    return tx.batchSchedule.findMany({ where: { batchId }, orderBy: { dayOfWeek: 'asc' } });
  });
}

export async function assignTrainer(actor: Actor, batchId: string, trainerId: string, role: 'LEAD' | 'ASSISTANT') {
  return prisma.$transaction(async (tx) => {
    const [batch, trainer] = await Promise.all([
      tx.batch.findFirst({ where: { id: batchId, deletedAt: null } }),
      tx.user.findUnique({ where: { id: trainerId }, select: { id: true, role: true, status: true } }),
    ]);
    if (!batch) throw ApiError.notFound('Batch not found');
    if (!trainer || trainer.role !== 'TRAINER' || trainer.status !== 'ACTIVE') {
      throw ApiError.validation([{ field: 'trainerId', message: 'Choose an active trainer account' }]);
    }
    const assignment = await tx.trainerAssignment.upsert({
      where: { batchId_trainerId: { batchId, trainerId } },
      update: { role, removedAt: null, assignedAt: new Date() },
      create: { batchId, trainerId, role },
    });
    await audit(tx, actor, { action: 'batch.trainer_assigned', entityType: 'Batch', entityId: batchId, after: { trainerId, role } });
    return assignment;
  });
}

export async function removeTrainer(actor: Actor, batchId: string, trainerId: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.trainerAssignment.updateMany({ where: { batchId, trainerId, removedAt: null }, data: { removedAt: new Date() } });
    if (!res.count) throw ApiError.notFound('Trainer is not assigned to this batch');
    await audit(tx, actor, { action: 'batch.trainer_removed', entityType: 'Batch', entityId: batchId, after: { trainerId } });
    return { removed: true };
  });
}

/** Trainers with their active assignments and workload (active batches / active students). */
export async function listTrainers() {
  const trainers = await prisma.user.findMany({
    where: { role: 'TRAINER', deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      trainerAssignments: {
        where: { removedAt: null },
        select: { role: true, batch: { select: { id: true, name: true, status: true, course: { select: { title: true } }, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } } } },
      },
    },
  });
  return trainers.map((t) => {
    const active = t.trainerAssignments.filter((a) => ['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS'].includes(a.batch.status));
    return { ...t, workload: { activeBatches: active.length, activeStudents: active.reduce((n, a) => n + a.batch._count.enrollments, 0) } };
  });
}
