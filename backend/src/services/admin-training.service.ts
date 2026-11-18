import { Prisma } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { attendancePercent, enrollmentProgress } from './learning.service';

/** Admin views of students plus the training dashboard and audit trail. */

export async function trainingDashboard() {
  const [courses, batches, applications, enrollments, payments, pendingPayments, openSupport, openFraud] = await Promise.all([
    prisma.course.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    prisma.batch.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    prisma.admissionApplication.groupBy({ by: ['status'], _count: true }),
    prisma.enrollment.groupBy({ by: ['status'], _count: true }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountPaise: true }, _count: true }),
    prisma.admissionApplication.count({ where: { status: 'APPROVED', payablePaise: { gt: 0 } } }),
    prisma.supportRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.fraudReview.count({ where: { status: 'OPEN' } }),
  ]);
  const toMap = (rows: { _count: number }[], key: string) => Object.fromEntries(rows.map((r) => [(r as never)[key], r._count]));
  return {
    courses: toMap(courses, 'status'),
    batches: toMap(batches, 'status'),
    applications: toMap(applications, 'status'),
    enrollments: toMap(enrollments, 'status'),
    revenue: { paidCount: payments._count, paidAmountPaise: payments._sum.amountPaise ?? 0 },
    pendingPayments,
    openSupport,
    openFraudReviews: openFraud,
  };
}

export async function listStudents(q: { search?: string; status?: 'ACTIVE' | 'SUSPENDED'; sort?: string; skip: number; take: number }) {
  const where: Prisma.UserWhereInput = {
    role: 'STUDENT',
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search.replace(/\D/g, '') || q.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: orderByFrom<Prisma.UserOrderByWithRelationInput>(q.sort, { createdAt: (d) => ({ createdAt: d }), name: (d) => ({ name: d }), email: (d) => ({ email: d }), lastLoginAt: (d) => ({ lastLoginAt: d }) }, { createdAt: 'desc' }),
      skip: q.skip,
      take: q.take,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        studentProfile: { select: { city: true } },
        _count: { select: { enrollments: true, applications: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function getStudent(id: string) {
  const student = await prisma.user.findFirst({
    where: { id, role: 'STUDENT' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      studentProfile: true,
      applications: { orderBy: { createdAt: 'desc' }, include: { course: { select: { title: true } }, batch: { select: { name: true } } } },
      enrollments: {
        orderBy: { enrolledAt: 'desc' },
        include: { course: { select: { title: true } }, batch: { select: { id: true, name: true } }, attendance: { select: { status: true } }, certificate: { select: { id: true, certificateNumber: true, status: true } } },
      },
      payments: { orderBy: { createdAt: 'desc' }, include: { invoice: { select: { invoiceNumber: true } } } },
      referralCode: { select: { id: true, code: true, status: true } },
      referredBy: { select: { stage: true, referrer: { select: { id: true, name: true } } } },
    },
  });
  if (!student) throw ApiError.notFound('Student not found');
  const enrollments = await Promise.all(
    student.enrollments.map(async ({ attendance, ...e }) => ({ ...e, attendancePercent: attendancePercent(attendance), progress: await enrollmentProgress(prisma, e.id) })),
  );
  return { ...student, enrollments };
}

/** Admins may correct profile data; account identity (email/phone) changes are audited separately. */
export async function updateStudent(
  actor: Actor,
  id: string,
  input: { name?: string; city?: string | null; qualification?: string | null; institution?: string | null; graduationYear?: number | null; dateOfBirth?: Date | null },
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id, role: 'STUDENT' }, include: { studentProfile: true } });
    if (!before) throw ApiError.notFound('Student not found');
    const { name, ...profile } = input;
    if (name) await tx.user.update({ where: { id }, data: { name } });
    if (Object.keys(profile).length) await tx.studentProfile.update({ where: { userId: id }, data: profile });
    await audit(tx, actor, {
      action: 'student.updated_by_admin',
      entityType: 'User',
      entityId: id,
      before: { name: before.name, ...Object.fromEntries(Object.keys(profile).map((k) => [k, (before.studentProfile as never)?.[k]])) },
      after: input,
      reason,
    });
    return { id };
  });
}

export async function studentAttendance(enrollmentId: string) {
  const e = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!e) throw ApiError.notFound('Enrollment not found');
  const records = await prisma.attendance.findMany({ where: { enrollmentId }, orderBy: { sessionDate: 'desc' } });
  return { percent: attendancePercent(records), records };
}

export async function listAuditLog(q: { entityType?: string; entityId?: string; actorId?: string; skip: number; take: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take, include: { actor: { select: { id: true, name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

export async function listStaff() {
  return prisma.user.findMany({
    // Every role POST /staff can create (staffSchema), plus ADMIN.
    where: { role: { in: ['ADMIN', 'EDITOR', 'FINANCE', 'TRAINER', 'HR'] }, deletedAt: null },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true },
  });
}
