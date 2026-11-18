import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.middleware';
import { lookupLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { pageArgs, paged } from '../lib/pagination';
import * as catalog from '../services/catalog.service';
import * as referral from '../services/referral.service';
import { verifyCertificate } from '../services/certificate.service';
import { codeParam, idParam, publicBatchQuery, publicCourseQuery, referralClickSchema, slugParam } from '../validators/training';

/** Public training catalogue: GET /api/training/* (no authentication). */
const router = Router();

router.get(
  '/courses',
  validate(publicCourseQuery, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as { search?: string; category?: string; mode?: never; level?: never; programType?: never; page: number; pageSize: number };
    const { items, total, categories } = await catalog.listPublicCourses({ ...q, ...pageArgs(q) });
    sendSuccess(res, { ...paged(items, total, q), categories });
  }),
);

router.get(
  '/courses/:slug',
  validate(slugParam, 'params'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await catalog.getPublicCourse(req.params.slug));
  }),
);

router.get(
  '/batches',
  validate(publicBatchQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { courseId?: string; mode?: string; status?: never; page: number; pageSize: number };
    const { items, total } = await catalog.listPublicBatches({ ...q, ...pageArgs(q) });
    sendSuccess(res, paged(items, total, q));
  }),
);

router.get(
  '/batches/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await catalog.getPublicBatch(req.params.id));
  }),
);

/** Records a referral-link visit. Rate-limited; returns only whether the code is usable. */
router.post(
  '/referrals/click',
  lookupLimiter,
  validate(referralClickSchema),
  asyncHandler(async (req, res) => {
    const result = await referral.recordClick(req.body.code, req.ip, req.get('user-agent'));
    sendSuccess(res, result);
  }),
);

router.get(
  '/referrals/validate/:code',
  lookupLimiter,
  validate(codeParam, 'params'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { valid: await referral.isCodeValid(req.params.code) });
  }),
);

/** Public programme facts for the referral info page (amount comes from the DB). */
router.get(
  '/referrals/program',
  asyncHandler(async (_req, res) => {
    const s = await referral.getReferralSettings();
    sendSuccess(res, {
      enabled: s.enabled,
      rewardAmountPaise: s.rewardAmountPaise,
      currency: s.currency,
      refundWindowDays: s.refundWindowDays,
      requireActiveEnrollment: s.requireActiveEnrollment,
    });
  }),
);

router.get(
  '/certificates/verify/:code',
  lookupLimiter,
  validate(codeParam, 'params'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await verifyCertificate(req.params.code));
  }),
);

export default router;
