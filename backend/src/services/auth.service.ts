import { Prisma, type Role } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/token';
import { privacyHash, randomToken, sha256 } from '../lib/crypto';
import { canonicalEmail, normalizeEmail, normalizePhone } from '../lib/identity';
import { audit, type Actor } from '../lib/audit';
import { isAccessExpired, suspendExpiredAccount } from '../lib/access-expiry';
import { AfterCommit } from './notification.service';
import {
  sendDuplicatePhoneEmail,
  sendExistingAccountEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from './training-email.service';
import type { DeliveryResult } from './email.service';
import { attachReferralOnRegistration, markReferralVerified } from './referral.service';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export const CONSENT_VERSION = '2026-10-15';

type TokenType = 'VERIFY_EMAIL' | 'RESET_PASSWORD';

/** A bcrypt hash of a random string: keeps login timing identical for unknown emails. */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken(16));
  return dummyHash;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerifiedAt: Date | null;
  status: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    status: user.status,
  };
}

/** Security audit for sign-in events. Unknown accounts are recorded by email hash only. */
async function authAudit(action: string, userId: string | null, email: string, meta: RequestMeta, role?: string) {
  try {
    if (userId) {
      await audit(prisma, { id: userId, role: role ?? 'UNKNOWN', ipHash: privacyHash(meta.ip) }, { action, entityType: 'User', entityId: userId });
    } else {
      await prisma.auditLog.create({
        data: { actorId: null, actorRole: 'ANONYMOUS', action, entityType: 'Auth', entityId: 'email:' + sha256(normalizeEmail(email)).slice(0, 16), ipHash: privacyHash(meta.ip) },
      });
    }
  } catch {
    // Auditing must never break sign-in.
  }
}

export async function authenticate(email: string, password: string, meta: RequestMeta = {}) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, include: { permissionGrants: { select: { permission: true } } } });
  if (!user || user.deletedAt) {
    await verifyPassword(password, await getDummyHash());
    await authAudit('auth.login_failed', null, email, meta);
    throw ApiError.unauthorized('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await authAudit('auth.login_failed', user.id, email, meta, user.role);
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status === 'ACTIVE' && isAccessExpired(user.permissionGrants.map((g) => g.permission))) {
    await suspendExpiredAccount(user.id, user.role);
    user.status = 'SUSPENDED';
  }
  // Only revealed after the password is proven, so this is not an enumeration oracle.
  if (user.status !== 'ACTIVE') {
    await authAudit('auth.login_blocked', user.id, email, meta, user.role);
    throw ApiError.forbidden('This account is suspended. Please contact support.');
  }

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash: privacyHash(meta.ip),
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await authAudit('auth.login_success', user.id, email, meta, user.role);

  const token = signToken({ sub: user.id, email: user.email, role: user.role, sid: session.id });
  return { token, user: publicUser(user) };
}

export async function revokeSession(sessionId: string): Promise<void> {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true, revokedAt: true, user: { select: { role: true } } } });
  const res = await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count && s) await audit(prisma, { id: s.userId, role: s.user.role }, { action: 'auth.logout', entityType: 'User', entityId: s.userId }).catch(() => {});
}

export async function revokeAllSessions(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, status: true, emailVerifiedAt: true, createdAt: true },
  });
  if (!user) {
    throw ApiError.unauthorized('Session no longer valid');
  }
  return { ...publicUser(user), createdAt: user.createdAt };
}

// ---------------------------------------------------------------------------
// One-time tokens
// ---------------------------------------------------------------------------

async function issueToken(db: Prisma.TransactionClient, userId: string, type: TokenType, ttlMs: number): Promise<string> {
  // Only the newest token of a type is valid.
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken();
  await db.authToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

const INVALID_LINK = 'This link is invalid or has expired. Please request a new one.';

/** Atomically consumes a token: a second (or concurrent) use fails. */
async function consumeToken(db: Prisma.TransactionClient, token: string, type: TokenType) {
  const record = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest(INVALID_LINK);
  }
  const claimed = await db.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw ApiError.badRequest(INVALID_LINK);
  return record;
}

function devLogLink(kind: string, token: string): void {
  // Local development without Resend: print the token so the flow can be completed.
  if (!env.isProd && !env.isTest && !env.resendApiKey) {
    console.info(`[dev] ${kind} token (email not configured): ${token}`);
  }
}

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  city?: string;
  dateOfBirth?: Date;
  referralCode?: string;
  consent: true;
}

/**
 * Creates a STUDENT account and sends a verification link.
 *
 * The response is identical whether or not the email/phone is already in use
 * (no account enumeration): the existing owner is emailed instead.
 */
export async function registerStudent(input: RegisterInput, meta: RequestMeta = {}): Promise<void> {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);
  }
  const canonical = canonicalEmail(email);

  const [byEmail, byPhone, byCanonical] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone }, select: { id: true } }),
    prisma.studentProfile.findFirst({ where: { emailCanonical: canonical }, select: { id: true } }),
  ]);
  if (byEmail || byCanonical) {
    await sendExistingAccountEmail(email).catch(() => {});
    return;
  }
  if (byPhone) {
    await sendDuplicatePhoneEmail(email).catch(() => {});
    return;
  }

  const passwordHash = await hashPassword(input.password);
  const after = new AfterCommit();
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          phone,
          name: input.fullName.trim(),
          passwordHash,
          role: 'STUDENT',
          studentProfile: {
            create: {
              city: input.city?.trim() || null,
              dateOfBirth: input.dateOfBirth ?? null,
              emailCanonical: canonical,
              consentAt: new Date(),
              consentVersion: CONSENT_VERSION,
            },
          },
        },
      });
      if (input.referralCode) {
        await attachReferralOnRegistration(tx, {
          code: input.referralCode,
          referredUserId: user.id,
          referredEmailCanonical: canonical,
          referredPhone: phone,
          ipHash: privacyHash(meta.ip),
        });
      }
      const token = await issueToken(tx, user.id, 'VERIFY_EMAIL', VERIFY_TTL_MS);
      await audit(tx, { id: user.id, role: 'STUDENT', ipHash: privacyHash(meta.ip) }, {
        action: 'student.registered',
        entityType: 'User',
        entityId: user.id,
      });
      after.add(() => sendVerificationEmail(email, user.name, token));
      devLogLink('verify-email', token);
    });
  } catch (err) {
    // A concurrent registration won the unique constraint: same generic outcome.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  await after.flush();
}

export async function verifyEmail(token: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const record = await consumeToken(tx, token, 'VERIFY_EMAIL');
    const user = await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
      select: { id: true, role: true },
    });
    await markReferralVerified(tx, user.id);
    await audit(tx, { id: user.id, role: user.role }, { action: 'user.email_verified', entityType: 'User', entityId: user.id });
  });
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerifiedAt) return;
  const token = await prisma.$transaction((tx) => issueToken(tx, user.id, 'VERIFY_EMAIL', VERIFY_TTL_MS));
  devLogLink('verify-email', token);
  await sendVerificationEmail(user.email, user.name, token).catch((err: unknown) =>
    console.error('[auth] verification email failed:', err instanceof Error ? err.message : 'unknown'),
  );
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** Always resolves the same way, whether or not the email exists. */
export async function forgotPassword(emailInput: string): Promise<DeliveryResult['status'] | null> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailInput) } });
  if (!user || user.deletedAt || user.status !== 'ACTIVE') return null;
  const token = await prisma.$transaction((tx) => issueToken(tx, user.id, 'RESET_PASSWORD', RESET_TTL_MS));
  devLogLink('reset-password', token);
  const r = await sendPasswordResetEmail(user.email, user.name, token);
  if (r.status === 'FAILED') console.error('[auth] reset email failed:', r.error);
  return r.status;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    const record = await consumeToken(tx, token, 'RESET_PASSWORD');
    const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
    await tx.user.update({
      where: { id: user.id },
      // Following an emailed link proves ownership of the address.
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    if (!user.emailVerifiedAt) await markReferralVerified(tx, user.id);
    await revokeAllSessions(tx, user.id);
    await audit(tx, { id: user.id, role: user.role }, { action: 'user.password_reset', entityType: 'User', entityId: user.id });
  });
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw ApiError.validation([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await revokeAllSessions(tx, userId, sessionId);
    await audit(tx, { id: userId, role: user.role }, { action: 'user.password_changed', entityType: 'User', entityId: userId });
  });
}

// ---------------------------------------------------------------------------
// Staff accounts (trainers / finance / editors) created by an admin
// ---------------------------------------------------------------------------

export type StaffRole = 'TRAINER' | 'FINANCE' | 'EDITOR' | 'HR' | 'EMPLOYEE' | 'SALES' | 'ADMIN';

/** Link that lets an invited user choose their password (same page as password reset). */
export function setPasswordLink(token: string): string {
  return `${env.trainingUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Creates an account with an unusable password and emails a single-use invite
 * link. `extra` runs in the same transaction (e.g. to create the employee or
 * intern profile), so a failure leaves nothing half-created. Which roles a caller
 * may create is decided by the caller (routes / users.service), not here.
 * `onToken` receives the invite token (never put it in a response unless the
 * email could not be delivered).
 */
export async function createStaffUser(
  actor: Actor,
  input: { name: string; email: string; phone?: string; role: StaffRole | 'STUDENT' },
  extra?: (tx: Prisma.TransactionClient, userId: string) => Promise<void>,
  onToken?: (token: string) => void,
) {
  const email = normalizeEmail(input.email);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) {
    throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);
  }
  // Unusable until the invite link is used to choose a password.
  const passwordHash = await hashPassword(randomToken(24));
  const after = new AfterCommit();
  // Reported to the caller so the UI never says "invitation sent" when it was skipped or failed.
  let inviteEmail: DeliveryResult['status'] = 'FAILED';
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, phone, name: input.name.trim(), role: input.role, passwordHash },
      select: { id: true, email: true, name: true, role: true, status: true, phone: true, createdAt: true },
    });
    if (extra) await extra(tx, created.id);
    const token = await issueToken(tx, created.id, 'RESET_PASSWORD', INVITE_TTL_MS);
    await audit(tx, actor, { action: 'user.staff_created', entityType: 'User', entityId: created.id, after: { role: created.role, email } });
    after.add(async () => {
      const r = await sendPasswordResetEmail(email, created.name, token, 'invite');
      inviteEmail = r.status;
      if (r.status === 'FAILED') console.error('[auth] invite email failed:', r.error);
    });
    devLogLink('invite', token);
    onToken?.(token);
    return created;
  });
  await after.flush();
  return { ...user, inviteEmail };
}

/** Response message for account-creating routes, true to what happened to the invitation email. */
export function inviteMessage(created: string, inviteEmail: DeliveryResult['status']): string {
  return inviteEmail === 'SENT'
    ? `${created} and invitation sent`
    : `${created}, but the invitation email was not sent (${inviteEmail === 'SKIPPED' ? 'email is not configured' : 'delivery failed'}). Use "Send password reset" to send it again.`;
}

/** Suspends or reactivates an account; suspension revokes every session immediately. */
export async function setUserStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string, opts: { allowAdmin?: boolean } = {}) {
  if (userId === actor.id) throw ApiError.forbidden('You cannot change the status of your own account');
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true } });
    if (!before) throw ApiError.notFound('User not found');
    // allowAdmin is only passed by users.service after its Super Admin check.
    if (before.role === 'ADMIN' && !opts.allowAdmin) throw ApiError.forbidden('Administrator accounts cannot be suspended here');
    const updated = await tx.user.update({ where: { id: userId }, data: { status }, select: { id: true, status: true } });
    if (status === 'SUSPENDED') await revokeAllSessions(tx, userId);
    await audit(tx, actor, {
      action: status === 'SUSPENDED' ? 'user.suspended' : 'user.reactivated',
      entityType: 'User',
      entityId: userId,
      before: { status: before.status },
      after: { status },
      reason,
    });
    return updated;
  });
}
