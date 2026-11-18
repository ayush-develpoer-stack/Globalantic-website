import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { sendNotificationEmail } from './training-email.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Side effects that must only happen after a transaction commits (emails).
 * Failures are logged and swallowed: the database change already happened and
 * the in-app notification is the source of truth.
 */
export class AfterCommit {
  private jobs: (() => Promise<void>)[] = [];

  add(job: () => Promise<void>): void {
    this.jobs.push(job);
  }

  async flush(): Promise<void> {
    const jobs = this.jobs;
    this.jobs = [];
    for (const job of jobs) {
      try {
        await job();
      } catch (err) {
        console.error('[after-commit] side effect failed:', err instanceof Error ? err.message : 'unknown error');
      }
    }
  }
}

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
  /** Also send an email copy after commit. */
  email?: boolean;
}

/** Creates an in-app notification (inside the caller's transaction) and optionally queues an email. */
export async function notify(db: Db, userId: string, input: NotificationInput, after?: AfterCommit): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;
  await db.notification.create({
    data: { userId, type: input.type, title: input.title, body: input.body, link: input.link ?? null },
  });
  if (input.email && after) {
    after.add(() => sendNotificationEmail(user.email, input.title, input.body, input.link));
  }
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; skip: number; take: number }) {
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: opts.skip, take: opts.take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread };
}

/** Marks notifications read. Scoped by userId so nobody can touch another user's rows. */
export async function markNotificationsRead(userId: string, ids: string[] | 'all'): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return result.count;
}
