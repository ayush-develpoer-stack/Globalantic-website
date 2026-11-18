import type { EmployeeAttendanceStatus, LeaveType, TaskStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit } from '../lib/audit';
import { publicFile } from './file.service';
import { emitAdminEvent } from './admin-events.service';

/**
 * Employee self-service (/api/employee/*). Every query is scoped to the
 * session's user id — no route accepts an employee id from the client — so an
 * employee can never read another employee's attendance, leave, documents or
 * HR requests. Project data is visible only to project members.
 */

const DAY = 86_400_000;

/** Today's calendar date in IST, as a UTC-midnight Date (matches @db.Date columns). */
export function todayIst(now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function inclusiveDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY) + 1;
}

async function requireEmployee(userId: string) {
  const profile = await prisma.employeeProfile.findUnique({ where: { userId } });
  if (!profile) throw ApiError.forbidden('No employee profile is linked to this account. Please contact HR.');
  return profile;
}

const self = (id: string) => ({ id, role: 'EMPLOYEE' });

// ---------------------------------------------------------------------------
// Profile & dashboard
// ---------------------------------------------------------------------------

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      employeeProfile: {
        select: {
          employeeCode: true,
          department: true,
          designation: true,
          employmentType: true,
          joiningDate: true,
          workLocation: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          manager: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!user.employeeProfile) throw ApiError.forbidden('No employee profile is linked to this account. Please contact HR.');
  return user;
}

/** Employees may only edit their emergency contact; job data is HR-managed. */
export async function updateMe(userId: string, input: { emergencyContactName?: string | null; emergencyContactPhone?: string | null }) {
  await requireEmployee(userId);
  await prisma.$transaction(async (tx) => {
    await tx.employeeProfile.update({ where: { userId }, data: input });
    await audit(tx, self(userId), { action: 'employee.profile_updated', entityType: 'User', entityId: userId, after: Object.keys(input) });
  });
  return getMe(userId);
}

export async function dashboard(userId: string) {
  await requireEmployee(userId);
  const today = todayIst();
  const [attendance, pendingLeaves, openTasks, announcements, openRequests, onLeave] = await Promise.all([
    prisma.employeeAttendance.findUnique({ where: { employeeId_date: { employeeId: userId, date: today } } }),
    prisma.leaveRequest.count({ where: { employeeId: userId, status: 'PENDING' } }),
    prisma.task.findMany({
      where: { assigneeId: userId, status: { not: 'DONE' } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, status: true, priority: true, dueDate: true, project: { select: { id: true, name: true } } },
    }),
    prisma.companyAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.hrRequest.count({ where: { employeeId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.leaveRequest.findFirst({ where: { employeeId: userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } }),
  ]);
  return { today: today.toISOString().slice(0, 10), attendance, onLeaveToday: Boolean(onLeave), pendingLeaves, openTasks, announcements, openRequests };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function checkIn(userId: string, input: { status: Extract<EmployeeAttendanceStatus, 'PRESENT' | 'WORK_FROM_HOME'>; notes?: string }) {
  await requireEmployee(userId);
  const date = todayIst();
  const onLeave = await prisma.leaveRequest.findFirst({ where: { employeeId: userId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } });
  if (onLeave) throw ApiError.conflict('You are on approved leave today');
  const existing = await prisma.employeeAttendance.findUnique({ where: { employeeId_date: { employeeId: userId, date } } });
  if (existing?.checkInAt) throw ApiError.conflict('You have already checked in today');
  const record = existing
    ? await prisma.employeeAttendance.update({ where: { id: existing.id }, data: { status: input.status, checkInAt: new Date(), notes: input.notes ?? existing.notes } })
    : await prisma.employeeAttendance.create({ data: { employeeId: userId, date, status: input.status, checkInAt: new Date(), notes: input.notes ?? null } });
  return record;
}

export async function checkOut(userId: string) {
  await requireEmployee(userId);
  const date = todayIst();
  const res = await prisma.employeeAttendance.updateMany({
    where: { employeeId: userId, date, checkInAt: { not: null }, checkOutAt: null },
    data: { checkOutAt: new Date() },
  });
  if (res.count !== 1) throw ApiError.conflict('Check in first (or you have already checked out today)');
  return prisma.employeeAttendance.findUniqueOrThrow({ where: { employeeId_date: { employeeId: userId, date } } });
}

export async function attendanceHistory(userId: string, month?: string) {
  await requireEmployee(userId);
  const start = month ? dateOnly(`${month}-01`) : new Date(todayIst().getTime() - 60 * DAY);
  const end = month ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) : new Date(todayIst().getTime() + DAY);
  const records = await prisma.employeeAttendance.findMany({
    where: { employeeId: userId, date: { gte: start, lt: end } },
    orderBy: { date: 'desc' },
    select: { id: true, date: true, status: true, checkInAt: true, checkOutAt: true, notes: true },
  });
  const counts = records.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  return { records, counts };
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export async function listLeaves(userId: string) {
  await requireEmployee(userId);
  return prisma.leaveRequest.findMany({
    where: { employeeId: userId },
    orderBy: { startDate: 'desc' },
    select: { id: true, type: true, startDate: true, endDate: true, days: true, reason: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true },
  });
}

export async function applyLeave(userId: string, input: { type: LeaveType; startDate: string; endDate: string; reason: string }) {
  await requireEmployee(userId);
  const start = dateOnly(input.startDate);
  const end = dateOnly(input.endDate);
  if (end < start) throw ApiError.validation([{ field: 'endDate', message: 'End date must be on or after the start date' }]);
  if (start.getTime() < todayIst().getTime() - 30 * DAY) {
    throw ApiError.validation([{ field: 'startDate', message: 'Leave cannot start more than 30 days in the past' }]);
  }
  const days = inclusiveDays(start, end);
  if (days > 60) throw ApiError.validation([{ field: 'endDate', message: 'A single request can cover at most 60 days' }]);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
    const overlap = await tx.leaveRequest.findFirst({
      where: { employeeId: userId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: end }, endDate: { gte: start } },
      select: { id: true },
    });
    if (overlap) throw ApiError.conflict('This overlaps an existing pending or approved leave request');
    const leave = await tx.leaveRequest.create({ data: { employeeId: userId, type: input.type, startDate: start, endDate: end, days, reason: input.reason.trim() } });
    await audit(tx, self(userId), { action: 'leave.requested', entityType: 'LeaveRequest', entityId: leave.id, after: { type: leave.type, days } });
    return leave;
  }).then(async (leave) => {
    await emitAdminEvent({
      dedupeKey: `hr.leave_requested:${leave.id}`,
      category: 'hr',
      severity: 'info',
      title: `Leave request: ${leave.days} day(s)`,
      body: `${leave.type} leave from ${leave.startDate.toISOString().slice(0, 10)} — awaiting approval`,
      link: '/leave',
      entityType: 'LeaveRequest',
      entityId: leave.id,
      audience: 'leave.approve',
    });
    return leave;
  });
}

export async function cancelLeave(userId: string, leaveId: string) {
  return prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findFirst({ where: { id: leaveId, employeeId: userId } });
    if (!leave) throw ApiError.notFound('Leave request not found');
    const cancellable = leave.status === 'PENDING' || (leave.status === 'APPROVED' && leave.startDate > todayIst());
    if (!cancellable) throw ApiError.conflict('Only pending or future approved leave can be cancelled');
    await tx.leaveRequest.update({ where: { id: leaveId }, data: { status: 'CANCELLED' } });
    await audit(tx, self(userId), { action: 'leave.cancelled', entityType: 'LeaveRequest', entityId: leaveId, before: { status: leave.status }, after: { status: 'CANCELLED' } });
    return { id: leaveId, status: 'CANCELLED' as const };
  });
}

// ---------------------------------------------------------------------------
// Projects, tasks, work updates
// ---------------------------------------------------------------------------

export async function myProjects(userId: string) {
  await requireEmployee(userId);
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      _count: { select: { members: true, tasks: true } },
    },
  });
}

export async function myProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      status: true,
      startDate: true,
      endDate: true,
      // Teammates: names and roles only — no contact or HR data.
      members: { select: { role: true, user: { select: { id: true, name: true } } } },
    },
  });
  if (!project) throw ApiError.notFound('Project not found');
  const tasks = await prisma.task.findMany({
    where: { projectId, assigneeId: userId },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
  });
  return { ...project, myTasks: tasks };
}

export async function myTasks(userId: string, status?: TaskStatus) {
  await requireEmployee(userId);
  return prisma.task.findMany({
    where: { assigneeId: userId, ...(status ? { status } : {}) },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, title: true, description: true, status: true, priority: true, dueDate: true, completedAt: true, createdAt: true, project: { select: { id: true, name: true } } },
  });
}

/** Assignees may only move their own task's status. */
export async function updateMyTaskStatus(userId: string, taskId: string, status: TaskStatus) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, assigneeId: userId } });
    if (!task) throw ApiError.notFound('Task not found');
    const updated = await tx.task.update({ where: { id: taskId }, data: { status, completedAt: status === 'DONE' ? new Date() : null } });
    await audit(tx, self(userId), { action: 'task.status_changed', entityType: 'Task', entityId: taskId, before: { status: task.status }, after: { status } });
    return updated;
  });
}

export async function listWorkUpdates(userId: string) {
  await requireEmployee(userId);
  return prisma.workUpdate.findMany({
    where: { employeeId: userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: { project: { select: { id: true, name: true } }, task: { select: { id: true, title: true } } },
  });
}

export async function addWorkUpdate(userId: string, input: { date: string; summary: string; minutes?: number; projectId?: string; taskId?: string }) {
  await requireEmployee(userId);
  const date = dateOnly(input.date);
  const today = todayIst();
  if (date > today || date.getTime() < today.getTime() - 7 * DAY) {
    throw ApiError.validation([{ field: 'date', message: 'Updates can be logged for today or the previous 7 days' }]);
  }
  if (input.projectId) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: input.projectId, userId } } });
    if (!member) throw ApiError.validation([{ field: 'projectId', message: 'You are not a member of this project' }]);
  }
  if (input.taskId) {
    const task = await prisma.task.findFirst({ where: { id: input.taskId, assigneeId: userId } });
    if (!task) throw ApiError.validation([{ field: 'taskId', message: 'Choose one of your own tasks' }]);
  }
  return prisma.workUpdate.create({
    data: { employeeId: userId, date, summary: input.summary.trim(), minutes: input.minutes ?? null, projectId: input.projectId ?? null, taskId: input.taskId ?? null },
  });
}

// ---------------------------------------------------------------------------
// Documents, HR requests, announcements
// ---------------------------------------------------------------------------

export async function myDocuments(userId: string) {
  await requireEmployee(userId);
  const docs = await prisma.employeeDocument.findMany({
    where: { employeeId: userId, visibleToEmployee: true, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { file: true },
  });
  return docs.map((d) => ({ id: d.id, title: d.title, category: d.category, createdAt: d.createdAt, file: publicFile(d.file) }));
}

export async function listHrRequests(userId: string) {
  await requireEmployee(userId);
  return prisma.hrRequest.findMany({
    where: { employeeId: userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, category: true, subject: true, message: true, status: true, response: true, respondedAt: true, createdAt: true },
  });
}

export async function createHrRequest(userId: string, input: { category: 'GENERAL' | 'PAYROLL' | 'LEAVE' | 'IT' | 'DOCUMENT' | 'OTHER'; subject: string; message: string }) {
  await requireEmployee(userId);
  const req = await prisma.hrRequest.create({ data: { employeeId: userId, category: input.category, subject: input.subject.trim(), message: input.message.trim() } });
  await emitAdminEvent({
    dedupeKey: `hr.request:${req.id}`,
    category: 'hr',
    severity: input.category === 'PAYROLL' ? 'important' : 'info',
    title: `HR request (${input.category.toLowerCase()})`,
    body: req.subject.slice(0, 200),
    link: '/hr-requests',
    entityType: 'HrRequest',
    entityId: req.id,
  });
  return req;
}

export async function announcements() {
  return prisma.companyAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, body: true, createdAt: true } });
}
