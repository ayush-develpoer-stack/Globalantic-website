import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { apiIpBackstop, apiLimiter } from './middleware/rateLimit.middleware';
import { CorsRejectedError, errorHandler, notFoundHandler } from './middleware/error.middleware';
import { prisma } from './config/database';
import { getSchemaStatus, type SchemaState } from './config/schemaStatus';
import { asyncHandler } from './utils/asyncHandler';
import { sendSuccess } from './utils/apiResponse';
import authRoutes from './routes/auth.routes';
import publicRoutes from './routes/public.routes';
import adminRoutes from './routes/admin.routes';
import trainingPublicRoutes from './routes/training.public.routes';
import studentRoutes from './routes/student.routes';
import trainerRoutes from './routes/trainer.routes';
import adminTrainingRoutes from './routes/admin.training.routes';
import employeeRoutes from './routes/employee.routes';
import filesRoutes, { publicFilesRouter } from './routes/files.routes';
import { hrRouter, platformRouter } from './routes/hr.routes';
import { examAdminRouter, examStudentRouter } from './routes/exam.routes';
import crmRoutes from './routes/crm.routes';
import { programAdminRouter, programPublicRouter, programStudentRouter } from './routes/program.routes';
import documentRoutes from './routes/document.routes';
import notificationRoutes from './routes/notifications.routes';
import { handleRazorpayWebhook } from './services/payment.service';

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

/**
 * Parses FRONTEND_URL (comma-separated exact origins) into the CORS allow-list.
 * A bare apex origin (https://example.com) also allows its own www. origin, because
 * the host may serve or redirect the site on either. Without this, a host-level
 * apex->www redirect blocks every browser request. Nothing else is widened:
 * subdomains are still listed one by one.
 */
export function corsAllowList(frontendUrl: string): string[] {
  const origins = new Set<string>();
  for (const entry of frontendUrl.split(',')) {
    const origin = entry.trim().replace(/\/+$/, '');
    if (!origin) continue;
    origins.add(origin);
    const apex = /^https:\/\/([a-z0-9-]+\.[a-z]{2,})$/i.exec(origin);
    if (apex) origins.add(`https://www.${apex[1].toLowerCase()}`);
  }
  return [...origins];
}

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS — explicit allow-list (FRONTEND_URL, comma-separated) with credentials.
  // Outside production any localhost port is accepted so all portals work in dev.
  const allowedOrigins = corsAllowList(env.frontendUrl);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || (!env.isProd && LOCAL_ORIGIN.test(origin))) {
          callback(null, true);
        } else {
          callback(new CorsRejectedError());
        }
      },
      credentials: true,
    }),
  );

  // Razorpay webhook: needs the exact raw bytes for signature verification, so it
  // is registered before the JSON body parser. Authenticity = HMAC signature.
  app.post(
    '/api/payments/razorpay/webhook',
    rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }),
    express.raw({ type: '*/*', limit: '1mb' }),
    asyncHandler(async (req: Request, res: Response) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const result = await handleRazorpayWebhook(raw, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
      sendSuccess(res, result, 'Webhook processed');
    }),
  );

  // Body parsing with request-size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Root: this is a JSON API, not a website. Point visitors at the useful endpoints.
  app.get('/', (_req: Request, res: Response) => {
    sendSuccess(res, { service: 'globalantic-api', health: '/health', liveness: '/health/live', apiBase: '/api' }, 'Globalantic API');
  });

  // Liveness: the process is up (use for container restarts; never touches the DB).
  app.get('/health/live', (_req: Request, res: Response) => {
    sendSuccess(res, { status: 'ok', uptime: Math.round(process.uptime()) }, 'API process is running');
  });

  // Readiness: the process AND the database are usable. 503 when the DB is unreachable,
  // or reachable but missing migrations this build needs (routes would fail with 503).
  app.get('/health', async (_req: Request, res: Response) => {
    const started = Date.now();
    // Assigned inside the race below; the cast stops TS narrowing it to 'down'.
    let database = 'down' as 'up' | 'down';
    let schema: SchemaState = 'unknown';
    let pendingMigrations = 0;
    let timer: NodeJS.Timeout | undefined;
    try {
      const status = await Promise.race([
        prisma.$queryRaw`SELECT 1`.then(() => {
          database = 'up';
          return getSchemaStatus(prisma);
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 3000);
        }),
      ]);
      schema = status.state;
      pendingMigrations = status.pending.length;
    } catch {
      // database stays 'down' if SELECT 1 failed; schema stays 'unknown' otherwise
    } finally {
      clearTimeout(timer);
    }
    const ok = database === 'up' && schema !== 'behind';
    const message = ok
      ? 'Globalantic API is healthy'
      : database === 'down'
        ? 'Globalantic API is running but the database is unreachable'
        : 'Globalantic API is running but the database schema is out of date (migrations pending)';
    res.status(ok ? 200 : 503).json({
      success: ok,
      message,
      data: { status: ok ? 'ok' : 'degraded', database, schema, pendingMigrations, latencyMs: Date.now() - started, uptime: Math.round(process.uptime()) },
    });
  });

  // API responses are data, not pages: keep them (and private files) out of search indexes.
  // Public CMS images (/api/files/public) stay indexable so they can appear with the pages using them.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/files/public/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // Rate limit + routes
  app.use('/api', apiIpBackstop, apiLimiter);
  app.use('/api/auth', authRoutes);
  // Training platform (mounted before the generic public router)
  app.use('/api/training/student', studentRoutes);
  app.use('/api/training/trainer', trainerRoutes);
  app.use('/api/training/admin', adminTrainingRoutes);
  app.use('/api/training', trainingPublicRoutes);
  // Intern examinations
  app.use('/api/exams/student', examStudentRouter);
  app.use('/api/exams/admin', examAdminRouter);
  // Sales CRM (website leads)
  app.use('/api/crm', crmRoutes);
  // Certificate program (separate module) and business documents
  app.use('/api/programs/student', programStudentRouter);
  app.use('/api/programs/admin', programAdminRouter);
  app.use('/api/programs', programPublicRouter);
  app.use('/api/documents', documentRoutes);
  // Admin notification centre (staff): list, read state, SSE stream, settings
  app.use('/api/notifications', notificationRoutes);
  // Employee portal, HR, platform administration, private files
  app.use('/api/employee', employeeRoutes);
  app.use('/api/hr', hrRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/files/public', publicFilesRouter);
  app.use('/api/files', filesRoutes);
  app.use('/api', publicRoutes);
  app.use('/api/admin', adminRoutes);

  // 404 + centralized error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
