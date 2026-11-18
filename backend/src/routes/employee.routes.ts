import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as emp from '../services/employee.service';
import { idParam } from '../validators/training';
import * as v from '../validators/employee';

/**
 * Employee self-service: /api/employee/*
 * EMPLOYEE role; everything is scoped to req.user.sub inside the service.
 */
const router = Router();
router.use(requireAuth, requirePermission('employee.portal'));

const me = (req: { user?: { sub: string } }) => req.user!.sub;
const byId = validate(idParam, 'params');

router.get('/dashboard', asyncHandler(async (req, res) => sendSuccess(res, await emp.dashboard(me(req)))));
router.get('/profile', asyncHandler(async (req, res) => sendSuccess(res, await emp.getMe(me(req)))));
router.put('/profile', validate(v.employeeSelfUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.updateMe(me(req), req.body), 'Profile updated')));

router.get('/attendance', validate(v.monthQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, await emp.attendanceHistory(me(req), req.query.month as string | undefined))));
router.post('/attendance/check-in', userWriteLimiter, validate(v.checkInSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.checkIn(me(req), req.body), 'Checked in', 201)));
router.post('/attendance/check-out', userWriteLimiter, asyncHandler(async (req, res) => sendSuccess(res, await emp.checkOut(me(req)), 'Checked out')));

router.get('/leave', asyncHandler(async (req, res) => sendSuccess(res, await emp.listLeaves(me(req)))));
router.post('/leave', userWriteLimiter, validate(v.leaveSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.applyLeave(me(req), req.body), 'Leave requested', 201)));
router.post('/leave/:id/cancel', byId, asyncHandler(async (req, res) => sendSuccess(res, await emp.cancelLeave(me(req), req.params.id), 'Leave cancelled')));

router.get('/projects', asyncHandler(async (req, res) => sendSuccess(res, await emp.myProjects(me(req)))));
router.get('/projects/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await emp.myProject(me(req), req.params.id))));
router.get('/tasks', validate(v.taskQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, await emp.myTasks(me(req), req.query.status as never))));
router.patch('/tasks/:id/status', byId, validate(v.taskStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.updateMyTaskStatus(me(req), req.params.id, req.body.status), 'Task updated')));

router.get('/work-updates', asyncHandler(async (req, res) => sendSuccess(res, await emp.listWorkUpdates(me(req)))));
router.post('/work-updates', userWriteLimiter, validate(v.workUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.addWorkUpdate(me(req), req.body), 'Update saved', 201)));

router.get('/documents', asyncHandler(async (req, res) => sendSuccess(res, await emp.myDocuments(me(req)))));
router.get('/hr-requests', asyncHandler(async (req, res) => sendSuccess(res, await emp.listHrRequests(me(req)))));
router.post('/hr-requests', userWriteLimiter, validate(v.hrRequestSchema), asyncHandler(async (req, res) => sendSuccess(res, await emp.createHrRequest(me(req), req.body), 'Request sent', 201)));
router.get('/announcements', asyncHandler(async (_req, res) => sendSuccess(res, await emp.announcements())));

export default router;
