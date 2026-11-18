import { Router, type Request } from 'express';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { sendPdf } from '../utils/sendPdf';
import { pageArgs, paged } from '../lib/pagination';
import * as programs from '../services/program.service';
import * as payments from '../services/payment.service';
import { idParam, paymentFailureSchema, reasonSchema, slugParam, verifyPaymentSchema } from '../validators/training';
import * as v from '../validators/program';

/**
 * Certificate program API (separate from /api/training courses and /api/exams):
 *   /api/programs                 public catalogue
 *   /api/programs/student/*       student.portal (ids from the session only)
 *   /api/programs/admin/*         programs.read / programs.manage
 */
type PageQ = { page: number; pageSize: number };
const me = (req: Request) => req.user!.sub;

// ---------------------------------------------------------------- student
export const programStudentRouter = Router();
programStudentRouter.use(requireAuth, requirePermission('student.portal'));

programStudentRouter.post('/register', userWriteLimiter, validate(v.slugBody), asyncHandler(async (req, res) => {
  const r = await programs.register(me(req), req.body.slug);
  sendSuccess(res, r.enrollment, r.created ? 'Registered. Complete the payment to unlock the program.' : 'You are already registered', r.created ? 201 : 200);
}));
programStudentRouter.get('/enrollments', asyncHandler(async (req, res) => sendSuccess(res, await programs.myEnrollments(me(req)))));
programStudentRouter.get('/enrollments/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.myEnrollment(me(req), req.params.id))));
programStudentRouter.post('/payments/order', userWriteLimiter, validate(v.enrollmentOrder), asyncHandler(async (req, res) => sendSuccess(res, await programs.createOrder(me(req), req.body.enrollmentId))));
// Signature + provider re-fetch, shared with course payments (the order id identifies the payment).
programStudentRouter.post('/payments/verify', userWriteLimiter, validate(verifyPaymentSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.verifyCheckout(me(req), req.body))));
programStudentRouter.post('/payments/failure', validate(paymentFailureSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.reportCheckoutFailure(me(req), req.body.orderId, req.body.reason))));
programStudentRouter.get('/enrollments/:id/lessons/:lessonId', validate(v.lessonParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.openLesson(me(req), req.params.id, req.params.lessonId))));
programStudentRouter.post('/enrollments/:id/lessons/:lessonId/complete', validate(v.lessonParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.completeLesson(me(req), req.params.id, req.params.lessonId), 'Lesson completed')));
programStudentRouter.post('/enrollments/:id/attempts', userWriteLimiter, validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.startAttempt(me(req), req.params.id))));
programStudentRouter.get('/attempts/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.getAttempt(me(req), req.params.id))));
programStudentRouter.post('/attempts/:id/submit', validate(idParam, 'params'), validate(v.submitAttemptSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.submitAttempt(me(req), req.params.id, req.body.answers), 'Assessment submitted')));
programStudentRouter.get('/enrollments/:id/certificate.pdf', validate(idParam, 'params'), asyncHandler(async (req, res) => sendPdf(res, await programs.myCertificatePdf(me(req), req.params.id))));

// ---------------------------------------------------------------- admin
export const programAdminRouter = Router();
programAdminRouter.use(requireAuth, requirePermission('programs.read'));
const manage = requirePermission('programs.manage');
const byId = validate(idParam, 'params');

programAdminRouter.get('/programs', asyncHandler(async (_req, res) => sendSuccess(res, await programs.adminListPrograms())));
programAdminRouter.post('/programs', manage, validate(v.programCreateSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.createProgram(actorOf(req), req.body), 'Program created', 201)));
programAdminRouter.get('/programs/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await programs.adminGetProgram(req.params.id))));
programAdminRouter.patch('/programs/:id', manage, byId, validate(v.programUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.updateProgram(actorOf(req), req.params.id, req.body), 'Program saved')));
programAdminRouter.post('/programs/:id/lessons', manage, byId, validate(v.lessonSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.saveLesson(actorOf(req), req.params.id, null, req.body), 'Lesson added', 201)));
programAdminRouter.put('/programs/:id/lessons/:lessonId', manage, validate(v.lessonParam, 'params'), validate(v.lessonSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.saveLesson(actorOf(req), req.params.id, req.params.lessonId, req.body), 'Lesson saved')));
programAdminRouter.patch('/programs/:id/lessons/:lessonId/archive', manage, validate(v.lessonParam, 'params'), validate(v.archiveSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.archiveLesson(actorOf(req), req.params.id, req.params.lessonId, req.body.archived))));
programAdminRouter.post('/programs/:id/questions', manage, byId, validate(v.questionSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.saveQuestion(actorOf(req), req.params.id, null, req.body), 'Question added', 201)));
programAdminRouter.put('/programs/:id/questions/:questionId', manage, validate(v.questionParam, 'params'), validate(v.questionSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.saveQuestion(actorOf(req), req.params.id, req.params.questionId, req.body), 'Question saved')));
programAdminRouter.patch('/programs/:id/questions/:questionId/archive', manage, validate(v.questionParam, 'params'), validate(v.archiveSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.archiveQuestion(actorOf(req), req.params.id, req.params.questionId, req.body.archived))));

programAdminRouter.get('/enrollments', validate(v.enrollmentListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.query as unknown as Parameters<typeof programs.adminListEnrollments>[0] & PageQ;
  const { items, total } = await programs.adminListEnrollments({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
programAdminRouter.get('/enrollments/export', validate(v.enrollmentListQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, { rows: await programs.exportEnrollments(actorOf(req), req.query as never) })));
programAdminRouter.get('/enrollments/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await programs.adminGetEnrollment(req.params.id))));
programAdminRouter.post('/enrollments/:id/extra-attempt', manage, byId, validate(reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.grantExtraAttempt(actorOf(req), req.params.id, req.body.reason), 'Extra attempt granted')));
programAdminRouter.post('/enrollments/:id/cancel', manage, byId, validate(reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.cancelEnrollment(actorOf(req), req.params.id, req.body.reason), 'Registration cancelled')));
programAdminRouter.post('/enrollments/:id/certificate', manage, byId, asyncHandler(async (req, res) => sendSuccess(res, await programs.adminIssueCertificate(actorOf(req), req.params.id), 'Certificate issued', 201)));
programAdminRouter.post('/certificates/:id/revoke', manage, byId, validate(reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await programs.revokeCertificate(actorOf(req), req.params.id, req.body.reason), 'Certificate revoked')));
programAdminRouter.post('/certificates/:id/resend', manage, byId, asyncHandler(async (req, res) => sendSuccess(res, await programs.resendCertificate(actorOf(req), req.params.id))));
programAdminRouter.get('/certificates/:id/pdf', byId, asyncHandler(async (req, res) => sendPdf(res, await programs.certificatePdf(req.params.id), 'inline')));
programAdminRouter.get('/report', validate(v.reportQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.query as { programId?: string; from?: string; to?: string };
  sendSuccess(res, await programs.report({ programId: q.programId, from: q.from ? new Date(`${q.from}T00:00:00+05:30`) : undefined, to: q.to ? new Date(`${q.to}T23:59:59.999+05:30`) : undefined }));
}));

// ---------------------------------------------------------------- public
export const programPublicRouter = Router();
programPublicRouter.get('/', asyncHandler(async (_req, res) => sendSuccess(res, await programs.listPublicPrograms())));
programPublicRouter.get('/:slug', validate(slugParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await programs.getPublicProgram(req.params.slug))));
