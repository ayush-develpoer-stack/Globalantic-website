import { z } from 'zod';
import { paginationQuery, sortParam } from '../lib/pagination';
import { isoDate, uuid } from './training';

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
const clearable = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), s]).optional());
const text = (max: number) => z.string().trim().max(max);
const reqText = (min: number, max: number, msg = 'Required') => z.string().trim().min(min, msg).max(max);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']);
const taskStatus = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']);
const taskPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const projectStatus = z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED']);
const reason = reqText(3, 500, 'A reason is required');

// ---- Employee self-service ------------------------------------------------
export const employeeSelfUpdateSchema = z.object({
  emergencyContactName: clearable(text(120)),
  emergencyContactPhone: clearable(z.string().trim().regex(/^[+\d][\d\s-]{5,19}$/, 'Enter a valid phone number')),
});
export const checkInSchema = z.object({ status: z.enum(['PRESENT', 'WORK_FROM_HOME']).default('PRESENT'), notes: opt(text(300)) });
export const monthQuery = z.object({ month: opt(month) });
export const leaveSchema = z.object({
  type: z.enum(['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER']),
  startDate: isoDate,
  endDate: isoDate,
  reason: reqText(3, 1000),
});
export const taskStatusSchema = z.object({ status: taskStatus });
export const taskQuery = z.object({ status: opt(taskStatus) });
export const workUpdateSchema = z.object({
  date: isoDate,
  summary: reqText(3, 2000),
  minutes: opt(z.coerce.number().int().min(1).max(24 * 60)),
  projectId: opt(uuid),
  taskId: opt(uuid),
});
export const hrRequestSchema = z.object({
  category: z.enum(['GENERAL', 'PAYROLL', 'LEAVE', 'IT', 'DOCUMENT', 'OTHER']).default('GENERAL'),
  subject: reqText(3, 160),
  message: reqText(10, 4000),
});

// ---- HR / admin ------------------------------------------------------------
export const employeeCreateSchema = z.object({
  name: reqText(2, 120),
  email: z.string().trim().email(),
  phone: opt(text(20)),
  role: z.enum(['EMPLOYEE', 'HR']).default('EMPLOYEE'),
  department: reqText(2, 80),
  designation: reqText(2, 120),
  employmentType: employmentType.default('FULL_TIME'),
  joiningDate: isoDate,
  managerId: clearable(uuid),
  workLocation: clearable(text(120)),
});
export const employeeUpdateSchema = z.object({
  name: opt(reqText(2, 120)),
  department: opt(reqText(2, 80)),
  designation: opt(reqText(2, 120)),
  employmentType: opt(employmentType),
  joiningDate: opt(isoDate),
  exitDate: clearable(isoDate),
  managerId: clearable(uuid),
  workLocation: clearable(text(120)),
  reason,
});
export const employeeListQuery = z.object({ search: opt(text(100)), department: opt(text(80)), sort: sortParam(['employeeCode', 'name', 'department', 'joiningDate']), ...paginationQuery });
export const attendanceCorrectionSchema = z.object({
  date: isoDate,
  status: z.enum(['PRESENT', 'WORK_FROM_HOME', 'HALF_DAY', 'ABSENT', 'ON_LEAVE']),
  notes: clearable(text(300)),
  reason,
});
export const leaveListQuery = z.object({ status: opt(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])), ...paginationQuery });
export const leaveReviewSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']), note: opt(text(500)) });
export const projectSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and hyphens only'),
  name: reqText(2, 160),
  description: clearable(text(4000)),
  status: opt(projectStatus),
  startDate: clearable(isoDate),
  endDate: clearable(isoDate),
});
export const projectUpdateSchema = projectSchema.omit({ code: true }).partial();
export const projectQuery = z.object({ status: opt(projectStatus), search: opt(text(100)) });
export const memberSchema = z.object({ userId: uuid, role: clearable(text(80)) });
export const memberParam = z.object({ id: uuid, userId: uuid });
const taskBase = {
  title: reqText(2, 200),
  description: clearable(text(4000)),
  assigneeId: uuid,
  projectId: clearable(uuid),
  priority: opt(taskPriority),
  status: opt(taskStatus),
  dueDate: clearable(isoDate),
};
export const taskSchema = z.object(taskBase);
export const taskUpdateSchema = z.object(taskBase).partial();
export const taskListQuery = z.object({ projectId: opt(uuid), assigneeId: opt(uuid), status: opt(taskStatus), ...paginationQuery });
export const workUpdateListQuery = z.object({ employeeId: opt(uuid), projectId: opt(uuid), ...paginationQuery });
export const documentSchema = z.object({
  title: reqText(2, 160),
  category: z.enum(['OFFER_LETTER', 'ID_PROOF', 'PAYSLIP', 'POLICY', 'OTHER']).default('OTHER'),
  fileId: uuid,
  visibleToEmployee: z.boolean().default(true),
});
export const documentUpdateSchema = z.object({ visibleToEmployee: z.boolean().optional(), remove: z.boolean().optional(), reason });
export const hrRequestListQuery = z.object({ status: opt(z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])), ...paginationQuery });
export const hrResponseSchema = z.object({ status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED']), response: opt(text(4000)) });
export const companyAnnouncementSchema = z.object({ title: reqText(3, 200), body: reqText(3, 5000) });

// ---- Platform users ---------------------------------------------------------
export const userListQuery = z.object({
  search: opt(text(100)),
  role: opt(z.enum(['ADMIN', 'EDITOR', 'FINANCE', 'TRAINER', 'STUDENT', 'HR', 'EMPLOYEE', 'SALES'])),
  status: opt(z.enum(['ACTIVE', 'SUSPENDED'])),
  sort: sortParam(['name', 'email', 'role', 'createdAt', 'lastLoginAt']),
  ...paginationQuery,
});
// ADMIN is checked against Super Admin in users.service.
export const roleChangeSchema = z.object({ role: z.enum(['EDITOR', 'FINANCE', 'TRAINER', 'HR', 'EMPLOYEE', 'SALES', 'ADMIN']), reason });

/** POST /api/platform/users (allowed roles per caller are enforced in users.service). */
export const userCreateSchema = z
  .object({
    name: reqText(2, 120),
    email: z.string().trim().email(),
    phone: opt(text(20)),
    role: z.enum(['ADMIN', 'EDITOR', 'FINANCE', 'TRAINER', 'HR', 'EMPLOYEE', 'SALES', 'STUDENT']),
    employee: z
      .object({
        department: reqText(2, 80),
        designation: reqText(2, 120),
        employmentType: employmentType.default('FULL_TIME'),
        joiningDate: isoDate,
        managerId: clearable(uuid),
        workLocation: clearable(text(120)),
      })
      .optional(),
    student: z
      .object({
        city: clearable(text(80)),
        institution: clearable(text(160)),
        qualification: clearable(text(120)),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'EMPLOYEE' && !v.employee) ctx.addIssue({ code: 'custom', path: ['employee', 'department'], message: 'Employee details are required for employee accounts' });
    if (v.role === 'STUDENT' && v.employee) ctx.addIssue({ code: 'custom', path: ['employee'], message: 'Interns do not have an employee profile' });
  });
export const userStatusChangeSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason });

// ---- Platform administration (2026-10-17) -----------------------------------
export const employeeStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason });
export const userBasicsSchema = z.object({ name: opt(reqText(2, 120)), phone: clearable(text(20)), reason });
export const passwordResetSchema = z.object({ revokeSessions: z.boolean().default(false), reason });
export const grantSchema = z.object({ permission: reqText(3, 60), reason });
export const grantParam = z.object({ id: uuid, permission: z.string().regex(/^[a-z.]+$/) });
export const noteSchema = z.object({ body: reqText(2, 4000) });
export const noteParam = z.object({ id: uuid, noteId: uuid });
export const reportQuery = z.object({ from: opt(isoDate), to: opt(isoDate), export: opt(z.enum(['true', 'false'])) });
export const reportParam = z.object({ type: z.enum(['admissions', 'payments', 'attendance', 'courses', 'batches', 'referrals', 'students', 'employees']) });
