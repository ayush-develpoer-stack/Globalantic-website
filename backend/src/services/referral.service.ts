import { Prisma, type ReferralSettings, type RewardStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { privacyHash, randomCode } from '../lib/crypto';
import { canonicalEmail } from '../lib/identity';
import { AfterCommit, notify } from './notification.service';

/**
 * Training referral programme.
 *
 * Every amount, window and rule comes from the ReferralSettings row — the
 * client never sends an amount. Rewards are created only from a verified
 * payment inside the payment transaction, and unique constraints on
 * (registrationId), (referredUserId) and (paymentId) make duplicates
 * impossible even under concurrency. See docs/REFERRAL_SYSTEM.md.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const CODE_LENGTH = 8;
const CODE_PATTERN = /^[A-Z2-9]{6,12}$/;
const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const VELOCITY_LIMIT = 5;
const CLICK_DEDUPE_MS = 24 * 60 * 60 * 1000;

export function normalizeCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return CODE_PATTERN.test(c) ? c : null;
}

export function referralLink(code: string): string {
  return `${env.trainingUrl}/register?ref=${encodeURIComponent(code)}`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getReferralSettings(db: Db = prisma): Promise<ReferralSettings> {
  return db.referralSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export interface ReferralSettingsInput {
  enabled?: boolean;
  rewardAmountPaise?: number;
  requireActiveEnrollment?: boolean;
  minPaidAmountPaise?: number;
  refundWindowDays?: number;
  attributionWindowDays?: number;
  maxRewardsPerReferrerPerMonth?: number | null;
}

/** Changes apply to rewards created afterwards; existing rewards keep their snapshot amount. */
export async function updateReferralSettings(actor: Actor, input: ReferralSettingsInput, reason: string) {
  return prisma.$transaction(async (tx) => {
    const before = await getReferralSettings(tx);
    const after = await tx.referralSettings.update({ where: { id: 1 }, data: { ...input, updatedById: actor.id } });
    await audit(tx, actor, { action: 'referral.settings_updated', entityType: 'ReferralSettings', entityId: '1', before, after, reason });
    return after;
  });
}

// ---------------------------------------------------------------------------
// Codes & clicks
// ---------------------------------------------------------------------------

async function referrerEligibility(db: Db, userId: string, settings: ReferralSettings) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, emailVerifiedAt: true, deletedAt: true },
  });
  if (!user || user.role !== 'STUDENT' || user.status !== 'ACTIVE' || user.deletedAt) {
    return { eligible: false, reason: 'Only active student accounts can refer.' };
  }
  if (!user.emailVerifiedAt) return { eligible: false, reason: 'Verify your email address to start referring.' };
  if (settings.requireActiveEnrollment) {
    const enrolled = await db.enrollment.count({ where: { studentId: userId, status: { in: ['ACTIVE', 'COMPLETED'] } } });
    if (!enrolled) return { eligible: false, reason: 'Referral codes unlock once you are enrolled in a course.' };
  }
  return { eligible: true, reason: null as string | null };
}

/** Returns the student's code, creating it on first eligible request. Generated server-side only. */
export async function ensureReferralCode(userId: string) {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing;
  const settings = await getReferralSettings();
  const eligibility = await referrerEligibility(prisma, userId, settings);
  if (!eligibility.eligible) return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.referralCode.create({ data: { userId, code: randomCode(CODE_LENGTH) } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await prisma.referralCode.findUnique({ where: { userId } });
        if (raced) return raced;
        continue; // code collision: try another
      }
      throw err;
    }
  }
  throw ApiError.internal('Could not generate a referral code. Please try again.');
}

/** Public: does this code exist and accept referrals? Reveals nothing about the referrer. */
export async function isCodeValid(rawCode: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const settings = await getReferralSettings();
  if (!settings.enabled) return false;
  const found = await prisma.referralCode.findUnique({
    where: { code },
    select: { status: true, user: { select: { status: true } } },
  });
  return Boolean(found && found.status === 'ACTIVE' && found.user.status === 'ACTIVE');
}

/** Records a link click (deduplicated per IP per 24h). Never fails the visitor's page. */
export async function recordClick(rawCode: string, ip?: string, userAgent?: string): Promise<{ valid: boolean }> {
  const code = normalizeCode(rawCode);
  if (!code) return { valid: false };
  const found = await prisma.referralCode.findUnique({ where: { code } });
  if (!found || found.status !== 'ACTIVE') return { valid: false };
  const ipHash = privacyHash(ip) ?? 'unknown';
  const recent = await prisma.referralClick.findFirst({
    where: { codeId: found.id, ipHash, createdAt: { gte: new Date(Date.now() - CLICK_DEDUPE_MS) } },
    select: { id: true },
  });
  if (!recent) {
    await prisma.referralClick.create({ data: { codeId: found.id, ipHash, userAgentHash: privacyHash(userAgent) } });
  }
  return { valid: await isCodeValid(code) };
}

// ---------------------------------------------------------------------------
// Funnel tracking (called from auth / admissions / payments)
// ---------------------------------------------------------------------------

export interface AttachInput {
  code: string;
  referredUserId: string;
  referredEmailCanonical: string;
  referredPhone: string;
  ipHash: string | null;
}

/**
 * Links a new account to a referrer. Invalid, disabled or self-referral codes
 * are ignored (the registration itself still succeeds) and the attempt is audited.
 */
export async function attachReferralOnRegistration(tx: Prisma.TransactionClient, input: AttachInput): Promise<void> {
  const settings = await getReferralSettings(tx);
  const code = normalizeCode(input.code);
  if (!settings.enabled || !code) return;
  const found = await tx.referralCode.findUnique({
    where: { code },
    include: { user: { select: { id: true, email: true, phone: true, status: true } } },
  });
  if (!found || found.status !== 'ACTIVE' || found.user.status !== 'ACTIVE') return;

  const referrer = found.user;
  const selfReferral =
    referrer.id === input.referredUserId ||
    canonicalEmail(referrer.email) === input.referredEmailCanonical ||
    (referrer.phone !== null && referrer.phone === input.referredPhone);
  if (selfReferral) {
    await audit(tx, null, {
      action: 'referral.self_referral_blocked',
      entityType: 'User',
      entityId: input.referredUserId,
      after: { codeId: found.id },
    });
    return;
  }

  const signals: string[] = [];
  if (input.ipHash) {
    const sameIp = await tx.session.count({
      where: { userId: referrer.id, ipHash: input.ipHash, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    });
    if (sameIp) signals.push('SAME_IP_AS_REFERRER');
  }
  const recent = await tx.referralRegistration.count({
    where: { referrerId: referrer.id, registeredAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_MS) } },
  });
  if (recent >= VELOCITY_LIMIT) signals.push('HIGH_REGISTRATION_VELOCITY');

  const registration = await tx.referralRegistration.create({
    data: {
      codeId: found.id,
      referrerId: referrer.id,
      referredUserId: input.referredUserId,
      ipHash: input.ipHash,
      fraudSignals: signals,
    },
  });
  if (signals.length) {
    await tx.fraudReview.create({ data: { registrationId: registration.id, signals } });
  }
  await audit(tx, null, {
    action: 'referral.registered',
    entityType: 'ReferralRegistration',
    entityId: registration.id,
    after: { referrerId: referrer.id, signals },
  });
}

async function advanceStage(tx: Prisma.TransactionClient, referredUserId: string, stage: 'VERIFIED' | 'ADMITTED') {
  const field = stage === 'VERIFIED' ? 'verifiedAt' : 'admittedAt';
  const from = stage === 'VERIFIED' ? ['REGISTERED'] : ['REGISTERED', 'VERIFIED'];
  await tx.referralRegistration.updateMany({
    where: { referredUserId, stage: { in: from as never } },
    data: { stage, [field]: new Date() },
  });
}

export const markReferralVerified = (tx: Prisma.TransactionClient, userId: string) => advanceStage(tx, userId, 'VERIFIED');
export const markReferralAdmitted = (tx: Prisma.TransactionClient, userId: string) => advanceStage(tx, userId, 'ADMITTED');

/**
 * Called inside the payment-verification transaction after a payment becomes
 * PAID. Creates at most one reward per referred student (DB-enforced).
 */
export async function onVerifiedPayment(
  tx: Prisma.TransactionClient,
  payment: { id: string; studentId: string; amountPaise: number },
  after: AfterCommit,
): Promise<void> {
  const registration = await tx.referralRegistration.findUnique({
    where: { referredUserId: payment.studentId },
    include: { reward: { select: { id: true } } },
  });
  if (!registration || registration.stage === 'DISQUALIFIED') return;

  await tx.referralRegistration.update({
    where: { id: registration.id },
    data: { stage: 'PAID', paidAt: registration.paidAt ?? new Date(), admittedAt: registration.admittedAt ?? new Date() },
  });
  if (registration.reward) return; // one reward per referred student

  const settings = await getReferralSettings(tx);
  if (!settings.enabled || payment.amountPaise < settings.minPaidAmountPaise) return;

  const eligibility = await referrerEligibility(tx, registration.referrerId, settings);
  if (!eligibility.eligible) {
    await audit(tx, null, {
      action: 'referral.reward_skipped',
      entityType: 'ReferralRegistration',
      entityId: registration.id,
      reason: eligibility.reason,
    });
    return;
  }

  const signals = [...((registration.fraudSignals as string[]) ?? [])];
  if (settings.maxRewardsPerReferrerPerMonth !== null) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const thisMonth = await tx.referralReward.count({
      where: { referrerId: registration.referrerId, createdAt: { gte: monthStart }, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    });
    if (thisMonth >= settings.maxRewardsPerReferrerPerMonth) signals.push('MONTHLY_CAP_EXCEEDED');
  }
  const openReview = await tx.fraudReview.count({ where: { registrationId: registration.id, status: 'OPEN' } });
  const status: RewardStatus = signals.length || openReview ? 'UNDER_REVIEW' : 'PENDING';

  // ON CONFLICT DO NOTHING: a concurrent duplicate cannot abort the payment transaction.
  const created = await tx.referralReward.createMany({
    data: [
      {
        registrationId: registration.id,
        referrerId: registration.referrerId,
        referredUserId: payment.studentId,
        paymentId: payment.id,
        amountPaise: settings.rewardAmountPaise,
        currency: settings.currency,
        status,
        eligibleAt: new Date(Date.now() + settings.refundWindowDays * 86_400_000),
      },
    ],
    skipDuplicates: true,
  });
  if (created.count !== 1) return;

  const reward = await tx.referralReward.findUniqueOrThrow({ where: { paymentId: payment.id } });
  if (signals.length && !openReview) {
    await tx.fraudReview.create({ data: { registrationId: registration.id, rewardId: reward.id, signals } });
  }
  await audit(tx, null, {
    action: 'referral.reward_created',
    entityType: 'ReferralReward',
    entityId: reward.id,
    after: { amountPaise: reward.amountPaise, status: reward.status, signals },
  });
  await notify(
    tx,
    registration.referrerId,
    {
      type: 'REFERRAL_REWARD',
      title: 'Referral reward pending',
      body: 'A student you referred has completed their admission payment. Your reward will be reviewed after the refund window.',
      link: `${env.internPortalUrl}/referrals`,
      email: true,
    },
    after,
  );
}

/** A refunded payment cancels its unpaid reward; a paid one is flagged for manual review. */
export async function onPaymentRefunded(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
  const reward = await tx.referralReward.findUnique({ where: { paymentId } });
  if (!reward) return;
  if (reward.status === 'PAID') {
    await tx.fraudReview.create({ data: { rewardId: reward.id, signals: ['PAYMENT_REFUNDED_AFTER_PAYOUT'] } });
    return;
  }
  const res = await tx.referralReward.updateMany({
    where: { id: reward.id, status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] } },
    data: { status: 'CANCELLED', cancelReason: 'Qualifying payment was refunded' },
  });
  if (res.count) {
    await audit(tx, null, {
      action: 'referral.reward_cancelled',
      entityType: 'ReferralReward',
      entityId: reward.id,
      before: { status: reward.status },
      after: { status: 'CANCELLED' },
      reason: 'payment refunded',
    });
  }
}

// ---------------------------------------------------------------------------
// Student dashboard
// ---------------------------------------------------------------------------

function maskName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first ? `${first[0].toUpperCase()}${'*'.repeat(Math.max(2, Math.min(first.length - 1, 6)))}` : 'Student';
}

export async function getStudentReferralDashboard(userId: string) {
  const settings = await getReferralSettings();
  const code = await ensureReferralCode(userId);
  const eligibility = await referrerEligibility(prisma, userId, settings);
  if (!code) {
    return {
      programEnabled: settings.enabled,
      eligible: false,
      reason: eligibility.reason,
      rewardAmountPaise: settings.rewardAmountPaise,
      currency: settings.currency,
      code: null,
      link: null,
      stats: null,
      referrals: [],
    };
  }

  const [clicks, registrations, rewards] = await Promise.all([
    prisma.referralClick.count({ where: { codeId: code.id } }),
    prisma.referralRegistration.findMany({
      where: { referrerId: userId },
      orderBy: { registeredAt: 'desc' },
      take: 100,
      include: {
        referred: { select: { name: true } },
        reward: { select: { status: true, amountPaise: true, eligibleAt: true, rejectionReason: true } },
      },
    }),
    prisma.referralReward.groupBy({ by: ['status'], where: { referrerId: userId }, _count: true, _sum: { amountPaise: true } }),
  ]);

  const byStage = (s: string[]) => registrations.filter((r) => s.includes(r.stage)).length;
  const rewardTotals = Object.fromEntries(
    rewards.map((r) => [r.status, { count: r._count, amountPaise: r._sum.amountPaise ?? 0 }]),
  );

  return {
    programEnabled: settings.enabled,
    eligible: eligibility.eligible && code.status === 'ACTIVE',
    reason: code.status !== 'ACTIVE' ? 'Your referral code has been disabled. Please contact support.' : eligibility.reason,
    rewardAmountPaise: settings.rewardAmountPaise,
    currency: settings.currency,
    refundWindowDays: settings.refundWindowDays,
    code: code.code,
    link: referralLink(code.code),
    stats: {
      clicks,
      registrations: registrations.length,
      verified: byStage(['VERIFIED', 'ADMITTED', 'PAID']),
      admitted: byStage(['ADMITTED', 'PAID']),
      paid: byStage(['PAID']),
      rewards: rewardTotals,
    },
    // Only a masked first name — never the referred student's email or phone.
    referrals: registrations.map((r) => ({
      id: r.id,
      name: maskName(r.referred.name),
      stage: r.stage,
      registeredAt: r.registeredAt,
      reward: r.reward,
    })),
  };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export async function listRewards(q: { status?: RewardStatus; skip: number; take: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.referralReward.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: {
        referrer: { select: { id: true, name: true, email: true } },
        registration: { select: { referred: { select: { id: true, name: true, email: true } }, fraudSignals: true, stage: true } },
        payment: { select: { id: true, amountPaise: true, status: true, verifiedAt: true } },
        payout: true,
        fraudReviews: { select: { id: true, status: true, signals: true } },
      },
    }),
    prisma.referralReward.count({ where }),
  ]);
  return { items, total };
}

export async function listReferralRegistrations(q: { skip: number; take: number; stage?: string }) {
  const where = q.stage ? { stage: q.stage as never } : {};
  const [items, total] = await Promise.all([
    prisma.referralRegistration.findMany({
      where,
      orderBy: { registeredAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: {
        code: { select: { code: true } },
        referrer: { select: { id: true, name: true, email: true } },
        referred: { select: { id: true, name: true, email: true } },
        reward: { select: { id: true, status: true, amountPaise: true } },
      },
    }),
    prisma.referralRegistration.count({ where }),
  ]);
  return { items, total };
}

export type RewardDecision = 'APPROVE' | 'REJECT' | 'UNDER_REVIEW';

export async function reviewReward(actor: Actor, rewardId: string, decision: RewardDecision, reason?: string) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.referralReward.findUnique({ where: { id: rewardId }, include: { payment: { select: { status: true } } } });
    if (!found) throw ApiError.notFound('Reward not found');
    // Fraud reviews can be attached to the reward or to the underlying referral registration.
    const fraudReviews = await tx.fraudReview.findMany({
      where: { OR: [{ rewardId }, { registrationId: found.registrationId }] },
      select: { status: true },
    });
    const reward = { ...found, fraudReviews };
    if (reward.referrerId === actor.id) throw ApiError.forbidden('You cannot review your own referral reward');

    let next: RewardStatus;
    if (decision === 'APPROVE') {
      if (reward.payment.status !== 'PAID') throw ApiError.conflict('The qualifying payment is no longer in a paid state');
      if (reward.eligibleAt.getTime() > Date.now()) {
        throw ApiError.conflict(`This reward cannot be approved before ${reward.eligibleAt.toISOString().slice(0, 10)} (refund window)`);
      }
      if (reward.fraudReviews.some((f) => f.status === 'OPEN')) throw ApiError.conflict('Resolve the open fraud review first');
      if (reward.fraudReviews.some((f) => f.status === 'CONFIRMED')) throw ApiError.conflict('Fraud was confirmed for this referral');
      next = 'APPROVED';
    } else if (decision === 'REJECT') {
      if (!reason?.trim()) throw ApiError.validation([{ field: 'reason', message: 'A rejection reason is required' }]);
      next = 'REJECTED';
    } else {
      next = 'UNDER_REVIEW';
    }

    // Conditional update: only from the allowed states, so concurrent reviews cannot double-apply.
    const allowedFrom: RewardStatus[] = decision === 'REJECT' ? ['PENDING', 'UNDER_REVIEW', 'APPROVED'] : ['PENDING', 'UNDER_REVIEW'];
    const res = await tx.referralReward.updateMany({
      where: { id: rewardId, status: { in: allowedFrom } },
      data: {
        status: next,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        rejectionReason: next === 'REJECTED' ? reason!.trim() : null,
      },
    });
    if (res.count !== 1) throw ApiError.conflict(`A reward in status ${reward.status} cannot be moved to ${next}`);

    await audit(tx, actor, {
      action: `referral.reward_${next.toLowerCase()}`,
      entityType: 'ReferralReward',
      entityId: rewardId,
      before: { status: reward.status },
      after: { status: next },
      reason: reason ?? null,
    });
    if (next === 'APPROVED' || next === 'REJECTED') {
      await notify(
        tx,
        reward.referrerId,
        {
          type: 'REFERRAL_REWARD',
          title: next === 'APPROVED' ? 'Referral reward approved' : 'Referral reward not approved',
          body:
            next === 'APPROVED'
              ? 'Your referral reward has been approved and will be paid out soon.'
              : `Your referral reward was not approved. Reason: ${reason}`,
          link: `${env.internPortalUrl}/referrals`,
          email: true,
        },
        after,
      );
    }
    return tx.referralReward.findUniqueOrThrow({ where: { id: rewardId } });
  });
  await after.flush();
  return result;
}

export async function recordPayout(
  actor: Actor,
  rewardId: string,
  input: { method: 'UPI' | 'BANK_TRANSFER' | 'OTHER'; reference: string; notes?: string },
) {
  const after = new AfterCommit();
  const result = await prisma.$transaction(async (tx) => {
    const reward = await tx.referralReward.findUnique({ where: { id: rewardId } });
    if (!reward) throw ApiError.notFound('Reward not found');
    if (reward.referrerId === actor.id) throw ApiError.forbidden('You cannot pay out your own referral reward');
    const res = await tx.referralReward.updateMany({ where: { id: rewardId, status: 'APPROVED' }, data: { status: 'PAID' } });
    if (res.count !== 1) throw ApiError.conflict('Only approved rewards can be paid out');
    const payout = await tx.referralPayout.create({
      data: {
        rewardId,
        amountPaise: reward.amountPaise,
        method: input.method,
        reference: input.reference.trim(),
        notes: input.notes?.trim() || null,
        recordedById: actor.id,
      },
    });
    await audit(tx, actor, {
      action: 'referral.reward_paid',
      entityType: 'ReferralReward',
      entityId: rewardId,
      before: { status: 'APPROVED' },
      after: { status: 'PAID', payoutId: payout.id, method: input.method },
    });
    await notify(
      tx,
      reward.referrerId,
      {
        type: 'REFERRAL_REWARD',
        title: 'Referral reward paid',
        body: 'Your referral reward has been paid out. Thank you for recommending Globalantic Training!',
        link: `${env.internPortalUrl}/referrals`,
        email: true,
      },
      after,
    );
    return payout;
  });
  await after.flush();
  return result;
}

export async function listFraudReviews(q: { status?: 'OPEN' | 'CLEARED' | 'CONFIRMED'; skip: number; take: number }) {
  const where = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.fraudReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: {
        registration: {
          select: {
            id: true,
            stage: true,
            referrer: { select: { id: true, name: true, email: true } },
            referred: { select: { id: true, name: true, email: true } },
          },
        },
        reward: { select: { id: true, status: true, amountPaise: true } },
      },
    }),
    prisma.fraudReview.count({ where }),
  ]);
  return { items, total };
}

export async function resolveFraudReview(actor: Actor, id: string, outcome: 'CLEARED' | 'CONFIRMED', notes: string) {
  return prisma.$transaction(async (tx) => {
    const review = await tx.fraudReview.findUnique({ where: { id } });
    if (!review) throw ApiError.notFound('Fraud review not found');
    const res = await tx.fraudReview.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: outcome, notes, reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (res.count !== 1) throw ApiError.conflict('This review has already been resolved');

    if (outcome === 'CONFIRMED') {
      const registrationId =
        review.registrationId ??
        (review.rewardId ? (await tx.referralReward.findUnique({ where: { id: review.rewardId } }))?.registrationId : null);
      if (registrationId) {
        await tx.referralRegistration.update({
          where: { id: registrationId },
          data: { stage: 'DISQUALIFIED', disqualifiedReason: notes },
        });
        await tx.referralReward.updateMany({
          where: { registrationId, status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED'] } },
          data: { status: 'REJECTED', rejectionReason: `Fraud confirmed: ${notes}`, reviewedById: actor.id, reviewedAt: new Date() },
        });
      }
    }
    await audit(tx, actor, {
      action: `referral.fraud_${outcome.toLowerCase()}`,
      entityType: 'FraudReview',
      entityId: id,
      before: { status: 'OPEN' },
      after: { status: outcome },
      reason: notes,
    });
    return tx.fraudReview.findUniqueOrThrow({ where: { id } });
  });
}

export async function setCodeStatus(actor: Actor, codeId: string, status: 'ACTIVE' | 'DISABLED', reason: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.referralCode.findUnique({ where: { id: codeId } });
    if (!before) throw ApiError.notFound('Referral code not found');
    const updated = await tx.referralCode.update({ where: { id: codeId }, data: { status } });
    await audit(tx, actor, {
      action: `referral.code_${status.toLowerCase()}`,
      entityType: 'ReferralCode',
      entityId: codeId,
      before: { status: before.status },
      after: { status },
      reason,
    });
    return updated;
  });
}

export async function referralAuditLog(q: { skip: number; take: number }) {
  const where = { entityType: { in: ['ReferralReward', 'ReferralRegistration', 'ReferralSettings', 'ReferralCode', 'FraudReview'] } };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

export async function referralOverview() {
  const [settings, codes, clicks, stages, rewards, openFraud] = await Promise.all([
    getReferralSettings(),
    prisma.referralCode.count(),
    prisma.referralClick.count(),
    prisma.referralRegistration.groupBy({ by: ['stage'], _count: true }),
    prisma.referralReward.groupBy({ by: ['status'], _count: true, _sum: { amountPaise: true } }),
    prisma.fraudReview.count({ where: { status: 'OPEN' } }),
  ]);
  return {
    settings,
    codes,
    clicks,
    stages: Object.fromEntries(stages.map((s) => [s.stage, s._count])),
    rewards: Object.fromEntries(rewards.map((r) => [r.status, { count: r._count, amountPaise: r._sum.amountPaise ?? 0 }])),
    openFraudReviews: openFraud,
  };
}

/** All referral codes with their owner, click and registration counts (referrals.read). */
export async function listReferralCodes(q: { search?: string; skip: number; take: number }) {
  const where: Prisma.ReferralCodeWhereInput = q.search
    ? { OR: [{ code: { contains: q.search.toUpperCase() } }, { user: { name: { contains: q.search, mode: 'insensitive' } } }, { user: { email: { contains: q.search, mode: 'insensitive' } } }] }
    : {};
  const [items, total] = await Promise.all([
    prisma.referralCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: q.skip,
      take: q.take,
      include: { user: { select: { id: true, name: true, email: true, status: true } }, _count: { select: { clicks: true, registrations: true } } },
    }),
    prisma.referralCode.count({ where }),
  ]);
  return { items, total };
}
