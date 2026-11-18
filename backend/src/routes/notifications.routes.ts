import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { requireAuth, requirePermission, actorOf } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { audit } from '../lib/audit';
import { safeEqual } from '../lib/crypto';
import { STAFF_ROLES } from '../lib/permissions';
import { paged } from '../lib/pagination';
import { CATEGORIES, SEVERITIES, businessRecipients, dispatchPending, getNotificationSettings, notificationBus, type PushedNotification } from '../services/admin-events.service';

/**
 * Admin notification centre: /api/notifications/*
 * Staff only. Every query is scoped to req.user, so nobody can read or mark another user's rows.
 * Realtime delivery is Server-Sent Events (GET /stream) with Last-Event-ID recovery; the admin UI
 * falls back to polling /unread-count when a stream cannot stay open.
 */
const router = Router();

// Scheduler entry point (cron): retry event emails + retention purge. CRON_SECRET, not a session.
router.post(
  '/dispatch',
  asyncHandler(async (req, res) => {
    const given = req.get('x-cron-secret') ?? '';
    if (!env.cronSecret || !given || !safeEqual(given, env.cronSecret)) throw ApiError.notFound('Route not found');
    sendSuccess(res, await dispatchPending(), 'Dispatch complete');
  }),
);

router.use(requireAuth, (req: Request, _res: Response, next: NextFunction) => {
  if (!STAFF_ROLES.includes(req.user!.role as (typeof STAFF_ROLES)[number])) return next(ApiError.forbidden('Staff only'));
  next();
});

const listQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  unread: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const readSchema = z.object({ ids: z.union([z.literal('all'), z.array(z.string().uuid()).min(1).max(200)]) });
const settingsSchema = z.object({
  recipients: z.array(z.string().trim().toLowerCase().email()).max(10).optional(),
  emailEnabled: z.boolean().optional(),
  emailMinSeverity: z.enum(SEVERITIES).optional(),
  mutedCategories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).optional(),
  retentionDays: z.coerce.number().int().min(7).max(3650).optional(),
});

/** A staff member's notifications: platform-event copies plus direct ones (e.g. "lead assigned to you"). */
const adminScope = (userId: string): Prisma.NotificationWhereInput => ({ userId });

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where: Prisma.NotificationWhereInput = {
      ...adminScope(req.user!.sub),
      ...(q.category ? { category: q.category } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.unread === 'true' ? { readAt: null } : {}),
    };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, type: true, category: true, severity: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...adminScope(req.user!.sub), readAt: null } }),
    ]);
    sendSuccess(res, { ...paged(items, total, q), unread });
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    sendSuccess(res, { unread: await prisma.notification.count({ where: { ...adminScope(req.user!.sub), readAt: null } }) });
  }),
);

router.post(
  '/read',
  validate(readSchema),
  asyncHandler(async (req, res) => {
    const ids = req.body.ids as string[] | 'all';
    const r = await prisma.notification.updateMany({
      where: { ...adminScope(req.user!.sub), readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    sendSuccess(res, { updated: r.count });
  }),
);

// ---- Settings (ADMIN) ----

router.get(
  '/settings',
  requirePermission('notifications.settings'),
  asyncHandler(async (_req, res) => {
    const s = await getNotificationSettings();
    sendSuccess(res, {
      recipients: s.recipients,
      effectiveRecipients: await businessRecipients(),
      envRecipients: env.businessNotificationEmails,
      emailEnabled: s.emailEnabled,
      emailMinSeverity: s.emailMinSeverity,
      mutedCategories: s.mutedCategories,
      retentionDays: s.retentionDays,
      emailProviderConfigured: Boolean(env.resendApiKey),
      categories: CATEGORIES,
      severities: SEVERITIES,
      updatedAt: s.updatedAt,
    });
  }),
);

router.put(
  '/settings',
  requirePermission('notifications.settings'),
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const input = req.body as z.infer<typeof settingsSchema>;
    const before = await getNotificationSettings();
    const data = { ...input, ...(input.recipients ? { recipients: [...new Set(input.recipients)] } : {}), updatedById: actor.id };
    const saved = await prisma.$transaction(async (tx) => {
      const s = await tx.notificationSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
      await audit(tx, actor, {
        action: 'notifications.settings_update',
        entityType: 'NotificationSettings',
        entityId: 'default',
        before: { recipients: before.recipients, emailEnabled: before.emailEnabled, emailMinSeverity: before.emailMinSeverity, mutedCategories: before.mutedCategories, retentionDays: before.retentionDays },
        after: { recipients: s.recipients, emailEnabled: s.emailEnabled, emailMinSeverity: s.emailMinSeverity, mutedCategories: s.mutedCategories, retentionDays: s.retentionDays },
      });
      return s;
    });
    sendSuccess(res, saved, 'Notification settings saved');
  }),
);

// Recent event emails and their delivery state (ADMIN): what was queued vs accepted vs failed.
router.get(
  '/deliveries',
  requirePermission('notifications.settings'),
  asyncHandler(async (_req, res) => {
    sendSuccess(
      res,
      await prisma.adminEvent.findMany({
        where: { emailStatus: { not: 'NONE' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, category: true, severity: true, title: true, emailStatus: true, emailAttempts: true, emailError: true, createdAt: true },
      }),
    );
  }),
);

// ---- Realtime stream (SSE) ----

const MAX_STREAMS_PER_USER = 3;
const MAX_STREAMS_TOTAL = 200;
const HEARTBEAT_MS = 25_000;
const SESSION_RECHECK_MS = 60_000;
const streams = new Map<string, Set<Response>>();
let totalStreams = 0;

/** Exposed for tests. */
export const streamStats = () => ({ total: totalStreams, users: streams.size });

/** Graceful shutdown: open streams would otherwise keep server.close() waiting forever. */
export function endAllStreams(): void {
  for (const set of streams.values()) for (const res of [...set]) res.end();
}

router.get(
  '/stream',
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const sid = req.user!.sid;
    if (totalStreams >= MAX_STREAMS_TOTAL) throw new ApiError(503, 'Too many live connections; the page will refresh periodically instead');
    const mine = streams.get(userId) ?? new Set<Response>();
    // Bounded per user: the oldest tab's stream is closed (its client reconnects or falls back to polling).
    if (mine.size >= MAX_STREAMS_PER_USER) [...mine][0].end();

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    mine.add(res);
    streams.set(userId, mine);
    totalStreams += 1;

    // Registered before any await: a client that disconnects while the replay queries run
    // must still release its slot (otherwise the counter leaks until every stream gets 503).
    let closed = false;
    const timers: { heartbeat?: NodeJS.Timeout; recheck?: NodeJS.Timeout } = {};
    const onEvent = (n: PushedNotification) => write(n);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timers.heartbeat);
      clearInterval(timers.recheck);
      notificationBus.off(`user:${userId}`, onEvent);
      mine.delete(res);
      if (!mine.size) streams.delete(userId);
      totalStreams -= 1;
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);

    const write = (n: PushedNotification) => res.write(`id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`);
    res.write('retry: 5000\n\n');

    try {
      // Missed-notification recovery: everything newer than the last event the client saw (max 50).
      const lastId = (req.get('last-event-id') || (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : '')).trim();
      if (/^[0-9a-f-]{36}$/i.test(lastId)) {
        const last = await prisma.notification.findFirst({ where: { id: lastId, userId }, select: { createdAt: true } });
        if (last) {
          const missed = await prisma.notification.findMany({
            where: { ...adminScope(userId), createdAt: { gt: last.createdAt } },
            orderBy: { createdAt: 'asc' },
            take: 50,
          });
          for (const n of missed) write({ ...n, readAt: null });
        }
      }
      const unread = await prisma.notification.count({ where: { ...adminScope(userId), readAt: null } });
      res.write(`event: ready\ndata: ${JSON.stringify({ unread })}\n\n`);
    } catch {
      // Headers are already sent, so the error handler cannot answer; the client reconnects or polls.
      res.end();
      return;
    }
    if (closed) return;

    notificationBus.on(`user:${userId}`, onEvent);
    timers.heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    // A logged-out, suspended or deleted user must not keep receiving events on an old stream.
    timers.recheck = setInterval(async () => {
      const s = await prisma.session
        .findUnique({ where: { id: sid }, select: { revokedAt: true, expiresAt: true, user: { select: { status: true, deletedAt: true } } } })
        .catch(() => null);
      if (!s || s.revokedAt || s.expiresAt.getTime() <= Date.now() || s.user.status !== 'ACTIVE' || s.user.deletedAt) res.end();
    }, SESSION_RECHECK_MS);
  }),
);

export default router;
