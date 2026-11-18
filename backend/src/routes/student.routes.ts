import { Router } from 'express';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { pageArgs } from '../lib/pagination';
import * as student from '../services/student.service';
import * as admission from '../services/admission.service';
import * as payments from '../services/payment.service';
import { receiptPdf } from '../services/receipt.service';
import { sendPdf } from '../utils/sendPdf';
import * as notifications from '../services/notification.service';
import { getStudentReferralDashboard } from '../services/referral.service';
import { toSessionDate } from '../services/learning.service';
import {
  applySchema,
  infoResponseSchema,
  idParam,
  notificationsQuery,
  notificationsReadSchema,
  orderSchema,
  paymentFailureSchema,
  profileUpdateSchema,
  submissionSchema,
  supportSchema,
  verifyPaymentSchema,
} from '../validators/training';

/**
 * Student portal API: /api/training/student/*
 * The student id always comes from the session (req.user.sub) — never from
 * the URL or body — so one student can never address another's data.
 */
const router = Router();
router.use(requireAuth, requirePermission('student.portal'));

const me = (req: { user?: { sub: string } }) => req.user!.sub;

router.get('/dashboard', asyncHandler(async (req, res) => sendSuccess(res, await student.dashboard(me(req)))));

router.get('/profile', asyncHandler(async (req, res) => sendSuccess(res, await student.getProfile(me(req)))));
router.put(
  '/profile',
  validate(profileUpdateSchema),
  asyncHandler(async (req, res) => {
    const { dateOfBirth, ...rest } = req.body as { dateOfBirth?: string | null };
    sendSuccess(res, await student.updateProfile(me(req), { ...rest, ...(dateOfBirth ? { dateOfBirth: toSessionDate(dateOfBirth) } : dateOfBirth === null ? { dateOfBirth: null } : {}) }), 'Profile updated');
  }),
);

// Admissions
router.get('/applications', asyncHandler(async (req, res) => sendSuccess(res, await admission.listMyApplications(me(req)))));
router.post(
  '/applications',
  userWriteLimiter,
  validate(applySchema),
  asyncHandler(async (req, res) => {
    const app = await admission.submitApplication(me(req), req.body, actorOf(req).ipHash ?? null);
    sendSuccess(res, app, 'Application submitted', 201);
  }),
);
router.get('/applications/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await admission.getMyApplication(me(req), req.params.id))));
router.post(
  '/applications/:id/withdraw',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => sendSuccess(res, await admission.withdrawApplication(me(req), req.params.id), 'Application withdrawn')),
);
router.post(
  '/applications/:id/respond',
  userWriteLimiter,
  validate(idParam, 'params'),
  validate(infoResponseSchema),
  asyncHandler(async (req, res) => sendSuccess(res, await admission.respondToInfoRequest(me(req), req.params.id, req.body), 'Information sent to admissions')),
);

// Learning
router.get('/enrollments', asyncHandler(async (req, res) => sendSuccess(res, await student.listEnrollments(me(req)))));
router.get('/enrollments/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await student.getEnrollment(me(req), req.params.id))));
router.get('/enrollments/:id/attendance', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await student.attendance(me(req), req.params.id))));
router.get('/timetable', asyncHandler(async (req, res) => sendSuccess(res, await student.timetable(me(req)))));
router.get('/materials', asyncHandler(async (req, res) => sendSuccess(res, await student.materials(me(req)))));
router.get('/assignments', asyncHandler(async (req, res) => sendSuccess(res, await student.assignments(me(req)))));
router.get('/assignments/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await student.assignment(me(req), req.params.id))));
router.post(
  '/assignments/:id/submission',
  userWriteLimiter,
  validate(idParam, 'params'),
  validate(submissionSchema),
  asyncHandler(async (req, res) => sendSuccess(res, await student.submitAssignment(me(req), req.params.id, req.body), 'Submission saved')),
);
router.get('/assessments', asyncHandler(async (req, res) => sendSuccess(res, await student.assessments(me(req)))));
router.get('/results', asyncHandler(async (req, res) => sendSuccess(res, await student.results(me(req)))));
router.get('/feedback', asyncHandler(async (req, res) => sendSuccess(res, await student.feedback(me(req)))));
router.get('/announcements', asyncHandler(async (req, res) => sendSuccess(res, await student.announcementsFor(me(req)))));

// Notifications
router.get(
  '/notifications',
  validate(notificationsQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { unread?: string; page: number; pageSize: number };
    sendSuccess(res, await notifications.listNotifications(me(req), { unreadOnly: q.unread === 'true', ...pageArgs(q) }));
  }),
);
router.post(
  '/notifications/read',
  validate(notificationsReadSchema),
  asyncHandler(async (req, res) => sendSuccess(res, { updated: await notifications.markNotificationsRead(me(req), req.body.ids) })),
);

// Payments
router.post('/payments/order', userWriteLimiter, validate(orderSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.createOrder(me(req), req.body.applicationId))));
router.post('/payments/verify', userWriteLimiter, validate(verifyPaymentSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.verifyCheckout(me(req), req.body))));
router.post('/payments/failure', userWriteLimiter, validate(paymentFailureSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.reportCheckoutFailure(me(req), req.body.orderId, req.body.reason))));
router.get('/payments', asyncHandler(async (req, res) => sendSuccess(res, await payments.listMyPayments(me(req)))));
router.get('/invoices', asyncHandler(async (req, res) => sendSuccess(res, await payments.listMyInvoices(me(req)))));
router.get('/invoices/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await payments.getMyInvoice(me(req), req.params.id))));
// Receipt PDF (own receipts only: getMyInvoice checks ownership first)
router.get('/invoices/:id/pdf', validate(idParam, 'params'), asyncHandler(async (req, res) => {
  const inv = await payments.getMyInvoice(me(req), req.params.id);
  sendPdf(res, await receiptPdf(inv.id));
}));

// Certificates
router.get('/certificates', asyncHandler(async (req, res) => sendSuccess(res, await student.certificates(me(req)))));
router.get('/certificates/:id', validate(idParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await student.certificate(me(req), req.params.id))));

// Support
router.get('/support', asyncHandler(async (req, res) => sendSuccess(res, await student.listSupportRequests(me(req)))));
router.post('/support', userWriteLimiter, validate(supportSchema), asyncHandler(async (req, res) => sendSuccess(res, await student.createSupportRequest(me(req), req.body), 'Request sent', 201)));

// Referrals
router.get('/referrals', asyncHandler(async (req, res) => sendSuccess(res, await getStudentReferralDashboard(me(req)))));

export default router;
