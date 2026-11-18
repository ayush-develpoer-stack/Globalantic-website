import { EventEmitter } from 'node:events';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { effectivePermissions, STAFF_ROLES, type Permission } from '../lib/permissions';
import { AfterCommit } from './notification.service';
import { esc, layout, sendLogged, type DeliveryResult } from './email.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Admin notification centre.
 *
 * A business event (new lead, verified payment, HR request...) is recorded ONCE as an AdminEvent
 * (unique dedupeKey -> retries and webhook replays are no-ops), copied to every authorised staff
 * member as a Notification in the same transaction, and pushed to open notification streams after
 * commit. Emails to the business recipients follow the notification settings and are tracked on
 * the event (QUEUED -> SENT/FAILED/SKIPPED); failures are retried by the dispatch job.
 */

export const CATEGORIES = ['lead', 'training', 'admission', 'program', 'payment', 'content', 'hr', 'system'] as const;
export type Category = (typeof CATEGORIES)[number];
export const SEVERITIES = ['info', 'important', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
const RANK: Record<Severity, number> = { info: 0, important: 1, critical: 2 };

/** Who sees each category (ADMIN holds every permission). */
const AUDIENCE: Record<Category, Permission> = {
  lead: 'leads.manage',
  training: 'training.admissions.read',
  admission: 'training.admissions.read',
  program: 'programs.read',
  payment: 'payments.read',
  content: 'cms.publish',
  hr: 'hr.requests.manage',
  system: 'users.manage',
};

export const MAX_EMAIL_ATTEMPTS = 5;

export interface AdminEventInput {
  /** Stable key for this occurrence, e.g. `lead.created:<leadId>`. Same key = same event. */
  dedupeKey: string;
  category: Category;
  severity: Severity;
  title: string;
  /** Safe summary: no passwords, tokens, payment secrets or unnecessary personal data. */
  body: string;
  /** Path inside the admin portal, e.g. `/leads/<id>`. */
  link?: string | null;
  entityType?: string;
  entityId?: string;
  /** Narrow the audience to a different permission than the category default. */
  audience?: Permission;
  /** Notification type for existing consumers (default ADMIN_<CATEGORY>). */
  type?: string;
  /** Only these users (plus every ADMIN) receive it, e.g. the owner of an assigned lead. */
  restrictTo?: string[];
  /**
   * Email the business recipients with the generic event template (subject to settings).
   * Use false when the caller already sends a dedicated, richer email for this event.
   */
  email?: boolean;
}

// ---- Realtime bus (single API instance; the database stays the source of truth) ----

export interface PushedNotification {
  id: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  readAt: null;
  createdAt: Date;
}
export const notificationBus = new EventEmitter();
notificationBus.setMaxListeners(0); // listeners are bounded by the stream connection limits instead

// ---- Settings & recipients ----

export async function getNotificationSettings(db: Db = prisma) {
  return (
    (await db.notificationSettings.findUnique({ where: { id: 'default' } })) ?? {
      id: 'default',
      recipients: [] as string[],
      emailEnabled: true,
      emailMinSeverity: 'important',
      mutedCategories: [] as string[],
      retentionDays: 180,
      updatedById: null,
      updatedAt: new Date(0),
    }
  );
}

/** Admin settings first, then BUSINESS_NOTIFICATION_EMAILS, then ADMIN_EMAIL. */
export async function businessRecipients(db: Db = prisma): Promise<string[]> {
  const s = await getNotificationSettings(db);
  if (s.recipients.length) return s.recipients;
  if (env.businessNotificationEmails.length) return env.businessNotificationEmails;
  return env.adminEmail ? [env.adminEmail] : [];
}

/** Whether an event of this category/severity should email the business recipients. */
export async function shouldEmail(category: Category, severity: Severity, db: Db = prisma): Promise<boolean> {
  const s = await getNotificationSettings(db);
  if (!s.emailEnabled || s.mutedCategories.includes(category)) return false;
  return RANK[severity] >= RANK[(s.emailMinSeverity as Severity) in RANK ? (s.emailMinSeverity as Severity) : 'important'];
}

async function audienceUserIds(db: Db, permission: Permission, restrictTo?: string[]): Promise<string[]> {
  const staff = await db.user.findMany({
    where: { role: { in: STAFF_ROLES }, status: 'ACTIVE', deletedAt: null },
    select: { id: true, role: true, permissionGrants: { select: { permission: true } } },
  });
  return staff
    .filter((u) => effectivePermissions(u.role, u.permissionGrants.map((g) => g.permission)).includes(permission))
    .filter((u) => !restrictTo || u.role === 'ADMIN' || restrictTo.includes(u.id))
    .map((u) => u.id);
}

// ---- Recording ----

/**
 * Records the event inside the caller's transaction. Returns false if this dedupeKey was already
 * recorded (nothing else happens). Emails and realtime pushes are queued on `after`.
 */
export async function recordAdminEvent(db: Db, input: AdminEventInput, after: AfterCommit): Promise<boolean> {
  const wantsEmail = input.email !== false && (await shouldEmail(input.category, input.severity, db));
  // ON CONFLICT DO NOTHING: a duplicate must not abort the caller's transaction.
  const created = await db.adminEvent.createMany({
    data: [
      {
        dedupeKey: input.dedupeKey.slice(0, 300),
        category: input.category,
        severity: input.severity,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 500),
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        emailStatus: wantsEmail ? 'QUEUED' : 'NONE',
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  const event = await db.adminEvent.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey.slice(0, 300) } });

  const userIds = await audienceUserIds(db, input.audience ?? AUDIENCE[input.category], input.restrictTo);
  if (userIds.length) {
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        eventId: event.id,
        type: input.type ?? `ADMIN_${input.category.toUpperCase()}`,
        category: input.category,
        severity: input.severity,
        title: event.title,
        body: event.body,
        link: event.link,
      })),
      skipDuplicates: true,
    });
  }

  after.add(async () => {
    const rows = await prisma.notification.findMany({ where: { eventId: event.id } });
    for (const n of rows) {
      const payload: PushedNotification = { id: n.id, type: n.type, category: n.category, severity: n.severity, title: n.title, body: n.body, link: n.link, readAt: null, createdAt: n.createdAt };
      notificationBus.emit(`user:${n.userId}`, payload);
    }
  });
  if (wantsEmail) after.add(() => emailEvent(event.id).then(() => undefined));
  return true;
}

/**
 * For callers outside a transaction (controllers, after-commit hooks, webhooks). Never throws.
 * `dedicatedEmail` replaces the generic event email with a richer one, sent to the business
 * recipients only if the settings allow this category/severity and the event is new.
 */
export async function emitAdminEvent(input: AdminEventInput, dedicatedEmail?: (to: string[]) => Promise<unknown>): Promise<void> {
  const after = new AfterCommit();
  try {
    const isNew = await prisma.$transaction((tx) => recordAdminEvent(tx, dedicatedEmail ? { ...input, email: false } : input, after));
    await after.flush();
    if (isNew && dedicatedEmail && (await shouldEmail(input.category, input.severity))) {
      const to = await businessRecipients();
      if (to.length) await dedicatedEmail(to);
    }
  } catch (err) {
    console.error('[admin-events] could not record event:', err instanceof Error ? err.message : 'unknown error');
  }
}

// ---- Email ----

function eventEmailHtml(e: { title: string; body: string; category: string; severity: string; link: string | null; entityType: string | null; entityId: string | null; createdAt: Date }) {
  const url = e.link ? (/^https?:\/\//.test(e.link) ? e.link : `${env.adminPortalUrl}${e.link.startsWith('/') ? '' : '/'}${e.link}`) : null;
  const when = e.createdAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return layout(
    e.title,
    `<p style="margin:0 0 12px;font-size:15px;">${esc(e.body)}</p>
     <p style="margin:4px 0;font-size:13px;color:#555;"><strong>Event:</strong> ${esc(e.category)} · ${esc(e.severity)}</p>
     <p style="margin:4px 0;font-size:13px;color:#555;"><strong>Time:</strong> ${esc(when)}</p>
     ${e.entityType ? `<p style="margin:4px 0;font-size:13px;color:#555;"><strong>Record:</strong> ${esc(e.entityType)} ${esc(e.entityId)}</p>` : ''}
     ${url ? `<p style="margin:18px 0 0;"><a href="${esc(url)}" style="background:#6d28d9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px;">Open in admin</a></p><p style="font-size:12px;color:#777;">Sign-in required.</p>` : ''}`,
  );
}

/** Sends (or re-sends) the event email. Only QUEUED/FAILED events under the attempt limit are sent. */
export async function emailEvent(eventId: string): Promise<DeliveryResult | null> {
  // Claim the attempt atomically so concurrent dispatchers never double-send.
  const claimed = await prisma.adminEvent.updateMany({
    where: { id: eventId, emailStatus: { in: ['QUEUED', 'FAILED'] }, emailAttempts: { lt: MAX_EMAIL_ATTEMPTS } },
    data: { emailAttempts: { increment: 1 }, emailStatus: 'QUEUED' },
  });
  if (!claimed.count) return null;
  const e = await prisma.adminEvent.findUniqueOrThrow({ where: { id: eventId } });
  const to = await businessRecipients();
  const r: DeliveryResult = to.length
    ? await sendLogged({ kind: `admin_event.${e.category}`, entityType: 'AdminEvent', entityId: e.id }, { to, subject: `[Globalantic] ${e.title}`, html: eventEmailHtml(e) })
    : { status: 'SKIPPED' };
  await prisma.adminEvent.update({
    where: { id: e.id },
    data: { emailStatus: r.status, emailError: r.status === 'FAILED' ? r.error : null },
  });
  return r;
}

/**
 * Scheduled job: retries failed/stuck event emails (bounded), and purges read notifications older
 * than the retention window. Returns counts for the caller to report.
 */
export async function dispatchPending(now = new Date()) {
  const stale = new Date(now.getTime() - 2 * 60_000); // QUEUED for >2 min = the after-commit send never finished
  const pending = await prisma.adminEvent.findMany({
    where: {
      emailAttempts: { lt: MAX_EMAIL_ATTEMPTS },
      OR: [{ emailStatus: 'FAILED' }, { emailStatus: 'QUEUED', createdAt: { lt: stale } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (const p of pending) {
    const r = await emailEvent(p.id);
    if (r?.status === 'SENT') sent += 1;
    else if (r?.status === 'FAILED') failed += 1;
  }
  const s = await getNotificationSettings();
  const purged = await prisma.notification.deleteMany({
    where: { eventId: { not: null }, readAt: { not: null, lt: new Date(now.getTime() - s.retentionDays * 86_400_000) } },
  });
  return { retried: pending.length, sent, failed, purged: purged.count };
}
