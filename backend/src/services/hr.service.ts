import type { EmployeeAttendanceStatus, EmployeeDocumentCategory, EmploymentType, Prisma, ProjectStatus, SupportStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { orderByFrom } from '../lib/pagination';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { createStaffUser, setUserStatus, type StaffRole } from './auth.service';
import { AfterCommit, notify } from './notification.service';
import { assertAttachable, publicFile } from './file.service';
import { dateOnly } from './employee.service';

/**
 * HR / admin management of employees (/api/hr/*). Every route is permission
 * gated (employees.*, leave.approve, projects.manage, hr.requests.manage,
 * company.announcements.manage) and every change is audited.
 */

const EMPLOYEE_ROLES = ['EMPLOYEE', 'HR', 'TRAINER', 'FINANCE', 'EDITOR', 'SALES', 'ADMIN'] as const;

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface EmployeeInput {
  name: string;
  email: string;
  phone?: string;
  /** HR's own route allows EMPLOYEE | HR; users.service may pass any staff role. */
  role?: StaffRole;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  joiningDate: string;
  managerId?: string | null;
  workLocation?: string | null;
}

async function assertManager(db: Prisma.TransactionClient | typeof prisma, managerId: string | null | undefined) {
  if (!managerId) return;
  const m = await db.user.findUnique({ where: { id: managerId }, select: { status: true, role: true, deletedAt: true } });
  if (!m || m.deletedAt || m.status !== 'ACTIVE' || !(EMPLOYEE_ROLES as readonly string[]).includes(m.role)) {
    throw ApiError.validation([{ field: 'managerId', message: 'Choose an active staff member as manager' }]);
  }
}

export async function createEmployee(actor: Actor, input: EmployeeInput, onToken?: (token: string) => void) {
  await assertManager(prisma, input.managerId);
  const user = await createStaffUser(actor, { name: input.name, email: input.email, phone: input.phone, role: input.role ?? 'EMPLOYEE' }, async (tx, userId) => {
    await tx.employeeProfile.create({
      data: {
        userId,
        employeeCode: await nextNumber(tx, 'EMP'),
        department: input.department.trim(),
        designation: input.designation.trim(),
        employmentType: input.employmentType,
        joiningDate: dateOnly(input.joiningDate),
        managerId: input.managerId ?? null,
        workLocation: input.workLocation ?? null,
      },
    });
  }, onToken);
  return { ...(await getEmployee(user.id)), inviteEmail: user.inviteEmail };
}

export async function listEmployees(q: { search?: string; department?: string; sort?: string; skip: number; take: number }) {
  const where: Prisma.EmployeeProfileWhereInput = {
    ...(q.department ? { department: q.department } : {}),
    ...(q.search
      ? {
          OR: [
            { employeeCode: { contains: q.search, mode: 'insensitive' } },
            { designation: { contains: q.search, mode: 'insensitive' } },
            { user: { name: { contains: q.search, mode: 'insensitive' } } },
            { user: { email: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total, departments] = await Promise.all([
    prisma.employeeProfile.findMany({
      where,
      orderBy: orderByFrom<Prisma.EmployeeProfileOrderByWithRelationInput>(q.sort, { employeeCode: (d) => ({ employeeCode: d }), name: (d) => ({ user: { name: d } }), department: (d) => ({ department: d }), joiningDate: (d) => ({ joiningDate: d }) }, { employeeCode: 'asc' }),
      skip: q.skip,
      take: q.take,
      include: { user: { select: { id: true, name: true, email: true, role: true, status: true } }, manager: { select: { id: true, name: true } } },
    }),
    prisma.employeeProfile.count({ where }),
    prisma.employeeProfile.findMany({ distinct: ['department'], select: { department: true }, orderBy: { department: 'asc' } }),
  ]);
  return { items, total, departments: departments.map((d) => d.department) };
}

export async function getEmployee(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      lastLoginAt: true,
      employeeProfile: { include: { manager: { select: { id: true, name: true } } } },
    },
  });
  if (!user?.employeeProfile) throw ApiError.notFound('Employee not found');
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [attendance, leaves, tasks, documents, requests] = await Promise.all([
    prisma.employeeAttendance.findMany({ where: { employeeId: userId, date: { gte: since } }, orderBy: { date: 'desc' } }),
    prisma.leaveRequest.findMany({ where: { employeeId: userId }, orderBy: { startDate: 'desc' }, take: 50 }),
    prisma.task.findMany({ where: { assigneeId: userId }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], take: 50, include: { project: { select: { id: true, name: true } } } }),
    prisma.employeeDocument.findMany({ where: { employeeId: userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { file: true } }),
    prisma.hrRequest.findMany({ where: { employeeId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return {
    ...user,
    attendance,
    leaves,
    tasks,
    documents: documents.map(({ file, ...d }) => ({ ...d, file: publicFile(file) })),
    hrRequests: requests,
  };
}

export async function updateEmployee(
  actor: Actor,
  userId: string,
  input: Partial<Omit<EmployeeInput, 'name' | 'email' | 'phone' | 'role'>> & { name?: string; exitDate?: string | null },
  reason: string,
) {
  await assertManager(prisma, input.managerId);
  if (input.managerId && input.managerId === userId) throw ApiError.validation([{ field: 'managerId', message: 'An employee cannot manage themselves' }]);
  return prisma.$transaction(async (tx) => {
    const before = await tx.employeeProfile.findUnique({ where: { userId } });
    if (!before) throw ApiError.notFound('Employee not found');
    const { name, joiningDate, exitDate, ...rest } = input;
    const data: Prisma.EmployeeProfileUncheckedUpdateInput = {
      ...rest,
      ...(joiningDate ? { joiningDate: dateOnly(joiningDate) } : {}),
      ...(exitDate !== undefined ? { exitDate: exitDate ? dateOnly(exitDate) : null } : {}),
    };
    const after = await tx.employeeProfile.update({ where: { userId }, data });
    if (name) await tx.user.update({ where: { id: userId }, data: { name: name.trim() } });
    await audit(tx, actor, {
      action: 'employee.updated',
      entityType: 'User',
      entityId: userId,
      before: Object.fromEntries(Object.keys(data).map((k) => [k, (before as never)[k]])),
      after: { ...Object.fromEntries(Object.keys(data).map((k) => [k, (after as never)[k]])), ...(name ? { name } : {}) },
      reason,
    });
    return { id: userId };
  });
}

/** HR correction of a day's attendance (before/after audited). */
export async function correctAttendance(actor: Actor, userId: string, input: { date: string; status: EmployeeAttendanceStatus; notes?: string | null }, reason: string) {
  const date = dateOnly(input.date);
  return prisma.$transaction(async (tx) => {
    if (!(await tx.employeeProfile.findUnique({ where: { userId }, select: { id: true } }))) throw ApiError.notFound('Employee not found');
    const before = await tx.employeeAttendance.findUnique({ where: { employeeId_date: { employeeId: userId, date } } });
    const record = await tx.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId: userId, date } },
      update: { status: input.status, notes: input.notes ?? before?.notes ?? null, correctedById: actor.id },
      create: { employeeId: userId, date, status: input.status, notes: input.notes ?? null, correctedById: actor.id },
    });
    await audit(tx, actor, {
      action: 'employee.attendance_corrected',
      entityType: 'EmployeeAttendance',
      entityId: record.id,
      before: before ? { status: before.status, notes: before.notes } : null,
      after: { status: record.status, notes: record.notes },
      reason,
    });
    return record;
  });
}

// ---------------------------------------------------------------------------
// Leave approvals
// ---------------------------------------------------------------------------

export async function listLeaveRequests(q: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; skip: number; take: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
      skip: q.skip,
      take: q.take,
      include: { employee: { select: { id: true, name: true, email: true, employeeProfile: { select: { employeeCode: true, department: true } } } } },
    }),
    prisma.leaveRequest.count({ where }),
  ]);
  return { items, total };
}

export async function reviewLeave(actor: Actor, leaveId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const leave = await tx.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) throw ApiError.notFound('Leave request not found');
    if (leave.employeeId === actor.id) throw ApiError.forbidden('You cannot review your own leave request');
    if (decision === 'REJECT' && !note?.trim()) throw ApiError.validation([{ field: 'note', message: 'A reason is required to reject' }]);
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const res = await tx.leaveRequest.updateMany({
      where: { id: leaveId, status: 'PENDING' },
      data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note?.trim() || null },
    });
    if (res.count !== 1) throw ApiError.conflict(`A ${leave.status.toLowerCase()} request cannot be reviewed again`);
    await audit(tx, actor, { action: `leave.${status.toLowerCase()}`, entityType: 'LeaveRequest', entityId: leaveId, before: { status: 'PENDING' }, after: { status }, reason: note ?? null });
    await notify(
      tx,
      leave.employeeId,
      {
        type: 'LEAVE',
        title: status === 'APPROVED' ? 'Leave approved' : 'Leave not approved',
        body: `Your ${leave.type.toLowerCase()} leave (${leave.startDate.toISOString().slice(0, 10)} – ${leave.endDate.toISOString().slice(0, 10)}) was ${status.toLowerCase()}.${note ? ` Note: ${note}` : ''}`,
        link: `${env.employeePortalUrl}/leave`,
        email: true,
      },
      after,
    );
    return tx.leaveRequest.findUniqueOrThrow({ where: { id: leaveId } });
  });
  await after.flush();
  return result;
}

// ---------------------------------------------------------------------------
// Projects & tasks
// ---------------------------------------------------------------------------

export async function listProjects(q: { status?: ProjectStatus; search?: string }) {
  return prisma.project.findMany({
    where: { ...(q.status ? { status: q.status } : {}), ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { members: true, tasks: true } } },
  });
}

export async function getProject(id: string) {
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      tasks: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], include: { assignee: { select: { id: true, name: true } } } },
    },
  });
  if (!p) throw ApiError.notFound('Project not found');
  return p;
}

export async function createProject(actor: Actor, input: { code: string; name: string; description?: string | null; status?: ProjectStatus; startDate?: string | null; endDate?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description ?? null,
        status: input.status ?? 'ACTIVE',
        startDate: input.startDate ? dateOnly(input.startDate) : null,
        endDate: input.endDate ? dateOnly(input.endDate) : null,
        createdById: actor.id,
      },
    });
    await audit(tx, actor, { action: 'project.created', entityType: 'Project', entityId: p.id, after: { code: p.code } });
    return p;
  });
}

export async function updateProject(actor: Actor, id: string, input: { name?: string; description?: string | null; status?: ProjectStatus; startDate?: string | null; endDate?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.project.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Project not found');
    const p = await tx.project.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate ? dateOnly(input.startDate) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? dateOnly(input.endDate) : null } : {}),
      },
    });
    await audit(tx, actor, { action: 'project.updated', entityType: 'Project', entityId: id, before: { status: before.status }, after: { status: p.status } });
    return p;
  });
}

export async function addProjectMember(actor: Actor, projectId: string, userId: string, role?: string | null) {
  return prisma.$transaction(async (tx) => {
    const [project, user] = await Promise.all([
      tx.project.findUnique({ where: { id: projectId } }),
      tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true, employeeProfile: { select: { id: true } } } }),
    ]);
    if (!project) throw ApiError.notFound('Project not found');
    if (!user || user.status !== 'ACTIVE' || !user.employeeProfile) {
      throw ApiError.validation([{ field: 'userId', message: 'Choose an active employee' }]);
    }
    const m = await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId } }, update: { role: role ?? null }, create: { projectId, userId, role: role ?? null } });
    await audit(tx, actor, { action: 'project.member_added', entityType: 'Project', entityId: projectId, after: { userId, role } });
    return m;
  });
}

export async function removeProjectMember(actor: Actor, projectId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.task.count({ where: { projectId, assigneeId: userId, status: { not: 'DONE' } } });
    if (open) throw ApiError.conflict('Reassign or close this member’s open tasks first');
    const res = await tx.projectMember.deleteMany({ where: { projectId, userId } });
    if (!res.count) throw ApiError.notFound('Member not found');
    await audit(tx, actor, { action: 'project.member_removed', entityType: 'Project', entityId: projectId, after: { userId } });
    return { removed: true };
  });
}

export interface TaskInput {
  title: string;
  description?: string | null;
  assigneeId: string;
  projectId?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
}

async function assertAssignee(tx: Prisma.TransactionClient, assigneeId: string, projectId: string | null | undefined) {
  const user = await tx.user.findUnique({ where: { id: assigneeId }, select: { status: true, employeeProfile: { select: { id: true } } } });
  if (!user || user.status !== 'ACTIVE' || !user.employeeProfile) {
    throw ApiError.validation([{ field: 'assigneeId', message: 'Choose an active employee' }]);
  }
  if (projectId && !(await tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: assigneeId } } }))) {
    throw ApiError.validation([{ field: 'assigneeId', message: 'The assignee must be a member of the project' }]);
  }
}

export async function createTask(actor: Actor, input: TaskInput) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    await assertAssignee(tx, input.assigneeId, input.projectId);
    const t = await tx.task.create({
      data: {
        title: input.title.trim(),
        description: input.description ?? null,
        assigneeId: input.assigneeId,
        projectId: input.projectId ?? null,
        priority: input.priority ?? 'MEDIUM',
        status: input.status ?? 'TODO',
        dueDate: input.dueDate ? dateOnly(input.dueDate) : null,
        createdById: actor.id,
      },
    });
    await audit(tx, actor, { action: 'task.created', entityType: 'Task', entityId: t.id, after: { assigneeId: t.assigneeId } });
    await notify(tx, t.assigneeId, { type: 'TASK', title: 'New task assigned', body: t.title, link: `${env.employeePortalUrl}/tasks` }, after);
    return t;
  });
  await after.flush();
  return result;
}

export async function updateTask(actor: Actor, id: string, input: Partial<TaskInput>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.task.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound('Task not found');
    if (input.assigneeId || input.projectId !== undefined) {
      await assertAssignee(tx, input.assigneeId ?? before.assigneeId, input.projectId !== undefined ? input.projectId : before.projectId);
    }
    const t = await tx.task.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status, completedAt: input.status === 'DONE' ? new Date() : null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? dateOnly(input.dueDate) : null } : {}),
      },
    });
    await audit(tx, actor, { action: 'task.updated', entityType: 'Task', entityId: id, before: { status: before.status, assigneeId: before.assigneeId }, after: { status: t.status, assigneeId: t.assigneeId } });
    return t;
  });
}

export async function listTasks(q: { projectId?: string; assigneeId?: string; status?: TaskStatus; skip: number; take: number }) {
  const where: Prisma.TaskWhereInput = { ...(q.projectId ? { projectId: q.projectId } : {}), ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}), ...(q.status ? { status: q.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], skip: q.skip, take: q.take, include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } } }),
    prisma.task.count({ where }),
  ]);
  return { items, total };
}

export async function teamWorkUpdates(q: { employeeId?: string; projectId?: string; skip: number; take: number }) {
  const where: Prisma.WorkUpdateWhereInput = { ...(q.employeeId ? { employeeId: q.employeeId } : {}), ...(q.projectId ? { projectId: q.projectId } : {}) };
  const [items, total] = await Promise.all([
    prisma.workUpdate.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: q.skip, take: q.take, include: { employee: { select: { id: true, name: true } }, project: { select: { name: true } }, task: { select: { title: true } } } }),
    prisma.workUpdate.count({ where }),
  ]);
  return { items, total };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function addEmployeeDocument(actor: Actor, userId: string, input: { title: string; category: EmployeeDocumentCategory; fileId: string; visibleToEmployee: boolean }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    if (!(await tx.employeeProfile.findUnique({ where: { userId }, select: { id: true } }))) throw ApiError.notFound('Employee not found');
    await assertAttachable(tx, actor.id, input.fileId, 'EMPLOYEE_DOCUMENT');
    const doc = await tx.employeeDocument.create({
      data: { employeeId: userId, title: input.title.trim(), category: input.category, fileId: input.fileId, visibleToEmployee: input.visibleToEmployee, uploadedById: actor.id },
    });
    await audit(tx, actor, { action: 'employee.document_added', entityType: 'EmployeeDocument', entityId: doc.id, after: { employeeId: userId, category: doc.category, visibleToEmployee: doc.visibleToEmployee } });
    if (doc.visibleToEmployee) {
      await notify(tx, userId, { type: 'DOCUMENT', title: 'New document available', body: doc.title, link: `${env.employeePortalUrl}/documents` }, after);
    }
    return doc;
  });
  await after.flush();
  return result;
}

export async function updateEmployeeDocument(actor: Actor, docId: string, input: { visibleToEmployee?: boolean; remove?: boolean }, reason: string) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.employeeDocument.findFirst({ where: { id: docId, deletedAt: null } });
    if (!doc) throw ApiError.notFound('Document not found');
    const updated = await tx.employeeDocument.update({
      where: { id: docId },
      data: { ...(input.visibleToEmployee !== undefined ? { visibleToEmployee: input.visibleToEmployee } : {}), ...(input.remove ? { deletedAt: new Date() } : {}) },
    });
    await audit(tx, actor, {
      action: input.remove ? 'employee.document_removed' : 'employee.document_updated',
      entityType: 'EmployeeDocument',
      entityId: docId,
      before: { visibleToEmployee: doc.visibleToEmployee },
      after: { visibleToEmployee: updated.visibleToEmployee, removed: Boolean(input.remove) },
      reason,
    });
    return { id: docId };
  });
}

// ---------------------------------------------------------------------------
// HR requests & announcements
// ---------------------------------------------------------------------------

export async function listAllHrRequests(q: { status?: SupportStatus; skip: number; take: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.hrRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: q.skip, take: q.take, include: { employee: { select: { id: true, name: true, email: true } } } }),
    prisma.hrRequest.count({ where }),
  ]);
  return { items, total };
}

export async function respondHrRequest(actor: Actor, id: string, input: { status: 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; response?: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.hrRequest.findUnique({ where: { id } });
    if (!req) throw ApiError.notFound('HR request not found');
    if (req.employeeId === actor.id) throw ApiError.forbidden('You cannot respond to your own HR request');
    const updated = await tx.hrRequest.update({
      where: { id },
      data: { status: input.status, ...(input.response ? { response: input.response, respondedById: actor.id, respondedAt: new Date() } : {}) },
    });
    await audit(tx, actor, { action: 'hr_request.updated', entityType: 'HrRequest', entityId: id, before: { status: req.status }, after: { status: input.status } });
    if (input.response) {
      await notify(tx, req.employeeId, { type: 'HR_REQUEST', title: `HR: ${req.subject}`, body: input.response.slice(0, 300), link: `${env.employeePortalUrl}/hr-requests`, email: true }, after);
    }
    return updated;
  });
  await after.flush();
  return result;
}

export async function postCompanyAnnouncement(actor: Actor, input: { title: string; body: string }) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.companyAnnouncement.create({ data: { title: input.title.trim(), body: input.body.trim(), createdById: actor.id } });
    await audit(tx, actor, { action: 'company_announcement.posted', entityType: 'CompanyAnnouncement', entityId: a.id });
    const staff = await tx.employeeProfile.findMany({ where: { exitDate: null, user: { status: 'ACTIVE' } }, select: { userId: true } });
    for (const s of staff) await notify(tx, s.userId, { type: 'ANNOUNCEMENT', title: a.title, body: a.body.slice(0, 300), link: `${env.employeePortalUrl}/announcements` }, after);
    return a;
  });
  await after.flush();
  return result;
}

export async function listCompanyAnnouncements() {
  return prisma.companyAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
}

/**
 * HR can suspend / reactivate EMPLOYEE and HR accounts that have an employee
 * profile (never ADMIN, never themselves). Suspension revokes all sessions.
 */
export async function setEmployeeStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, employeeProfile: { select: { id: true } } } });
  if (!target?.employeeProfile) throw ApiError.notFound('Employee not found');
  if (!['EMPLOYEE', 'HR'].includes(target.role)) throw ApiError.forbidden('Only employee and HR accounts can be changed here');
  return setUserStatus(actor, userId, status, reason);
}
