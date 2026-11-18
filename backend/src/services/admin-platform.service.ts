import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { normalizePhone } from '../lib/identity';
import {
  GRANT_ELIGIBLE_ROLES,
  GRANTABLE_PERMISSIONS,
  NON_GRANTABLE,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_PERMISSION,
  effectivePermissions,
  hasPermission,
  type Permission,
} from '../lib/permissions';
import { forgotPassword, revokeAllSessions } from './auth.service';
import { assertManageable } from './users.service';
import { EXPIRY_PREFIX, accessExpiresAt } from '../lib/access-expiry';

/**
 * Platform administration: user details, safe edits, admin-initiated password
 * resets, individual permission grants, internal notes, the permission-aware
 * dashboard overview and date-filtered reports. Every sensitive action is audited.
 */

const can = (actor: Actor, p: Permission) => hasPermission(actor.role, p, actor.permissions ?? []);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserDetail(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      permissionGrants: { select: { permission: true, grantedById: true, createdAt: true }, orderBy: { permission: 'asc' } },
      employeeProfile: { select: { employeeCode: true, department: true, designation: true } },
      _count: { select: { enrollments: true, applications: true, trainerAssignments: true, sessions: true } },
    },
  });
  if (!user) throw ApiError.notFound('User not found');
  const grants = user.permissionGrants.map((g) => g.permission);
  const recentActivity = await prisma.auditLog.findMany({
    where: { OR: [{ actorId: id }, { entityType: 'User', entityId: id }] },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, action: true, entityType: true, entityId: true, reason: true, createdAt: true, actorRole: true },
  });
  return {
    ...user,
    permissionGrants: user.permissionGrants.filter((g) => !g.permission.startsWith(EXPIRY_PREFIX)),
    rolePermissions: ROLE_PERMISSIONS[user.role],
    effectivePermissions: effectivePermissions(user.role, grants),
    canReceiveGrants: GRANT_ELIGIBLE_ROLES.includes(user.role),
    isSuperAdmin: user.role === 'ADMIN' && grants.includes(SUPER_ADMIN_PERMISSION),
    accessExpiresAt: accessExpiresAt(grants),
    recentActivity,
  };
}

/** Name and phone only. Email, role and status have their own audited flows. */
export async function updateUserBasics(actor: Actor, id: string, input: { name?: string; phone?: string | null }, reason: string) {
  return prisma.$transaction(async (tx) => {
    // Other ADMIN accounts: Super Admin only; Super Admin accounts: never (throws otherwise).
    await assertManageable(tx, actor, id);
    const before = await tx.user.findFirstOrThrow({ where: { id, deletedAt: null }, select: { id: true, name: true, phone: true, role: true } });
    let phone: string | null | undefined;
    if (input.phone !== undefined) {
      phone = input.phone === null ? null : normalizePhone(input.phone);
      if (input.phone !== null && !phone) throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);
      if (phone) {
        const clash = await tx.user.findFirst({ where: { phone, id: { not: id } }, select: { id: true } });
        if (clash) throw ApiError.conflict('This phone number is already used by another account');
      }
    }
    const after = await tx.user.update({
      where: { id },
      data: { ...(input.name ? { name: input.name.trim() } : {}), ...(phone !== undefined ? { phone } : {}) },
      select: { id: true, name: true, phone: true },
    });
    await audit(tx, actor, { action: 'user.updated', entityType: 'User', entityId: id, before: { name: before.name, phoneSet: Boolean(before.phone) }, after: { name: after.name, phoneSet: Boolean(after.phone) }, reason });
    return after;
  });
}

/**
 * Sends the user a single-use reset link (the admin never sees or sets a password).
 * Optionally signs the user out everywhere.
 */
export async function adminPasswordReset(actor: Actor, id: string, input: { revokeSessions: boolean }, reason: string) {
  // Other ADMIN accounts: Super Admin only; Super Admin accounts reset their own via "Forgot password".
  const user = await assertManageable(prisma, actor, id);
  if (user.status !== 'ACTIVE') throw ApiError.conflict('Reactivate the account before sending a reset link');
  if (input.revokeSessions) await revokeAllSessions(prisma, id);
  const delivery = await forgotPassword(user.email);
  await audit(prisma, actor, { action: 'user.password_reset_sent', entityType: 'User', entityId: id, after: { revokedSessions: input.revokeSessions }, reason });
  return { sent: delivery === 'SENT', delivery };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function permissionCatalog() {
  return PERMISSIONS.map((p) => ({
    permission: p,
    grantable: (GRANTABLE_PERMISSIONS as string[]).includes(p),
    reason: p.endsWith('.portal')
      ? 'Portal access is tied to the role'
      : p === SUPER_ADMIN_PERMISSION
        ? 'Super Admin: granted with scripts/super-admin.ts only'
        : NON_GRANTABLE.includes(p)
          ? 'Reserved for the ADMIN role'
          : null,
    roles: (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => ROLE_PERMISSIONS[r].includes(p)),
  }));
}

export async function grantPermission(actor: Actor, userId: string, permission: string, reason: string) {
  if (userId === actor.id) throw ApiError.forbidden('You cannot change your own permissions');
  if (!(GRANTABLE_PERMISSIONS as string[]).includes(permission)) {
    throw ApiError.validation([{ field: 'permission', message: 'This permission cannot be granted individually' }]);
  }
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { role: true } });
    if (!user) throw ApiError.notFound('User not found');
    if (!GRANT_ELIGIBLE_ROLES.includes(user.role)) throw ApiError.conflict(`Individual permissions can only be granted to ${GRANT_ELIGIBLE_ROLES.join(', ')} accounts`);
    if (ROLE_PERMISSIONS[user.role].includes(permission as Permission)) throw ApiError.conflict('The role already includes this permission');
    const existing = await tx.userPermissionGrant.findUnique({ where: { userId_permission: { userId, permission } } });
    if (existing) throw ApiError.conflict('This permission is already granted');
    await tx.userPermissionGrant.create({ data: { userId, permission, grantedById: actor.id } });
    await audit(tx, actor, { action: 'permission.granted', entityType: 'User', entityId: userId, after: { permission }, reason });
    return { userId, permission };
  });
}

export async function revokePermission(actor: Actor, userId: string, permission: string, reason: string) {
  if (userId === actor.id) throw ApiError.forbidden('You cannot change your own permissions');
  if (permission === SUPER_ADMIN_PERMISSION) throw ApiError.forbidden('Super Admin access is changed with scripts/super-admin.ts only');
  return prisma.$transaction(async (tx) => {
    const res = await tx.userPermissionGrant.deleteMany({ where: { userId, permission } });
    if (!res.count) throw ApiError.notFound('Grant not found');
    await audit(tx, actor, { action: 'permission.revoked', entityType: 'User', entityId: userId, before: { permission }, reason });
    return { userId, permission, revoked: true };
  });
}

// ---------------------------------------------------------------------------
// Internal notes (never shown to the subject)
// ---------------------------------------------------------------------------

/**
 * Notes are scoped by the actor's domain: users.manage sees every user; training.students.manage
 * only students; employees.manage only users with an employee profile. Nobody but users.manage
 * reads or writes notes about their own account. Out-of-scope users look like missing ones.
 */
async function assertNoteScope(actor: Actor, userId: string): Promise<void> {
  const perms = actor.permissions ?? [];
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, employeeProfile: { select: { id: true } } } });
  if (!target) throw ApiError.notFound('User not found');
  if (perms.includes('users.manage')) return;
  const inScope =
    target.id !== actor.id &&
    ((target.role === 'STUDENT' && perms.includes('training.students.manage')) || (Boolean(target.employeeProfile) && perms.includes('employees.manage')));
  if (!inScope) throw ApiError.notFound('User not found');
}

export async function listNotes(actor: Actor, userId: string) {
  await assertNoteScope(actor, userId);
  return prisma.userNote.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function addNote(actor: Actor, userId: string, body: string) {
  await assertNoteScope(actor, userId);
  const note = await prisma.userNote.create({ data: { userId, authorId: actor.id, body: body.trim() } });
  await audit(prisma, actor, { action: 'user.note_added', entityType: 'User', entityId: userId, after: { noteId: note.id } });
  return note;
}

export async function removeNote(actor: Actor, userId: string, noteId: string) {
  await assertNoteScope(actor, userId);
  // Only the author removes their own note; users.manage may remove any.
  const authorOnly = (actor.permissions ?? []).includes('users.manage') ? {} : { authorId: actor.id };
  const res = await prisma.userNote.updateMany({ where: { id: noteId, userId, deletedAt: null, ...authorOnly }, data: { deletedAt: new Date() } });
  if (!res.count) throw ApiError.notFound('Note not found');
  await audit(prisma, actor, { action: 'user.note_removed', entityType: 'User', entityId: userId, after: { noteId } });
  return { id: noteId };
}

// ---------------------------------------------------------------------------
// Dashboard overview (sections included only when the actor may see them)
// ---------------------------------------------------------------------------

export async function overview(actor: Actor) {
  const out: Record<string, unknown> = { generatedAt: new Date() };
  const tasks: Promise<void>[] = [];
  if (can(actor, 'users.manage') || can(actor, 'training.students.read') || can(actor, 'employees.read')) {
    tasks.push(
      prisma.user.groupBy({ by: ['role', 'status'], where: { deletedAt: null }, _count: true }).then((rows) => {
        const byRole: Record<string, { active: number; suspended: number }> = {};
        for (const r of rows) {
          byRole[r.role] ??= { active: 0, suspended: 0 };
          byRole[r.role][r.status === 'ACTIVE' ? 'active' : 'suspended'] += r._count;
        }
        out.users = byRole;
      }),
    );
  }
  if (can(actor, 'training.admissions.read')) {
    tasks.push(
      Promise.all([
        prisma.course.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
        prisma.batch.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
        prisma.admissionApplication.groupBy({ by: ['status'], _count: true }),
        prisma.enrollment.count({ where: { status: 'ACTIVE' } }),
      ]).then(([courses, batches, apps, activeEnrollments]) => {
        out.training = {
          courses: Object.fromEntries(courses.map((c) => [c.status, c._count])),
          batches: Object.fromEntries(batches.map((b) => [b.status, b._count])),
          applications: Object.fromEntries(apps.map((a) => [a.status, a._count])),
          activeEnrollments,
        };
      }),
    );
  }
  if (can(actor, 'payments.read')) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    tasks.push(
      Promise.all([
        prisma.payment.groupBy({ by: ['status'], _count: true, _sum: { amountPaise: true } }),
        prisma.payment.aggregate({ where: { status: 'PAID', verifiedAt: { gte: monthStart } }, _sum: { amountPaise: true }, _count: true }),
        prisma.admissionApplication.count({ where: { status: 'APPROVED', payablePaise: { gt: 0 } } }),
      ]).then(([byStatus, month, awaiting]) => {
        out.payments = {
          byStatus: Object.fromEntries(byStatus.map((p) => [p.status, { count: p._count, amountPaise: p._sum.amountPaise ?? 0 }])),
          thisMonth: { count: month._count, amountPaise: month._sum.amountPaise ?? 0 },
          awaitingPayment: awaiting,
        };
      }),
    );
  }
  if (can(actor, 'referrals.read')) {
    tasks.push(
      Promise.all([
        prisma.referralReward.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
        prisma.referralReward.count({ where: { status: 'APPROVED' } }),
        prisma.fraudReview.count({ where: { status: 'OPEN' } }),
      ]).then(([pending, toPay, fraud]) => {
        out.referrals = { pendingReview: pending, approvedAwaitingPayout: toPay, openFraudReviews: fraud };
      }),
    );
  }
  if (can(actor, 'cms.manage')) {
    tasks.push(
      Promise.all([
        prisma.contactLead.count({ where: { status: 'NEW' } }),
        prisma.trainingApplication.count({ where: { status: 'NEW' } }),
        prisma.careerApplication.count({ where: { status: 'NEW' } }),
      ]).then(([contact, training, careers]) => {
        out.leads = { newContacts: contact, newTrainingLeads: training, newCareerApplications: careers };
      }),
    );
  }
  if (can(actor, 'employees.read')) {
    tasks.push(
      Promise.all([
        prisma.employeeProfile.count({ where: { exitDate: null } }),
        prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
        prisma.hrRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      ]).then(([employees, pendingLeave, openRequests]) => {
        out.people = { employees, pendingLeave, openHrRequests: openRequests };
      }),
    );
  }
  if (can(actor, 'training.support.manage')) {
    tasks.push(prisma.supportRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }).then((n) => void (out.openSupport = n)));
  }
  if (can(actor, 'audit.read')) {
    tasks.push(
      prisma.auditLog
        .findMany({
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: { id: true, action: true, entityType: true, entityId: true, actorRole: true, createdAt: true, actor: { select: { name: true } } },
        })
        .then((rows) => void (out.recentActivity = rows)),
    );
  }
  await Promise.all(tasks);
  return out;
}

// ---------------------------------------------------------------------------
// Reports (server-side date filters, bounded result sets, audited exports)
// ---------------------------------------------------------------------------

export const REPORT_TYPES = ['admissions', 'payments', 'attendance', 'courses', 'batches', 'referrals', 'students', 'employees'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
const REPORT_LIMIT = 2000;

/** Extra permission needed (on top of reports.read) for reports containing personal data. */
const REPORT_PERMISSION: Partial<Record<ReportType, Permission>> = {
  students: 'training.students.read',
  employees: 'employees.read',
  referrals: 'referrals.read',
};

export async function runReport(actor: Actor, type: ReportType, q: { from?: Date; to?: Date; exportCsv?: boolean }) {
  const extra = REPORT_PERMISSION[type];
  if (extra && !can(actor, extra)) throw ApiError.forbidden('You do not have permission to run this report');
  const range = (field: string) => (q.from || q.to ? { [field]: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {});
  const take = REPORT_LIMIT + 1;
  let rows: Record<string, unknown>[] = [];

  switch (type) {
    case 'admissions': {
      const r = await prisma.admissionApplication.findMany({
        where: range('createdAt') as Prisma.AdmissionApplicationWhereInput,
        orderBy: { createdAt: 'desc' },
        take,
        select: { applicationNumber: true, status: true, payablePaise: true, createdAt: true, reviewedAt: true, course: { select: { title: true } }, batch: { select: { name: true } } },
      });
      rows = r.map((a) => ({ application: a.applicationNumber, status: a.status, course: a.course.title, batch: a.batch.name, payablePaise: a.payablePaise, submittedAt: a.createdAt, reviewedAt: a.reviewedAt }));
      break;
    }
    case 'payments': {
      const r = await prisma.payment.findMany({
        where: range('createdAt') as Prisma.PaymentWhereInput,
        orderBy: { createdAt: 'desc' },
        take,
        select: { status: true, provider: true, method: true, amountPaise: true, createdAt: true, verifiedAt: true, verifiedVia: true, application: { select: { applicationNumber: true } }, programEnrollment: { select: { enrollmentNumber: true } }, invoice: { select: { invoiceNumber: true } } },
      });
      rows = r.map((p) => ({ application: p.application?.applicationNumber ?? '', programEnrollment: p.programEnrollment?.enrollmentNumber ?? '', invoice: p.invoice?.invoiceNumber ?? '', status: p.status, provider: p.provider, method: p.method ?? '', amountPaise: p.amountPaise, createdAt: p.createdAt, verifiedAt: p.verifiedAt, verifiedVia: p.verifiedVia ?? '' }));
      break;
    }
    case 'attendance': {
      const r = await prisma.attendance.groupBy({ by: ['batchId', 'status'], where: range('sessionDate') as Prisma.AttendanceWhereInput, _count: true });
      const batches = await prisma.batch.findMany({ where: { id: { in: [...new Set(r.map((x) => x.batchId))] } }, select: { id: true, name: true, course: { select: { title: true } } } });
      const byBatch = new Map<string, Record<string, unknown>>();
      for (const x of r) {
        const b = batches.find((bb) => bb.id === x.batchId);
        const row = byBatch.get(x.batchId) ?? { course: b?.course.title, batch: b?.name, PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
        row[x.status] = x._count;
        byBatch.set(x.batchId, row);
      }
      rows = [...byBatch.values()].map((row) => {
        const counted = Number(row.PRESENT) + Number(row.LATE) + Number(row.ABSENT);
        return { ...row, attendancePercent: counted ? Math.round(((Number(row.PRESENT) + Number(row.LATE)) * 100) / counted) : null };
      });
      break;
    }
    case 'courses': {
      const r = await prisma.course.findMany({
        where: { deletedAt: null },
        orderBy: { title: 'asc' },
        take,
        select: { title: true, status: true, programType: true, feePaise: true, _count: { select: { batches: true } }, applications: { where: range('createdAt') as never, select: { status: true } } },
      });
      rows = r.map((c) => ({ course: c.title, status: c.status, programType: c.programType, feePaise: c.feePaise, batches: c._count.batches, applications: c.applications.length, enrolled: c.applications.filter((a) => a.status === 'ENROLLED').length }));
      break;
    }
    case 'batches': {
      const r = await prisma.batch.findMany({
        where: { deletedAt: null, ...(range('startDate') as Prisma.BatchWhereInput) },
        orderBy: { startDate: 'desc' },
        take,
        select: { name: true, status: true, startDate: true, endDate: true, capacity: true, course: { select: { title: true } }, _count: { select: { enrollments: true } } },
      });
      rows = r.map((b) => ({ course: b.course.title, batch: b.name, status: b.status, startDate: b.startDate, endDate: b.endDate, capacity: b.capacity, enrolled: b._count.enrollments }));
      break;
    }
    case 'referrals': {
      const r = await prisma.referralReward.findMany({
        where: range('createdAt') as Prisma.ReferralRewardWhereInput,
        orderBy: { createdAt: 'desc' },
        take,
        select: { status: true, amountPaise: true, createdAt: true, eligibleAt: true, reviewedAt: true, referrer: { select: { name: true } }, payout: { select: { method: true, paidAt: true } } },
      });
      rows = r.map((x) => ({ referrer: x.referrer.name, status: x.status, amountPaise: x.amountPaise, createdAt: x.createdAt, eligibleAt: x.eligibleAt, reviewedAt: x.reviewedAt, payoutMethod: x.payout?.method ?? '', paidAt: x.payout?.paidAt ?? null }));
      break;
    }
    case 'students': {
      const r = await prisma.user.findMany({
        where: { role: 'STUDENT', deletedAt: null, ...(range('createdAt') as Prisma.UserWhereInput) },
        orderBy: { createdAt: 'desc' },
        take,
        select: { name: true, email: true, status: true, emailVerifiedAt: true, createdAt: true, studentProfile: { select: { city: true } }, _count: { select: { enrollments: true, applications: true } } },
      });
      rows = r.map((s) => ({ name: s.name, email: s.email, status: s.status, verified: Boolean(s.emailVerifiedAt), city: s.studentProfile?.city ?? '', applications: s._count.applications, enrollments: s._count.enrollments, registeredAt: s.createdAt }));
      break;
    }
    case 'employees': {
      const r = await prisma.employeeProfile.findMany({
        where: range('joiningDate') as Prisma.EmployeeProfileWhereInput,
        orderBy: { employeeCode: 'asc' },
        take,
        select: { employeeCode: true, department: true, designation: true, employmentType: true, joiningDate: true, exitDate: true, user: { select: { name: true, status: true } } },
      });
      rows = r.map((e) => ({ code: e.employeeCode, name: e.user.name, department: e.department, designation: e.designation, type: e.employmentType, joiningDate: e.joiningDate, exitDate: e.exitDate, status: e.user.status }));
      break;
    }
  }

  const truncated = rows.length > REPORT_LIMIT;
  if (truncated) rows = rows.slice(0, REPORT_LIMIT);
  if (q.exportCsv) {
    // Data exports are audit events (what, which range, how many rows; never the data itself).
    await audit(prisma, actor, { action: 'report.exported', entityType: 'Report', entityId: type, after: { from: q.from ?? null, to: q.to ?? null, rows: rows.length } });
  }
  return { type, from: q.from ?? null, to: q.to ?? null, rows, truncated, limit: REPORT_LIMIT };
}
