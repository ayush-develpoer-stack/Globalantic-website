import type { Role } from '@prisma/client';

/**
 * Granular permissions. Routes check permissions, never raw roles, so a role's
 * reach is visible in one place. The same table is documented in
 * docs/ROLE_PERMISSION_MATRIX.md and asserted in tests/permissions.test.ts.
 *
 * Trainer and student access is additionally scoped by ownership
 * (assigned batches / own records) inside the services.
 */
export const PERMISSIONS = [
  // Corporate CMS (existing /api/admin routes): manage = write drafts; publish = approve/publish/unpublish/archive live content
  'cms.manage',
  'cms.publish',
  // Training administration
  'training.courses.manage',
  'training.batches.manage',
  'training.trainers.manage',
  'training.students.read',
  'training.students.manage',
  'training.admissions.read',
  'training.admissions.manage',
  'training.learning.read',
  'training.certificates.issue',
  'training.announcements.manage',
  'training.support.manage',
  // Money
  'payments.read',
  'payments.reconcile',
  'payments.record_offline',
  // Referral programme
  'referrals.read',
  'referrals.review',
  'referrals.payout',
  'referrals.settings',
  // Audit, users, reports
  'audit.read',
  'users.manage',
  // Super Admin: create, edit, suspend and reset other ADMIN accounts and assign the ADMIN role.
  // Never part of a role: an ADMIN holds it only as an individual grant made by
  // scripts/super-admin.ts (see docs/USER_MANAGEMENT.md).
  'admins.manage',
  'reports.read',
  // Employees / HR
  'employees.read',
  'employees.manage',
  'leave.approve',
  'projects.manage',
  'hr.requests.manage',
  'company.announcements.manage',
  // Intern examinations (Marketing & Sales)
  'exams.manage',
  'exams.evaluate',
  'exams.results.read',
  // Sales CRM (website enquiries / leads)
  'leads.manage',
  // Certificate program (paid, self-paced; separate from courses / internships / exams)
  'programs.manage',
  'programs.read',
  // Business documents: read all, create/send quotations-proposals-agreements, invoices + receipts, company/tax settings
  'documents.read',
  'documents.manage',
  'documents.finance',
  'documents.settings',
  // Admin notification centre: recipients, email preferences, retention
  'notifications.settings',
  // Portals
  'trainer.portal',
  'student.portal',
  'employee.portal',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The Super Admin permission (granted individually to ADMIN accounts only). */
export const SUPER_ADMIN_PERMISSION = 'admins.manage' as const satisfies Permission;

const ADMIN_ONLY: Permission[] = PERMISSIONS.filter((p) => !p.endsWith('.portal') && p !== SUPER_ADMIN_PERMISSION);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_ONLY,
  EDITOR: ['cms.manage'],
  FINANCE: [
    'training.students.read',
    'training.admissions.read',
    'payments.read',
    'payments.reconcile',
    'referrals.read',
    'referrals.review',
    'referrals.payout',
    'reports.read',
    'programs.read',
    'documents.read',
    'documents.finance',
  ],
  HR: [
    'employees.read',
    'employees.manage',
    'leave.approve',
    'projects.manage',
    'hr.requests.manage',
    'company.announcements.manage',
    // HR runs intern recruitment exams
    'exams.manage',
    'exams.evaluate',
    'exams.results.read',
  ],
  SALES: ['leads.manage', 'documents.read', 'documents.manage'],
  TRAINER: ['trainer.portal'],
  STUDENT: ['student.portal'],
  EMPLOYEE: ['employee.portal'],
};

/**
 * Permissions an ADMIN may grant to an individual staff user on top of their role.
 * Deliberately excludes anything that controls access itself, money rules or the
 * audit trail, and portal permissions (portals stay role-bound).
 */
export const NON_GRANTABLE: readonly Permission[] = ['admins.manage', 'users.manage', 'referrals.settings', 'payments.record_offline', 'audit.read', 'documents.settings', 'notifications.settings'];
export const GRANTABLE_PERMISSIONS: Permission[] = PERMISSIONS.filter((p) => !p.endsWith('.portal') && !NON_GRANTABLE.includes(p));
/** Only these roles can receive individual grants (staff using the admin / CMS apps). */
export const GRANT_ELIGIBLE_ROLES: Role[] = ['EDITOR', 'FINANCE', 'HR', 'SALES'];

/** Role permissions plus valid individual grants (any other value in the grants list is ignored). */
export function effectivePermissions(role: string | undefined, grants: readonly string[] = []): Permission[] {
  if (!role || !(role in ROLE_PERMISSIONS)) return [];
  const base = new Set<Permission>(ROLE_PERMISSIONS[role as Role]);
  if (GRANT_ELIGIBLE_ROLES.includes(role as Role)) {
    for (const g of grants) if ((GRANTABLE_PERMISSIONS as string[]).includes(g)) base.add(g as Permission);
  }
  // Super Admin is honoured only on an ADMIN account (a demoted user loses it automatically).
  if (role === 'ADMIN' && grants.includes(SUPER_ADMIN_PERMISSION)) base.add(SUPER_ADMIN_PERMISSION);
  return [...base];
}

export function hasPermission(role: string | undefined, permission: Permission, grants: readonly string[] = []): boolean {
  return effectivePermissions(role, grants).includes(permission);
}

/** Roles that may use the staff (admin) application. */
export const STAFF_ROLES: Role[] = ['ADMIN', 'EDITOR', 'FINANCE', 'HR', 'SALES'];
