import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { audit } from './audit';

/**
 * Temporary accounts: an access-expiry marker is stored as a row in
 * user_permission_grants ("account.expires_at:<ISO date>"), so no schema change is
 * needed. It is not a permission (effectivePermissions ignores it), it can only be
 * set by scripts/temp-admin.ts, and the API cannot grant or revoke it.
 *
 * Once the date passes, the next login or authenticated request suspends the
 * account and ends its sessions.
 */
export const EXPIRY_PREFIX = 'account.expires_at:';

export function expiryMarker(at: Date): string {
  return `${EXPIRY_PREFIX}${at.toISOString()}`;
}

export function accessExpiresAt(grants: readonly string[]): Date | null {
  const marker = grants.find((g) => g.startsWith(EXPIRY_PREFIX));
  if (!marker) return null;
  const at = new Date(marker.slice(EXPIRY_PREFIX.length));
  // An unreadable marker counts as expired rather than as permanent access.
  return Number.isNaN(at.getTime()) ? new Date(0) : at;
}

export function isAccessExpired(grants: readonly string[], now = Date.now()): boolean {
  const at = accessExpiresAt(grants);
  return at !== null && at.getTime() <= now;
}

/** Suspends an expired account and revokes its sessions. Safe to call repeatedly. */
export async function suspendExpiredAccount(userId: string, role: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  const res = await db.user.updateMany({ where: { id: userId, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } });
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count) {
    await audit(db, null, { action: 'user.access_expired', entityType: 'User', entityId: userId, before: { status: 'ACTIVE', role }, after: { status: 'SUSPENDED' } });
  }
}
