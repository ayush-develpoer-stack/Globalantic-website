import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { userWriteLimiter } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { openForDownload, openPublicImage, storeUpload } from '../services/file.service';
import { idParam } from '../validators/training';

/**
 * Private files: /api/files
 *   POST /api/files?purpose=…   raw body (Content-Type: application/octet-stream),
 *                               X-File-Name: <URI-encoded original name>
 *   GET  /api/files/:id         authorised download (attachment, nosniff, sandbox CSP)
 */
const router = Router();
router.use(requireAuth);

const uploadQuery = z.object({ purpose: z.enum(['ASSIGNMENT_SUBMISSION', 'ADMISSION_DOCUMENT', 'EMPLOYEE_DOCUMENT', 'COURSE_IMAGE', 'CMS_IMAGE', 'LEARNING_MATERIAL', 'SIGNED_DOCUMENT']) });

router.post(
  '/',
  userWriteLimiter,
  validate(uploadQuery, 'query'),
  express.raw({ type: () => true, limit: env.uploadMaxBytes }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new ApiError(415, 'Send the file as the raw request body');
    const file = await storeUpload(actorOf(req), (req.query as { purpose: 'ASSIGNMENT_SUBMISSION' }).purpose, req.body, req.get('x-file-name'));
    sendSuccess(res, file, 'File uploaded', 201);
  }),
);

router.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { file, data } = await openForDownload(actorOf(req), req.params.id);
    const ascii = file.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(data);
  }),
);

export default router;

/**
 * Public images only (COURSE_IMAGE / CMS_IMAGE): GET /api/files/public/:id
 * No auth; private purposes always 404 here. Served inline with nosniff, a
 * sandbox CSP and a cross-origin resource policy so the portals can embed them.
 */
export const publicFilesRouter = Router();
publicFilesRouter.get(
  '/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const { file, data } = await openPublicImage(req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.end(data);
  }),
);
