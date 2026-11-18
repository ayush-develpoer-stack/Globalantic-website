import { Router, type Request } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { sendPdf } from '../utils/sendPdf';
import { pageArgs, paged } from '../lib/pagination';
import { prisma } from '../config/database';
import * as docs from '../services/document.service';
import * as profile from '../services/business-profile.service';
import { idParam, reasonSchema } from '../validators/training';
import * as v from '../validators/document';

/**
 * Business documents: /api/documents/*
 * documents.read to view; documents.manage (quotations, proposals, agreements) or documents.finance
 * (invoices, receipts) to change — the type rule is enforced again in the service. Company details,
 * numbering and templates need documents.settings (ADMIN only, not grantable).
 */
type PageQ = { page: number; pageSize: number };
const router = Router();
router.use(requireAuth, requirePermission('documents.read'));
const write = requireAnyPermission('documents.manage', 'documents.finance');
const settings = requirePermission('documents.settings');
const byId = validate(idParam, 'params');
const q = <T>(req: Request) => req.query as unknown as T & PageQ;

// Company profile (printed on every document)
router.get('/profile', asyncHandler(async (_req, res) => {
  const p = await profile.getProfile();
  sendSuccess(res, { ...p, gaps: profile.profileGaps(p), gstAvailable: profile.gstAvailable(p), numbering: profile.numberingRules(p) });
}));
router.put('/profile', settings, validate(v.profileSchema), asyncHandler(async (req, res) => sendSuccess(res, await profile.updateProfile(actorOf(req), req.body), 'Company details saved')));

// Clients
router.get('/clients', validate(v.clientListQuery, 'query'), asyncHandler(async (req, res) => {
  const query = q<{ search?: string; includeArchived?: boolean }>(req);
  const { items, total } = await docs.listClients({ ...query, ...pageArgs(query) });
  sendSuccess(res, paged(items, total, query));
}));
router.post('/clients', write, validate(v.clientSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.saveClient(actorOf(req), null, req.body), 'Client added', 201)));
router.post('/clients/from-lead', write, validate(v.fromLeadSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.clientFromLead(actorOf(req), req.body.leadId), 'Client ready')));
router.get('/clients/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await docs.getClient(actorOf(req), req.params.id))));
router.put('/clients/:id', write, byId, validate(v.clientSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.saveClient(actorOf(req), req.params.id, req.body), 'Client saved')));
router.patch('/clients/:id/archive', write, byId, validate(v.archiveSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.archiveClient(actorOf(req), req.params.id, req.body.archived))));

// Templates
router.get('/templates', validate(v.templateListQuery, 'query'), asyncHandler(async (req, res) => {
  const t = req.query as { type?: never; includeArchived?: boolean };
  sendSuccess(res, await docs.listTemplates(t.type, t.includeArchived));
}));
router.post('/templates', settings, validate(v.templateSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.saveTemplate(actorOf(req), null, req.body), 'Template created', 201)));
router.put('/templates/:id', settings, byId, validate(v.templateSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.saveTemplate(actorOf(req), req.params.id, req.body), 'Template saved')));
router.patch('/templates/:id/archive', settings, byId, validate(v.archiveSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.archiveTemplate(actorOf(req), req.params.id, req.body.archived))));

// Recent document / receipt emails (delivery troubleshooting)
router.get('/email-log', requireAnyPermission('documents.finance', 'payments.read'), asyncHandler(async (_req, res) => {
  sendSuccess(res, await prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, kind: true, to: true, subject: true, status: true, error: true, entityType: true, entityId: true, createdAt: true } }));
}));

// Documents
router.get('/', validate(v.documentListQuery, 'query'), asyncHandler(async (req, res) => {
  const query = q<Parameters<typeof docs.listDocuments>[1]>(req);
  const { items, total, summary } = await docs.listDocuments(actorOf(req), { ...query, ...pageArgs(query) });
  sendSuccess(res, { ...paged(items, total, query), summary });
}));
router.post('/', write, validate(v.documentCreateSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.createDraft(actorOf(req), req.body), 'Draft created', 201)));
router.get('/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await docs.getDocument(actorOf(req), req.params.id))));
router.patch('/:id', write, byId, validate(v.documentUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.updateDraft(actorOf(req), req.params.id, req.body), 'Draft saved')));
router.delete('/:id', write, byId, asyncHandler(async (req, res) => sendSuccess(res, await docs.deleteDraft(actorOf(req), req.params.id), 'Draft deleted')));
router.get('/:id/pdf', byId, asyncHandler(async (req, res) => sendPdf(res, await docs.documentPdf(actorOf(req), req.params.id), req.query.download ? 'attachment' : 'inline')));
router.post('/:id/issue', write, byId, asyncHandler(async (req, res) => sendSuccess(res, await docs.issue(actorOf(req), req.params.id), 'Document issued')));
router.post('/:id/send', write, byId, validate(v.sendSchema), asyncHandler(async (req, res) => {
  const r = await docs.send(actorOf(req), req.params.id, req.body);
  sendSuccess(res, r, r.delivery === 'SENT' ? 'Email sent' : r.delivery === 'SKIPPED' ? 'Email is not configured — nothing was sent' : 'The email could not be delivered');
}));
router.post('/:id/outcome', write, byId, validate(v.outcomeSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.recordOutcome(actorOf(req), req.params.id, req.body), 'Outcome recorded')));
router.post('/:id/convert', write, byId, validate(v.convertSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.convert(actorOf(req), req.params.id, req.body.target), 'Draft created', 201)));
router.post('/:id/revise', write, byId, asyncHandler(async (req, res) => sendSuccess(res, await docs.revise(actorOf(req), req.params.id), 'Revision draft ready', 201)));
router.post('/:id/signed', write, byId, validate(v.signedSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.recordSigned(actorOf(req), req.params.id, req.body), 'Signed copy recorded')));
router.get('/:id/signed-copy', byId, asyncHandler(async (req, res) => {
  const f = await docs.signedCopy(actorOf(req), req.params.id);
  res.setHeader('Content-Type', f.file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="signed-${f.file.originalName.replace(/[^A-Za-z0-9._-]+/g, '-')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(f.data);
}));
router.post('/:id/payments', requirePermission('documents.finance'), byId, validate(v.paymentSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.recordPayment(actorOf(req), req.params.id, req.body), 'Payment recorded', 201)));
router.post('/:id/void', write, byId, validate(reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await docs.voidDocument(actorOf(req), req.params.id, req.body.reason), 'Document voided')));

export default router;
