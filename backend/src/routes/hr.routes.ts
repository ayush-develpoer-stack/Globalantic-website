import { Router, type Request } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, actorOf } from '../middleware/auth.middleware';
import { ApiError } from '../utils/ApiError';
import * as platform from '../services/admin-platform.service';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { pageArgs, paged } from '../lib/pagination';
import * as hr from '../services/hr.service';
import * as users from '../services/users.service';
import { idParam } from '../validators/training';
import * as v from '../validators/employee';
import { inviteMessage } from '../services/auth.service';

/**
 * HR / staff management: /api/hr/*   and platform admin: /api/platform/*
 * Permission per route (see lib/permissions.ts).
 */
type PageQ = { page: number; pageSize: number };
const query = <T>(req: Request) => req.query as unknown as T & PageQ;
const P = requirePermission;
const PA = requireAnyPermission;
const byId = validate(idParam, 'params');

export const hrRouter = Router();
hrRouter.use(requireAuth);

// Employees
hrRouter.get('/employees', P('employees.read'), validate(v.employeeListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ search?: string; department?: string }>(req);
  const { items, total, departments } = await hr.listEmployees({ ...q, ...pageArgs(q) });
  sendSuccess(res, { ...paged(items, total, q), departments });
}));
hrRouter.post('/employees', P('employees.manage'), validate(v.employeeCreateSchema), asyncHandler(async (req, res) => {
  const created = await hr.createEmployee(actorOf(req), req.body);
  sendSuccess(res, created, inviteMessage('Employee created', created.inviteEmail), 201);
}));
hrRouter.get('/employees/:id', P('employees.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await hr.getEmployee(req.params.id))));
hrRouter.patch('/employees/:id/status', P('employees.manage'), byId, validate(v.employeeStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.setEmployeeStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Employee status updated')));
hrRouter.put('/employees/:id', P('employees.manage'), byId, validate(v.employeeUpdateSchema), asyncHandler(async (req, res) => {
  const { reason, ...input } = req.body as { reason: string };
  sendSuccess(res, await hr.updateEmployee(actorOf(req), req.params.id, input, reason), 'Employee updated');
}));
hrRouter.put('/employees/:id/attendance', P('employees.manage'), byId, validate(v.attendanceCorrectionSchema), asyncHandler(async (req, res) => {
  const { reason, ...input } = req.body as { reason: string; date: string; status: never; notes?: string | null };
  sendSuccess(res, await hr.correctAttendance(actorOf(req), req.params.id, input, reason), 'Attendance corrected');
}));
hrRouter.post('/employees/:id/documents', P('employees.manage'), byId, validate(v.documentSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.addEmployeeDocument(actorOf(req), req.params.id, req.body), 'Document added', 201)));
hrRouter.patch('/documents/:id', P('employees.manage'), byId, validate(v.documentUpdateSchema), asyncHandler(async (req, res) => {
  const { reason, ...input } = req.body as { reason: string; visibleToEmployee?: boolean; remove?: boolean };
  sendSuccess(res, await hr.updateEmployeeDocument(actorOf(req), req.params.id, input, reason), 'Document updated');
}));

// Leave
hrRouter.get('/leave', P('leave.approve'), validate(v.leaveListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never }>(req);
  const { items, total } = await hr.listLeaveRequests({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
hrRouter.post('/leave/:id/review', P('leave.approve'), byId, validate(v.leaveReviewSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.reviewLeave(actorOf(req), req.params.id, req.body.decision, req.body.note), 'Leave request updated')));

// Projects & tasks
hrRouter.get('/projects', P('projects.manage'), validate(v.projectQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, await hr.listProjects(req.query as never))));
hrRouter.post('/projects', P('projects.manage'), validate(v.projectSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.createProject(actorOf(req), req.body), 'Project created', 201)));
hrRouter.get('/projects/:id', P('projects.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await hr.getProject(req.params.id))));
hrRouter.put('/projects/:id', P('projects.manage'), byId, validate(v.projectUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.updateProject(actorOf(req), req.params.id, req.body), 'Project updated')));
hrRouter.post('/projects/:id/members', P('projects.manage'), byId, validate(v.memberSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.addProjectMember(actorOf(req), req.params.id, req.body.userId, req.body.role), 'Member added')));
hrRouter.delete('/projects/:id/members/:userId', P('projects.manage'), validate(v.memberParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await hr.removeProjectMember(actorOf(req), req.params.id, req.params.userId), 'Member removed')));
hrRouter.get('/tasks', P('projects.manage'), validate(v.taskListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ projectId?: string; assigneeId?: string; status?: never }>(req);
  const { items, total } = await hr.listTasks({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
hrRouter.post('/tasks', P('projects.manage'), validate(v.taskSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.createTask(actorOf(req), req.body), 'Task created', 201)));
hrRouter.put('/tasks/:id', P('projects.manage'), byId, validate(v.taskUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.updateTask(actorOf(req), req.params.id, req.body), 'Task updated')));
hrRouter.get('/work-updates', P('projects.manage'), validate(v.workUpdateListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ employeeId?: string; projectId?: string }>(req);
  const { items, total } = await hr.teamWorkUpdates({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));

// HR requests & announcements
hrRouter.get('/requests', P('hr.requests.manage'), validate(v.hrRequestListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never }>(req);
  const { items, total } = await hr.listAllHrRequests({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
hrRouter.put('/requests/:id', P('hr.requests.manage'), byId, validate(v.hrResponseSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.respondHrRequest(actorOf(req), req.params.id, req.body), 'Request updated')));
hrRouter.get('/announcements', P('company.announcements.manage'), asyncHandler(async (_req, res) => sendSuccess(res, await hr.listCompanyAnnouncements())));
hrRouter.post('/announcements', P('company.announcements.manage'), validate(v.companyAnnouncementSchema), asyncHandler(async (req, res) => sendSuccess(res, await hr.postCompanyAnnouncement(actorOf(req), req.body), 'Announcement posted', 201)));

// ---------------------------------------------------------------------------
export const platformRouter = Router();
platformRouter.use(requireAuth);

platformRouter.get('/users', P('users.manage'), validate(v.userListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ search?: string; role?: never; status?: never }>(req);
  const { items, total, roleCounts } = await users.listUsers({ ...q, ...pageArgs(q) });
  sendSuccess(res, { ...paged(items, total, q), roleCounts });
}));
platformRouter.patch('/users/:id/role', P('users.manage'), byId, validate(v.roleChangeSchema), asyncHandler(async (req, res) => sendSuccess(res, await users.changeRole(actorOf(req), req.params.id, req.body.role, req.body.reason), 'Role updated')));
platformRouter.get('/roles', PA('users.manage', 'employees.manage', 'training.students.manage'), asyncHandler(async (req, res) => sendSuccess(res, users.rolesMatrix(actorOf(req)))));
// Which roles each caller may create is decided in users.service.creatableRoles.
platformRouter.post('/users', PA('users.manage', 'employees.manage', 'training.students.manage'), validate(v.userCreateSchema), asyncHandler(async (req, res) => {
  const created = await users.createUser(actorOf(req), req.body);
  sendSuccess(res, created, inviteMessage('Account created', created.inviteEmail as Parameters<typeof inviteMessage>[1]), 201);
}));
platformRouter.patch('/users/:id/status', P('users.manage'), byId, validate(v.userStatusChangeSchema), asyncHandler(async (req, res) => sendSuccess(res, await users.changeStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Account status updated')));
platformRouter.get('/reports/summary', P('reports.read'), asyncHandler(async (_req, res) => sendSuccess(res, await users.summaryReport())));

// ---- Platform administration (2026-10-17) -----------------------------------
platformRouter.get('/overview', asyncHandler(async (req, res) => sendSuccess(res, await platform.overview(actorOf(req)))));
platformRouter.get('/permissions', P('users.manage'), asyncHandler(async (_req, res) => sendSuccess(res, platform.permissionCatalog())));
platformRouter.get('/users/:id', P('users.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await platform.getUserDetail(req.params.id))));
platformRouter.put('/users/:id', P('users.manage'), byId, validate(v.userBasicsSchema), asyncHandler(async (req, res) => {
  const { reason, ...input } = req.body as { reason: string; name?: string; phone?: string | null };
  sendSuccess(res, await platform.updateUserBasics(actorOf(req), req.params.id, input, reason), 'User updated');
}));
platformRouter.post('/users/:id/password-reset', P('users.manage'), byId, validate(v.passwordResetSchema), asyncHandler(async (req, res) => {
  const r = await platform.adminPasswordReset(actorOf(req), req.params.id, { revokeSessions: req.body.revokeSessions }, req.body.reason);
  sendSuccess(res, r, r.sent ? 'Password reset link sent' : `Reset link created but the email was not sent (${r.delivery === 'SKIPPED' ? 'email is not configured' : 'delivery failed'})`);
}));
platformRouter.post('/users/:id/permissions', P('users.manage'), byId, validate(v.grantSchema), asyncHandler(async (req, res) => sendSuccess(res, await platform.grantPermission(actorOf(req), req.params.id, req.body.permission, req.body.reason), 'Permission granted', 201)));
platformRouter.delete('/users/:id/permissions/:permission', P('users.manage'), validate(v.grantParam, 'params'), asyncHandler(async (req, res) => {
  const reason = typeof req.query.reason === 'string' && req.query.reason.trim().length >= 3 ? req.query.reason.trim().slice(0, 500) : null;
  if (!reason) throw ApiError.validation([{ field: 'reason', message: 'A reason is required' }]);
  sendSuccess(res, await platform.revokePermission(actorOf(req), req.params.id, req.params.permission, reason), 'Permission revoked');
}));
platformRouter.get('/users/:id/notes', PA('users.manage', 'training.students.manage', 'employees.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await platform.listNotes(actorOf(req), req.params.id))));
platformRouter.post('/users/:id/notes', PA('users.manage', 'training.students.manage', 'employees.manage'), byId, validate(v.noteSchema), asyncHandler(async (req, res) => sendSuccess(res, await platform.addNote(actorOf(req), req.params.id, req.body.body), 'Note added', 201)));
platformRouter.delete('/users/:id/notes/:noteId', PA('users.manage', 'training.students.manage', 'employees.manage'), validate(v.noteParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await platform.removeNote(actorOf(req), req.params.id, req.params.noteId), 'Note removed')));
platformRouter.get('/reports/:type', P('reports.read'), validate(v.reportParam, 'params'), validate(v.reportQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.query as { from?: string; to?: string; export?: string };
  const toDate = (d?: string) => (d ? new Date(`${d}T00:00:00.000Z`) : undefined);
  const to = q.to ? new Date(toDate(q.to)!.getTime() + 86_400_000) : undefined; // inclusive end date
  sendSuccess(res, await platform.runReport(actorOf(req), req.params.type as platform.ReportType, { from: toDate(q.from), to, exportCsv: q.export === 'true' }));
}));
