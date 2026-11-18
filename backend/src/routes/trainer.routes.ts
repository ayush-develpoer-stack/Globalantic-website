import { Router } from 'express';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as learning from '../services/learning.service';
import {
  announcementSchema,
  assessmentSchema,
  assignmentSchema,
  assignmentUpdateSchema,
  attendanceQuery,
  attendanceSchema,
  batchIdParam,
  feedbackSchema,
  gradeSchema,
  idParam,
  materialSchema,
  resultsSchema,
} from '../validators/training';

/**
 * Trainer portal API: /api/training/trainer/*
 * TRAINER role only, and every batch-scoped call re-checks the assignment in
 * the service layer (learning.assertTrainerBatch).
 */
const router = Router();
router.use(requireAuth, requirePermission('trainer.portal'));

const me = (req: { user?: { sub: string } }) => req.user!.sub;
const byBatch = validate(batchIdParam, 'params');
const byId = validate(idParam, 'params');

router.get('/dashboard', asyncHandler(async (req, res) => sendSuccess(res, await learning.trainerDashboard(me(req)))));

router.get('/batches/:batchId', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.trainerBatch(me(req), req.params.batchId))));
router.get('/batches/:batchId/students', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.trainerRoster(me(req), req.params.batchId))));
router.get('/batches/:batchId/report', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.batchReport(me(req), req.params.batchId))));

// Attendance
router.get(
  '/batches/:batchId/attendance',
  byBatch,
  validate(attendanceQuery, 'query'),
  asyncHandler(async (req, res) => sendSuccess(res, await learning.getAttendanceForDate(me(req), req.params.batchId, String(req.query.date)))),
);
router.get('/batches/:batchId/attendance/history', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.attendanceHistory(me(req), req.params.batchId))));
router.put(
  '/batches/:batchId/attendance',
  userWriteLimiter,
  byBatch,
  validate(attendanceSchema),
  asyncHandler(async (req, res) => sendSuccess(res, await learning.markAttendance(actorOf(req), req.params.batchId, req.body), 'Attendance saved')),
);

// Assignments
router.get('/batches/:batchId/assignments', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.listBatchAssignments(me(req), req.params.batchId))));
router.post(
  '/batches/:batchId/assignments',
  byBatch,
  validate(assignmentSchema),
  asyncHandler(async (req, res) => sendSuccess(res, await learning.createAssignment(actorOf(req), req.params.batchId, req.body), 'Assignment created', 201)),
);
router.get('/assignments/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.getAssignmentWithSubmissions(me(req), req.params.id))));
router.put('/assignments/:id', byId, validate(assignmentUpdateSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.updateAssignment(actorOf(req), req.params.id, req.body), 'Assignment updated')));
router.post('/submissions/:id/grade', byId, validate(gradeSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.gradeSubmission(actorOf(req), req.params.id, req.body), 'Submission graded')));

// Materials
router.get('/batches/:batchId/materials', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.listMaterials(me(req), req.params.batchId))));
router.post('/batches/:batchId/materials', byBatch, validate(materialSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.addMaterial(actorOf(req), req.params.batchId, req.body), 'Material added', 201)));
router.delete('/materials/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.removeMaterial(actorOf(req), req.params.id), 'Material removed')));

// Announcements
router.get('/batches/:batchId/announcements', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.listBatchAnnouncements(me(req), req.params.batchId))));
router.post(
  '/batches/:batchId/announcements',
  byBatch,
  validate(announcementSchema),
  asyncHandler(async (req, res) => sendSuccess(res, await learning.postAnnouncement(actorOf(req), req.params.batchId, req.body, { asTrainer: true }), 'Announcement posted', 201)),
);

// Assessments & results
router.get('/batches/:batchId/assessments', byBatch, asyncHandler(async (req, res) => sendSuccess(res, await learning.listAssessments(me(req), req.params.batchId))));
router.post('/batches/:batchId/assessments', byBatch, validate(assessmentSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.createAssessment(actorOf(req), req.params.batchId, req.body), 'Assessment created', 201)));
router.get('/assessments/:id/results', byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.getAssessmentResults(me(req), req.params.id))));
router.put('/assessments/:id/results', byId, validate(resultsSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.recordResults(actorOf(req), req.params.id, req.body.rows), 'Results saved')));
router.post('/assessments/:id/publish', byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.publishResults(actorOf(req), req.params.id), 'Results published')));

// Students: progress & feedback (enrollment id)
router.get('/enrollments/:id/progress', byId, asyncHandler(async (req, res) => sendSuccess(res, await learning.trainerStudentProgress(me(req), req.params.id))));
router.post('/enrollments/:id/feedback', byId, validate(feedbackSchema), asyncHandler(async (req, res) => sendSuccess(res, await learning.giveFeedback(actorOf(req), req.params.id, req.body), 'Feedback sent', 201)));

export default router;
