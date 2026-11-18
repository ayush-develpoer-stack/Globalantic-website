import { Router, type Request } from 'express';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { pageArgs, paged } from '../lib/pagination';
import { safeEqual } from '../lib/crypto';
import { env } from '../config/env';
import * as crm from '../services/crm.service';
import { idParam } from '../validators/training';
import * as v from '../validators/crm';

/**
 * Sales CRM: /api/crm/*
 * leads.manage (ADMIN, SALES, or an individual grant). Non-admins only see leads assigned to them or unassigned.
 * Assignment rules and manual reminder runs are admin-only (users.manage).
 */
type PageQ = { page: number; pageSize: number };
const query = <T>(req: Request) => req.query as unknown as T & PageQ;
const byId = validate(idParam, 'params');

const router = Router();

// Scheduler entry point (e.g. a daily cron job): authenticated by CRON_SECRET, not by a session.
router.post(
  '/reminders/dispatch',
  asyncHandler(async (req, res) => {
    const given = req.get('x-cron-secret') ?? '';
    if (!env.cronSecret || !given || !safeEqual(given, env.cronSecret)) throw ApiError.notFound('Route not found');
    sendSuccess(res, await crm.dispatchReminders(null), 'Reminders dispatched');
  }),
);

router.use(requireAuth, requirePermission('leads.manage'));

router.get('/summary', validate(v.reportQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, await crm.summary(actorOf(req), req.query as never))));
router.get('/assignees', asyncHandler(async (_req, res) => sendSuccess(res, await crm.assignees())));

router.get('/leads', validate(v.leadListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<crm.LeadListQuery>(req);
  const { items, total } = await crm.listLeads(actorOf(req), { ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.get('/leads/export', validate(v.leadListQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, { rows: await crm.exportLeads(actorOf(req), req.query as never) })));
router.post('/leads', validate(v.manualLeadSchema), asyncHandler(async (req, res) => sendSuccess(res, await crm.createManualLead(actorOf(req), req.body), 'Lead added', 201)));
router.get('/leads/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await crm.getLead(actorOf(req), req.params.id))));
router.patch('/leads/:id', byId, validate(v.leadUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await crm.updateLead(actorOf(req), req.params.id, req.body), 'Lead updated')));
router.post('/leads/:id/notes', byId, validate(v.noteSchema), asyncHandler(async (req, res) => sendSuccess(res, await crm.addNote(actorOf(req), req.params.id, req.body.body, req.body.type), 'Saved', 201)));

router.get('/rules', asyncHandler(async (_req, res) => sendSuccess(res, await crm.getRules())));
router.put('/rules', requirePermission('users.manage'), validate(v.ruleSchema), asyncHandler(async (req, res) => sendSuccess(res, await crm.setRules(actorOf(req), req.body.rules), 'Assignment rules saved')));
router.post('/reminders/run', requirePermission('users.manage'), asyncHandler(async (req, res) => sendSuccess(res, await crm.dispatchReminders(actorOf(req)), 'Reminders sent')));

export default router;
