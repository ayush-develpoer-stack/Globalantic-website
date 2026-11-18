import type { Prisma, Role } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { GRANT_ELIGIBLE_ROLES, ROLE_PERMISSIONS, SUPER_ADMIN_PERMISSION } from '../lib/permissions';
import { canonicalEmail, normalizeEmail, normalizePhone } from '../lib/identity';
import { env } from '../config/env';
import { EXPIRY_PREFIX, accessExpiresAt } from '../lib/access-expiry';
import { CONSENT_VERSION, createStaffUser, revokeAllSessions, setPasswordLink, setUserStatus, type StaffRole } from './auth.service';
import { createEmployee, type EmployeeInput } from './hr.service';

/**
 * User & role administration (users.manage) and cross-module reports (reports.read).
 *
 * Escalation guards:
 * - nobody changes their own role or status;
 * - ADMIN accounts can only be created, re-roled, suspended, edited or reset by a
 *   Super Admin (an ADMIN holding the individual admins.manage grant);
 * - Super Admin accounts are never changed through the API (scripts/super-admin.ts only);
 * - students are not converted to staff (create a separate staff account instead).
 * Every role change revokes the user's sessions so the new role applies immediately.
 */

/** Roles any users.manage holder may assign or create. */
const ASSIGNABLE: Role[] = ['EDITOR', 'FINANCE', 'TRAINER', 'HR', 'EMPLOYEE', 'SALES'];

export const isSuperAdmin = (actor: Actor) => (actor.permissions ?? []).includes(SUPER_ADMIN_PERMISSION);

/** Roles this actor may assign through a role change. */
export function assignableRoles(actor: Actor): Role[] {
  return isSuperAdmin(actor) ? [...ASSIGNABLE, 'ADMIN'] : ASSIGNABLE;
}

/**
 * Roles this actor may create accounts for. users.manage: every staff role and interns
 * (STUDENT); a Super Admin also ADMIN. Without users.manage: employees.manage may create
 * EMPLOYEE accounts and training.students.manage may create intern (STUDENT) accounts.
 */
export function creatableRoles(actor: Actor): Role[] {
  const perms = actor.permissions ?? [];
  const roles = new Set<Role>();
  if (perms.includes('users.manage')) {
    for (const r of assignableRoles(actor)) roles.add(r);
    roles.add('STUDENT');
  }
  if (perms.includes('employees.manage')) roles.add('EMPLOYEE');
  if (perms.includes('training.students.manage')) roles.add('STUDENT');
  return [...roles];
}

/** Loads a target user and throws unless the actor may manage it (role, status, edits, resets). */
export async function assertManageable(db: Prisma.TransactionClient | typeof prisma, actor: Actor, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, name: true, role: true, status: true, permissionGrants: { select: { permission: true } } },
  });
  if (!user) throw ApiError.notFound('User not found');
  const targetSuper = user.role === 'ADMIN' && user.permissionGrants.some((g) => g.permission === SUPER_ADMIN_PERMISSION);
  if (user.id !== actor.id) {
    if (targetSuper) throw ApiError.forbidden('Super Admin accounts cannot be changed here');
    if (user.role === 'ADMIN' && !isSuperAdmin(actor)) throw ApiError.forbidden('Only a Super Admin can manage administrator accounts');
  }
  return { ...user, isSuperAdmin: targetSuper };
}

export async function listUsers(q: { search?: string; role?: Role; status?: 'ACTIVE' | 'SUSPENDED'; sort?: string; skip: number; take: number }) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total, byRole] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: orderByFrom<Prisma.UserOrderByWithRelationInput[]>(q.sort, { name: (d) => [{ name: d }], email: (d) => [{ email: d }], role: (d) => [{ role: d }, { name: 'asc' }], createdAt: (d) => [{ createdAt: d }], lastLoginAt: (d) => [{ lastLoginAt: d }] }, [{ role: 'asc' }, { name: 'asc' }]),
      skip: q.skip,
      take: q.take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        permissionGrants: {
          where: { OR: [{ permission: SUPER_ADMIN_PERMISSION }, { permission: { startsWith: EXPIRY_PREFIX } }] },
          select: { permission: true },
        },
        employeeProfile: { select: { department: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: true }),
  ]);
  const items = rows.map(({ permissionGrants, employeeProfile, ...u }) => ({
    ...u,
    isSuperAdmin: u.role === 'ADMIN' && permissionGrants.some((g) => g.permission === SUPER_ADMIN_PERMISSION),
    accessExpiresAt: accessExpiresAt(permissionGrants.map((g) => g.permission)),
    department: employeeProfile?.department ?? null,
  }));
  return { items, total, roleCounts: Object.fromEntries(byRole.map((r) => [r.role, r._count])) };
}

export function rolesMatrix(actor: Actor) {
  const assignable = assignableRoles(actor);
  const creatable = creatableRoles(actor);
  return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
    role,
    permissions,
    assignable: assignable.includes(role as Role),
    creatable: creatable.includes(role as Role),
  }));
}

export async function changeRole(actor: Actor, userId: string, role: Role, reason: string) {
  if (userId === actor.id) throw ApiError.forbidden('You cannot change your own role');
  if (!assignableRoles(actor).includes(role)) {
    if (role === 'ADMIN') throw ApiError.forbidden('Only a Super Admin can grant administrator access');
    throw ApiError.validation([{ field: 'role', message: 'This role cannot be assigned here' }]);
  }
  return prisma.$transaction(async (tx) => {
    const user = await assertManageable(tx, actor, userId);
    if (user.role === 'STUDENT') throw ApiError.conflict('Student accounts cannot be converted to staff; create a staff account instead');
    if (user.role === role) return { id: userId, role };
    await tx.user.update({ where: { id: userId }, data: { role } });
    // Individual grants only apply to some roles; drop those the new role cannot hold.
    // The access-expiry marker is not a permission and must survive a role change.
    if (!GRANT_ELIGIBLE_ROLES.includes(role)) {
      await tx.userPermissionGrant.deleteMany({ where: { userId, NOT: { permission: { startsWith: EXPIRY_PREFIX } } } });
    }
    await revokeAllSessions(tx, userId);
    await audit(tx, actor, { action: 'user.role_changed', entityType: 'User', entityId: userId, before: { role: user.role }, after: { role }, reason });
    return { id: userId, role };
  });
}

/** Suspends or reactivates any account the actor may manage (ADMIN targets need a Super Admin). */
export async function changeStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
  if (userId === actor.id) throw ApiError.forbidden('You cannot change the status of your own account');
  await assertManageable(prisma, actor, userId);
  return setUserStatus(actor, userId, status, reason, { allowAdmin: true });
}

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  role: Role;
  /** Employee profile: required for EMPLOYEE, optional for other staff roles. */
  employee?: Omit<EmployeeInput, 'name' | 'email' | 'phone' | 'role'>;
  /** Intern (STUDENT) profile details. */
  student?: { city?: string | null; institution?: string | null; qualification?: string | null };
}

/**
 * Creates an account of any role the actor may create (see creatableRoles). The admin never
 * chooses the password: the user gets a single-use set-password link by email. When that
 * email could not be sent, the link is returned once so the admin can hand it over.
 */
export async function createUser(actor: Actor, input: CreateUserInput) {
  if (!creatableRoles(actor).includes(input.role)) {
    if (input.role === 'ADMIN') throw ApiError.forbidden('Only a Super Admin can create administrator accounts');
    throw ApiError.forbidden('You are not allowed to create accounts with this role');
  }
  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);
  if (input.role === 'EMPLOYEE' && !input.employee) {
    throw ApiError.validation([{ field: 'employee', message: 'Employee details (department, designation, type, joining date) are required' }]);
  }
  const [byEmail, byPhone] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    phone ? prisma.user.findUnique({ where: { phone }, select: { id: true } }) : null,
  ]);
  if (byEmail) throw ApiError.conflict('An account with this email already exists');
  if (byPhone) throw ApiError.conflict('This phone number is already used by another account');

  const base = { name: input.name, email, phone: phone ?? undefined };
  let setupToken = '';
  const keepToken = (t: string) => {
    setupToken = t;
  };
  let created: { id: string; inviteEmail: string };
  if (input.role === 'STUDENT') {
    const canonical = canonicalEmail(email);
    created = await createStaffUser(
      actor,
      { ...base, role: 'STUDENT' },
      async (tx, userId) => {
        await tx.studentProfile.create({
          data: {
            userId,
            emailCanonical: canonical,
            city: input.student?.city?.trim() || null,
            institution: input.student?.institution?.trim() || null,
            qualification: input.student?.qualification?.trim() || null,
            // Created by staff on the intern's behalf (recorded as such; the intern sets their own password).
            consentAt: new Date(),
            consentVersion: `staff:${CONSENT_VERSION}`,
          },
        });
      },
      keepToken,
    );
  } else if (input.employee) {
    const r = await createEmployee(actor, { ...base, ...input.employee, role: input.role as StaffRole }, keepToken);
    created = { id: r.id, inviteEmail: r.inviteEmail };
  } else {
    created = await createStaffUser(actor, { ...base, role: input.role as StaffRole }, undefined, keepToken);
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: created.id },
    select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
  });
  return {
    ...user,
    inviteEmail: created.inviteEmail,
    portalUrl: portalUrlFor(user.role) || null,
    // Only when the email did not go out, so the admin can deliver it another way. Single use, expires in 24 h.
    setupLink: created.inviteEmail === 'SENT' || !setupToken ? null : setPasswordLink(setupToken),
  };
}

/** Where each role signs in. */
export function portalUrlFor(role: Role): string {
  switch (role) {
    case 'STUDENT':
      return env.internPortalUrl;
    case 'EMPLOYEE':
      return env.employeePortalUrl;
    case 'TRAINER':
      return env.trainerPortalUrl;
    default:
      return env.adminPortalUrl;
  }
}

/** Aggregate report for admins / finance. Learning + money + funnel; no personal data. */
export async function summaryReport() {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 11, 1);
  since.setUTCHours(0, 0, 0, 0);
  const [applications, enrollmentsByCourse, revenue, attendance, rewards, contacts, trainingLeads, careers, employees, leave] = await Promise.all([
    prisma.admissionApplication.groupBy({ by: ['status'], _count: true }),
    prisma.$queryRaw<{ course: string; active: bigint; completed: bigint }[]>`
      SELECT c."title" AS course,
             COUNT(*) FILTER (WHERE e."status" = 'ACTIVE') AS active,
             COUNT(*) FILTER (WHERE e."status" = 'COMPLETED') AS completed
      FROM "enrollments" e JOIN "courses" c ON c."id" = e."courseId"
      GROUP BY c."title" ORDER BY COUNT(*) DESC LIMIT 20`,
    prisma.$queryRaw<{ month: string; amount: bigint; count: bigint }[]>`
      SELECT to_char(date_trunc('month', "verifiedAt"), 'YYYY-MM') AS month, SUM("amountPaise") AS amount, COUNT(*) AS count
      FROM "payments" WHERE "status" = 'PAID' AND "verifiedAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ batch: string; percent: number | null }[]>`
      SELECT b."name" AS batch,
             ROUND(100.0 * COUNT(*) FILTER (WHERE a."status" IN ('PRESENT','LATE')) / NULLIF(COUNT(*) FILTER (WHERE a."status" <> 'EXCUSED'), 0))::int AS percent
      FROM "attendance" a JOIN "batches" b ON b."id" = a."batchId"
      WHERE b."status" IN ('OPEN','FULL','IN_PROGRESS')
      GROUP BY b."name" ORDER BY b."name" LIMIT 50`,
    prisma.referralReward.groupBy({ by: ['status'], _count: true, _sum: { amountPaise: true } }),
    prisma.contactLead.groupBy({ by: ['status'], _count: true }),
    prisma.trainingApplication.groupBy({ by: ['status'], _count: true }),
    prisma.careerApplication.groupBy({ by: ['status'], _count: true }),
    prisma.employeeProfile.groupBy({ by: ['department'], where: { exitDate: null }, _count: true }),
    prisma.leaveRequest.groupBy({ by: ['status'], _count: true }),
  ]);
  const map = (rows: { _count: number }[], key: string) => Object.fromEntries(rows.map((r) => [(r as never)[key], r._count]));
  return {
    generatedAt: new Date(),
    admissions: map(applications, 'status'),
    enrollmentsByCourse: enrollmentsByCourse.map((r) => ({ course: r.course, active: Number(r.active), completed: Number(r.completed) })),
    revenueByMonth: revenue.map((r) => ({ month: r.month, amountPaise: Number(r.amount), payments: Number(r.count) })),
    attendanceByBatch: attendance,
    referralRewards: Object.fromEntries(rewards.map((r) => [r.status, { count: r._count, amountPaise: r._sum.amountPaise ?? 0 }])),
    leads: { contact: map(contacts, 'status'), training: map(trainingLeads, 'status'), careers: map(careers, 'status') },
    employeesByDepartment: map(employees, 'department'),
    leaveRequests: map(leave, 'status'),
  };
}
