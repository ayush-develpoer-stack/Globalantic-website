# Training Referral System

**Status:** implemented and tested (`backend/tests/referral.test.ts`, 10 tests). Code: `backend/src/services/referral.service.ts`.

## Rules (all server-side)

| Rule | Value / behaviour | Where it lives |
|---|---|---|
| Reward amount | **₹2,000** initially (`rewardAmountPaise = 200000`). Editable only by `referrals.settings` (ADMIN), with a mandatory reason; audited. | `referral_settings` row (id = 1). **Not** in any frontend code. Portals read it from `/api/training/referrals/program` or the student dashboard. |
| Who may refer | Active, email-verified STUDENT. With `requireActiveEnrollment` (default on), only after an ACTIVE/COMPLETED enrollment. | `referrerEligibility()` |
| Code | One per student, 8 characters from `A–Z2–9` without look-alikes, generated **server-side** on the first eligible request. Unique constraint. | `ensureReferralCode()` |
| Link | `https://training.globalantic.com/register?ref=CODE`. The host comes from `TRAINING_URL`. Contains no phone, email or name. | `referralLink()` |
| Attribution | The code is entered at registration (pre-filled from `?ref=`), or at the first application if none was used. One referrer per account, ever (`referredUserId` is unique). | `attachReferralOnRegistration()` |
| Qualifying event | A **verified payment** (`PAID`) of at least `minPaidAmountPaise` (default 0). The reward is created inside the payment transaction. | `onVerifiedPayment()` |
| Refund window | The reward becomes approvable only after `eligibleAt = paidAt + refundWindowDays` (default 7). | `reviewReward()` |
| Monthly cap | Optional `maxRewardsPerReferrerPerMonth`. Exceeding it sends the reward to `UNDER_REVIEW`; it is not silently dropped. | |
| Offline payments | Always go to `UNDER_REVIEW`. | `recordOfflinePayment()` |
| Payout | Manual (UPI / bank transfer / other), recorded with a reference by `referrals.payout`. No automated transfers. | `recordPayout()` |

## Funnel tracking
`ReferralClick` → `ReferralRegistration.stage`: `REGISTERED → VERIFIED → ADMITTED → PAID` (or `DISQUALIFIED`), with a timestamp per stage → `ReferralReward.status` → `ReferralPayout`. The student dashboard shows clicks, registrations, verified, admitted and paid counts, plus reward totals by status. Referred students appear with a **masked first name only**.

Reward status machine (conditional updates, so concurrent reviews cannot double-apply):
```
PENDING ─┬─> UNDER_REVIEW ─┬─> APPROVED ──> PAID
         │                 └─> REJECTED (reason)
         ├─> APPROVED / REJECTED
any unpaid ─> CANCELLED   (qualifying payment refunded)
```

## Abuse prevention
| Threat | Control | Test |
|---|---|---|
| Self-referral | Same account, **canonical email** (Gmail dots and `+tags` removed), or the same normalised phone as the referrer: the code is ignored and the attempt is audited | ✓ |
| Multiple accounts per person | Unique `users.email`, unique normalised `users.phone`, canonical-email duplicate check at registration (no enumeration: the owner is emailed instead) | ✓ |
| Duplicate rewards | Unique `registrationId`, `referredUserId` and `paymentId` on `referral_rewards`, plus `INSERT … ON CONFLICT DO NOTHING`; webhook replay protection upstream | ✓ (second course, second payment, webhook replay) |
| Code tampering | Strict format check, server lookup, disabled codes refused, `validate` reveals only a boolean | ✓ |
| Client-side amount manipulation | Amount snapshotted from settings at creation; request bodies stripped by Zod; settings PUT is ADMIN-only | ✓ |
| Unauthorised approval | `referrals.review` / `referrals.payout` permissions; the referrer can never review or pay their own reward | ✓ |
| Approval before refund window / during open fraud review / after refund | Blocked (409); refunds cancel unpaid rewards; a refund after payout opens a fraud review for clawback | ✓ |
| Replay | Payment webhooks deduplicated by event id; tokens single-use | ✓ |
| Rate abuse | `strictLimiter` on click/validate; clicks deduplicated per IP hash per 24 h | ✓ |

**Fraud signals** are stored on the registration and open a `FraudReview`:
- `SAME_IP_AS_REFERRER`: the registration IP hash matches a referrer session in the last 30 days.
- `HIGH_REGISTRATION_VELOCITY`: 5 or more referrals in 24 h.
- `MONTHLY_CAP_EXCEEDED`
- `PAYMENT_REFUNDED_AFTER_PAYOUT`

Resolving a review as `CONFIRMED` disqualifies the registration and rejects any unpaid reward. IPs are stored only as keyed hashes (`HASH_SALT`).

## Admin operations (admin app → Referrals)
- **Overview:** the funnel and reward totals.
- **Settings:** amount, enabled, eligibility, windows and cap, with a reason.
- **Rewards:** approve, reject with a reason, move to review, record a payout.
- **Registrations** (history), **Fraud reviews** (resolve), **Audit log** (every referral action with actor, before/after and reason).

## API
See the Referrals rows in `API_DOCUMENTATION.md`.

## Business decisions still open
These were R-1…R-9 in `CURRENT_PROJECT_AUDIT.md`. The defaults are implemented and every value can be changed in Settings. Still to confirm: whether rewards should also apply to internship programmes, and the payout cadence.
