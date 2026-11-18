import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

type Db = Prisma.TransactionClient | typeof prisma;

export interface Actor {
  id: string;
  role: string;
  ipHash?: string | null;
  /** Effective permissions (role + individual grants) when known. */
  permissions?: readonly string[];
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Appends an audit record. Call it with the transaction client so the audit
 * row commits (or rolls back) together with the change it describes.
 */
export async function audit(db: Db, actor: Actor | null, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? 'SYSTEM',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(entry.before)) as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as Prisma.InputJsonValue),
      reason: entry.reason ?? null,
      ipHash: actor?.ipHash ?? null,
    },
  });
}
