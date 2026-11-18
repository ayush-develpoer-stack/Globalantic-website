import { Router, type Request } from 'express';
import { requireAuth, requirePermission, requireAnyPermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { examSaveLimiter, userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { pageArgs, paged } from '../lib/pagination';
import * as exams from '../services/exam.service';
import { idParam } from '../validators/training';
import * as v from '../validators/exam';

/**
 * Intern examinations.
 *   /api/exams/student/*  student portal (the student id always comes from the session)
 *   /api/exams/admin/*    staff (exams.manage / exams.evaluate / exams.results.read)
 */
type PageQ = { page: number; pageSize: number };
const query = <T>(req: Request) => req.query as unknown as T & PageQ;
const byId = validate(idParam, 'params');
const me = (req: Request) => req.user!.sub;

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------
export const examStudentRouter = Router();
examStudentRouter.use(requireAuth, requirePermission('student.portal'));

examStudentRouter.get('/exams', asyncHandler(async (req, res) => sendSuccess(res, await exams.studentExams(me(req)))));
examStudentRouter.get('/exams/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.studentExam(me(req), req.params.id))));
examStudentRouter.post(
  '/exams/:id/start',
  userWriteLimiter,
  byId,
  asyncHandler(async (req, res) => {
    const r = await exams.startAttempt(actorOf(req), req.params.id, { userAgent: req.get('user-agent') });
    sendSuccess(res, r, r.resumed ? 'Attempt resumed' : 'Attempt started', r.resumed ? 200 : 201);
  }),
);
examStudentRouter.get('/attempts', asyncHandler(async (req, res) => sendSuccess(res, await exams.studentAttempts(me(req)))));
examStudentRouter.get('/attempts/:id', byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.getStudentAttempt(me(req), req.params.id))));
// Autosave: its own per-user limiter (a class sharing one college IP must not throttle each other).
examStudentRouter.put('/attempts/:id/answers', examSaveLimiter, byId, validate(v.saveAnswersSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.saveAnswers(me(req), req.params.id, req.body), 'Saved')));
examStudentRouter.post('/attempts/:id/submit', userWriteLimiter, byId, validate(v.submitSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.submitAttempt(me(req), req.params.id, req.body), 'Exam submitted')));
examStudentRouter.get('/attempts/:id/result', byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.studentResult(me(req), req.params.id))));

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export const examAdminRouter = Router();
examAdminRouter.use(requireAuth);
const MANAGE = requirePermission('exams.manage');
const EVALUATE = requirePermission('exams.evaluate');
const RESULTS = requireAnyPermission('exams.results.read', 'exams.evaluate', 'exams.manage');

// Question bank
examAdminRouter.get('/questions', MANAGE, validate(v.questionListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ track?: never; topic?: string; type?: never; search?: string; archived?: boolean }>(req);
  const { items, total } = await exams.listQuestions({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
examAdminRouter.get('/topics', MANAGE, asyncHandler(async (_req, res) => sendSuccess(res, await exams.listTopics())));
examAdminRouter.post('/questions', MANAGE, validate(v.questionSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.createQuestion(actorOf(req), req.body), 'Question created', 201)));
examAdminRouter.get('/questions/:id', MANAGE, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.getQuestion(req.params.id))));
examAdminRouter.put('/questions/:id', MANAGE, byId, validate(v.questionSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.updateQuestion(actorOf(req), req.params.id, req.body), 'Question updated')));
examAdminRouter.patch('/questions/:id/archive', MANAGE, byId, validate(v.archiveSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.setQuestionArchived(actorOf(req), req.params.id, req.body.archived), req.body.archived ? 'Question archived' : 'Question restored')));

// Exams
examAdminRouter.get('/exams', RESULTS, validate(v.examListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never; track?: never; search?: string }>(req);
  const { items, total } = await exams.listExams({ ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
examAdminRouter.post('/exams', MANAGE, validate(v.examSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.createExam(actorOf(req), req.body), 'Exam created', 201)));
examAdminRouter.get('/exams/:id', RESULTS, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.getExam(req.params.id))));
examAdminRouter.put('/exams/:id', MANAGE, byId, validate(v.examSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.updateExam(actorOf(req), req.params.id, req.body), 'Exam updated')));
examAdminRouter.put('/exams/:id/questions', MANAGE, byId, validate(v.examQuestionsSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.setExamQuestions(actorOf(req), req.params.id, req.body.questionIds), 'Questions updated')));
examAdminRouter.post('/exams/:id/publish', MANAGE, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.publishExam(actorOf(req), req.params.id), 'Exam published')));
examAdminRouter.post('/exams/:id/archive', MANAGE, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.archiveExam(actorOf(req), req.params.id), 'Exam archived')));
examAdminRouter.post('/exams/:id/release-results', MANAGE, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.releaseResults(actorOf(req), req.params.id), 'Results released')));

// Assignment
examAdminRouter.get('/targets', MANAGE, validate(v.targetsQuery, 'query'), asyncHandler(async (req, res) => sendSuccess(res, await exams.assignmentTargets((req.query as { search?: string }).search))));
examAdminRouter.post('/exams/:id/assignments', MANAGE, byId, validate(v.assignmentSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.addAssignment(actorOf(req), req.params.id, req.body), 'Exam assigned', 201)));
examAdminRouter.delete('/exams/:id/assignments/:assignmentId', MANAGE, validate(v.assignmentParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await exams.removeAssignment(actorOf(req), req.params.id, req.params.assignmentId), 'Assignment removed')));

// Attempts, evaluation, retakes, interviews
examAdminRouter.get('/exams/:id/attempts', RESULTS, byId, validate(v.attemptListQuery, 'query'), asyncHandler(async (req, res) => {
  const q = query<{ status?: never; search?: string }>(req);
  const { items, total } = await exams.listAttempts(req.params.id, { ...q, ...pageArgs(q) });
  sendSuccess(res, paged(items, total, q));
}));
examAdminRouter.get('/attempts/:id', RESULTS, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.getAttemptForStaff(req.params.id))));
examAdminRouter.post('/attempts/:id/evaluate', EVALUATE, byId, validate(v.evaluateSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.evaluateAttempt(actorOf(req), req.params.id, req.body), 'Evaluation saved')));
examAdminRouter.post('/exams/:id/retakes', MANAGE, byId, validate(v.retakeSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.grantRetake(actorOf(req), req.params.id, req.body), 'Retake granted', 201)));
examAdminRouter.post('/exams/:id/interview-results', EVALUATE, byId, validate(v.interviewSchema), asyncHandler(async (req, res) => sendSuccess(res, await exams.recordInterviewResult(actorOf(req), req.params.id, req.body), 'Interview result recorded', 201)));

// Reports
examAdminRouter.get('/exams/:id/report', RESULTS, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.examReport(req.params.id))));
examAdminRouter.get('/exams/:id/export', RESULTS, byId, asyncHandler(async (req, res) => sendSuccess(res, await exams.exportResults(actorOf(req), req.params.id))));
examAdminRouter.get('/students/:studentId/performance', RESULTS, validate(v.studentParam, 'params'), asyncHandler(async (req, res) => sendSuccess(res, await exams.studentPerformance(req.params.studentId))));
