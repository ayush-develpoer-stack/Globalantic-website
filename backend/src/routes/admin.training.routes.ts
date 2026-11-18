import { Router, type Request } from 'express';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { pageArgs, paged } from '../lib/pagination';
import * as catalog from '../services/catalog.service';
import * as admission from '../services/admission.service';
import * as payments from '../services/payment.service';
import * as receipts from '../services/receipt.service';
import { sendPdf } from '../utils/sendPdf';
import { prisma } from '../config/database';
import * as referral from '../services/referral.service';
import * as certificates from '../services/certificate.service';
import * as adminSvc from '../services/admin-training.service';
import * as learning from '../services/learning.service';
import { adminListSupport, adminRespondSupport } from '../services/student.service';
import { createStaffUser, inviteMessage, setUserStatus } from '../services/auth.service';
import { toSessionDate } from '../services/learning.service';
import * as v from '../validators/training';
import { ROLE_PERMISSIONS } from '../lib/permissions';

/**
 * Staff training administration: /api/training/admin/*
 * Every route declares the permission it needs (see lib/permissions.ts).
 * ADMIN has all of them; FINANCE has payments + referrals + read-only students.
 */
const router = Router();
router.use(requireAuth);

const P = requirePermission;
const byId = validate(v.idParam, 'params');
type PageQ = { page: number; pageSize: number };
const query = <T>(req: Request) => req.query as unknown as T & PageQ;

router.get('/dashboard', P('training.admissions.read'), asyncHandler(async (_req, res) => sendSuccess(res, await adminSvc.trainingDashboard())));
router.get('/me/permissions', asyncHandler(async (req, res) => {
  sendSuccess(res, { role: req.user!.role, permissions: ROLE_PERMISSIONS[req.user!.role as keyof typeof ROLE_PERMISSIONS] ?? [] });
}));

// ---- Courses --------------------------------------------------------------
router.get('/courses', P('training.courses.manage'), validate(v.adminCourseQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ search?: string; status?: never }>(req);
  const { items, total } = await catalog.adminListCourses({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.post('/courses', P('training.courses.manage'), validate(v.courseSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.createCourse(actorOf(req), req.body), 'Course created', 201)));
router.get('/courses/:id', P('training.courses.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await catalog.adminGetCourse(req.params.id))));
router.put('/courses/:id', P('training.courses.manage'), byId, validate(v.courseUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.updateCourse(actorOf(req), req.params.id, req.body), 'Course updated')));
router.patch('/courses/:id/status', P('training.courses.manage'), byId, validate(v.courseStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.setCourseStatus(actorOf(req), req.params.id, req.body.status), 'Status updated')));
router.put('/courses/:id/modules', P('training.courses.manage'), byId, validate(v.modulesSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.setCourseModules(actorOf(req), req.params.id, req.body.modules), 'Syllabus saved')));

// ---- Batches --------------------------------------------------------------
router.get('/batches', P('training.batches.manage'), validate(v.adminBatchQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ courseId?: string; status?: never; search?: string }>(req);
  const { items, total } = await catalog.adminListBatches({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.post('/batches', P('training.batches.manage'), validate(v.batchSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.createBatch(actorOf(req), req.body), 'Batch created', 201)));
router.get('/batches/:id', P('training.batches.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await catalog.adminGetBatch(req.params.id))));
router.put('/batches/:id', P('training.batches.manage'), byId, validate(v.batchUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.updateBatch(actorOf(req), req.params.id, req.body), 'Batch updated')));
router.patch('/batches/:id/status', P('training.batches.manage'), byId, validate(v.batchStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.setBatchStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Status updated')));
router.put('/batches/:id/schedules', P('training.batches.manage'), byId, validate(v.schedulesSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.setBatchSchedules(actorOf(req), req.params.id, req.body.schedules), 'Schedule saved')));
router.post('/batches/:id/trainers', P('training.batches.manage'), byId, validate(v.assignTrainerSchema), asyncHandler(async (req, res) => sendSuccess(res, await catalog.assignTrainer(actorOf(req), req.params.id, req.body.trainerId, req.body.role), 'Trainer assigned')));
router.delete('/batches/:id/trainers/:trainerId', P('training.batches.manage'), validate(v.trainerParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await catalog.removeTrainer(actorOf(req), req.params.id, req.params.trainerId), 'Trainer removed')));
router.get('/batches/:id/report', P('training.learning.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.batchReport(null, req.params.id))));

// ---- Staff accounts --------------------------------------------------------
router.get('/trainers', P('training.batches.manage'), asyncHandler(async (_req, res) => sendSuccess(res, await catalog.listTrainers())));
router.get('/staff', P('training.trainers.manage'), asyncHandler(async (_req, res) => sendSuccess(res, await adminSvc.listStaff())));
router.post('/staff', P('training.trainers.manage'), validate(v.staffSchema), asyncHandler(async (req, res) => {
  const created = await createStaffUser(actorOf(req), req.body);
  sendSuccess(res, created, inviteMessage('Account created', created.inviteEmail), 201);
}));
router.patch('/users/:id/status', P('training.students.manage'), byId, validate(v.userStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await setUserStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Account status updated')));

// ---- Admissions ------------------------------------------------------------
router.get('/applications', P('training.admissions.read'), validate(v.adminApplicationQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never; courseId?: string; batchId?: string; search?: string; pendingPayment?: string }>(req);
  const { items, total, statusCounts } = await admission.adminListApplications({ ...q, pendingPayment: q.pendingPayment === 'true', ...pageArgs(q) });
  sendSuccess(res, { ...paged(items, total, q), statusCounts });
}));
router.get('/applications/:id', P('training.admissions.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await admission.adminGetApplication(req.params.id))));
router.post('/applications/:id/review', P('training.admissions.manage'), byId, validate(v.reviewSchema), asyncHandler(async (req, res) => {
  const { action, reason } = req.body as { action: 'UNDER_REVIEW' | 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; reason?: string };
  if (action === 'REQUEST_INFO') {
    if (!reason || reason.trim().length < 3) throw ApiError.validation([{ field: 'reason', message: 'Describe what information is needed' }]);
    sendSuccess(res, await admission.requestApplicationInfo(actorOf(req), req.params.id, reason), 'Information requested from the applicant');
    return;
  }
  sendSuccess(res, await admission.reviewApplication(actorOf(req), req.params.id, action, reason), 'Application updated');
}));
router.post('/applications/:id/verify-documents', P('training.admissions.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await admission.verifyApplicationDocuments(actorOf(req), req.params.id), 'Documents verified')));
router.post('/applications/:id/confirm-enrollment', P('training.admissions.manage'), byId, asyncHandler(async (req, res) => sendSuccess(res, await admission.adminConfirmEnrollment(actorOf(req), req.params.id), 'Enrollment confirmed')));
router.post('/applications/:id/transfer', P('training.admissions.manage'), byId, validate(v.transferSchema), asyncHandler(async (req, res) => sendSuccess(res, await admission.transferToBatch(actorOf(req), req.params.id, req.body.batchId, req.body.reason), 'Batch changed')));
router.post('/applications/:id/offline-payment', P('payments.record_offline'), byId, validate(v.offlinePaymentSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.recordOfflinePayment(actorOf(req), req.params.id, req.body), 'Offline payment recorded', 201)));

// ---- Students --------------------------------------------------------------
router.get('/students', P('training.students.read'), validate(v.adminStudentQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ search?: string; status?: never }>(req);
  const { items, total } = await adminSvc.listStudents({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.get('/students/:id', P('training.students.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await adminSvc.getStudent(req.params.id))));
router.put('/students/:id', P('training.students.manage'), byId, validate(v.adminStudentUpdateSchema), asyncHandler(async (req, res) => {
  const { reason, dateOfBirth, ...rest } = req.body as { reason: string; dateOfBirth?: string | null };
  sendSuccess(res, await adminSvc.updateStudent(actorOf(req), req.params.id, { ...rest, ...(dateOfBirth ? { dateOfBirth: toSessionDate(dateOfBirth) } : dateOfBirth === null ? { dateOfBirth: null } : {}) }, reason), 'Student updated');
}));
router.patch('/enrollments/:id/status', P('training.students.manage'), byId, validate(v.enrollmentStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await admission.setEnrollmentStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Enrollment updated')));
router.get('/enrollments/:id/attendance', P('training.learning.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await adminSvc.studentAttendance(req.params.id))));
router.get('/enrollments/:id/certificate-eligibility', P('training.certificates.issue'), byId, asyncHandler(async (req, res) => sendSuccess(res, await certificates.certificateEligibility(req.params.id))));
router.post('/enrollments/:id/certificate', P('training.certificates.issue'), byId, asyncHandler(async (req, res) => sendSuccess(res, await certificates.issueCertificate(actorOf(req), req.params.id), 'Certificate issued', 201)));

// ---- Certificates ----------------------------------------------------------
router.get('/certificates', P('training.certificates.issue'), validate(v.pageQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<object>(req);
  const { items, total } = await certificates.adminListCertificates(pageArgs(q));
  sendSuccess(res, paged(items, total, q));
}));
router.post('/certificates/:id/revoke', P('training.certificates.issue'), byId, validate(v.reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await certificates.revokeCertificate(actorOf(req), req.params.id, req.body.reason), 'Certificate revoked')));

// ---- Payments --------------------------------------------------------------
router.get('/payments', P('payments.read'), validate(v.adminPaymentQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never; search?: string }>(req);
  const { items, total, totals } = await payments.adminListPayments({ ...q, ...pageArgs(q) });
  sendSuccess(res, { ...paged(items, total, q), totals });
}));
router.get('/payments/:id', P('payments.read'), byId, asyncHandler(async (req, res) => sendSuccess(res, await payments.adminGetPayment(req.params.id))));
router.post('/payments/:id/reconcile', P('payments.reconcile'), byId, asyncHandler(async (req, res) => sendSuccess(res, await payments.reconcilePayment(actorOf(req), req.params.id), 'Reconciled with provider')));
router.get('/payments/:id/receipt.pdf', P('payments.read'), byId, asyncHandler(async (req, res) => {
  const inv = await prisma.invoice.findUnique({ where: { paymentId: req.params.id }, select: { id: true } });
  if (!inv) throw ApiError.notFound('This payment has no receipt');
  sendPdf(res, await receipts.receiptPdf(inv.id), 'inline');
}));
router.post('/payments/:id/receipt/resend', P('payments.reconcile'), byId, asyncHandler(async (req, res) => sendSuccess(res, await receipts.resendReceipt(actorOf(req), req.params.id), 'Receipt email processed')));
router.post('/payments/:id/refund-record', P('payments.reconcile'), byId, validate(v.reasonSchema), asyncHandler(async (req, res) => sendSuccess(res, await payments.adminRefundRecord(actorOf(req), req.params.id, req.body.reason), 'Refund recorded')));

// ---- Announcements & support ------------------------------------------------
router.post('/announcements', P('training.announcements.manage'), validate(v.adminAnnouncementSchema), asyncHandler(async (req, res) => {
  const { batchId, ...body } = req.body as { batchId?: string; title: string; body: string };
  sendSuccess(res, await learning.postAnnouncement(actorOf(req), batchId ?? null, body, { asTrainer: false }), 'Announcement posted', 201);
}));
router.get('/support', P('training.support.manage'), validate(v.supportQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never }>(req);
  const { items, total } = await adminListSupport({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.put('/support/:id', P('training.support.manage'), byId, validate(v.supportResponseSchema), asyncHandler(async (req, res) => sendSuccess(res, await adminRespondSupport(actorOf(req), req.params.id, req.body), 'Support request updated')));

// ---- Referrals -------------------------------------------------------------
router.get('/referrals/overview', P('referrals.read'), asyncHandler(async (_req, res) => sendSuccess(res, await referral.referralOverview())));
router.get('/referrals/settings', P('referrals.read'), asyncHandler(async (_req, res) => sendSuccess(res, await referral.getReferralSettings())));
router.put('/referrals/settings', P('referrals.settings'), validate(v.referralSettingsSchema), asyncHandler(async (req, res) => {
  const { reason, ...input } = req.body as { reason: string } & referral.ReferralSettingsInput;
  sendSuccess(res, await referral.updateReferralSettings(actorOf(req), input, reason), 'Referral settings saved');
}));
router.get('/referrals/registrations', P('referrals.read'), validate(v.registrationQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ stage?: string }>(req);
  const { items, total } = await referral.listReferralRegistrations({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.get('/referrals/rewards', P('referrals.read'), validate(v.rewardQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never }>(req);
  const { items, total } = await referral.listRewards({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.post('/referrals/rewards/:id/review', P('referrals.review'), byId, validate(v.rewardReviewSchema), asyncHandler(async (req, res) => sendSuccess(res, await referral.reviewReward(actorOf(req), req.params.id, req.body.decision, req.body.reason), 'Reward updated')));
router.post('/referrals/rewards/:id/payout', P('referrals.payout'), byId, validate(v.payoutSchema), asyncHandler(async (req, res) => sendSuccess(res, await referral.recordPayout(actorOf(req), req.params.id, req.body), 'Payout recorded', 201)));
router.get('/referrals/fraud-reviews', P('referrals.read'), validate(v.fraudQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never }>(req);
  const { items, total } = await referral.listFraudReviews({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.post('/referrals/fraud-reviews/:id/resolve', P('referrals.review'), byId, validate(v.fraudResolveSchema), asyncHandler(async (req, res) => sendSuccess(res, await referral.resolveFraudReview(actorOf(req), req.params.id, req.body.outcome, req.body.notes), 'Fraud review resolved')));
router.get('/referrals/codes', P('referrals.read'), validate(v.referralCodeQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ search?: string }>(req);
  const { items, total } = await referral.listReferralCodes({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
router.patch('/referrals/codes/:id/status', P('referrals.settings'), byId, validate(v.codeStatusSchema), asyncHandler(async (req, res) => sendSuccess(res, await referral.setCodeStatus(actorOf(req), req.params.id, req.body.status, req.body.reason), 'Referral code updated')));
router.get('/referrals/audit', P('referrals.read'), validate(v.pageQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<object>(req);
  const { items, total } = await referral.referralAuditLog(pageArgs(q));
  sendSuccess(res, paged(items, total, q));
}));

// ---- Audit -----------------------------------------------------------------
router.get('/audit', P('audit.read'), validate(v.auditQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ entityType?: string; entityId?: string; actorId?: string }>(req);
  const { items, total } = await adminSvc.listAuditLog({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));

export default router;
