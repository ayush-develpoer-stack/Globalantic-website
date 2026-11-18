import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { safeEqual, sha256 } from '../lib/crypto';

/**
 * Rate limits. Each export is its OWN limiter instance with its own counter,
 * so e.g. submitting contact forms can never lock someone out of login.
 * Limits are per client IP (`trust proxy` = 1 hop) unless a keyGenerator says otherwise.
 * Under NODE_ENV=test the IP-based limits are raised so the test suite is not throttled.
 */
const WINDOW_15_MIN = 15 * 60 * 1000;
const message = (text: string) => ({ success: false, message: text, errors: [] });

function limiter(max: number, text: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs: WINDOW_15_MIN,
    max: env.isTest ? 100_000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message(text),
    ...extra,
  });
}

/**
 * Generous limiter for public read/browse endpoints (all of /api).
 * Exam autosaves are excluded: a whole class may sit behind one college IP. They have
 * their own per-user limiter (examSaveLimiter) after authentication.
 */
export const apiLimiter = limiter(300, 'Too many requests, please try again later.', {
  skip: (req: Request) => (req.method === 'PUT' && /^\/exams\/student\/attempts\/[^/]+\/answers$/.test(req.path)) || isInternalCall(req),
  // Signed-in portal users make 5–7 API calls per page, and a whole office may share one IP:
  // count them per session (higher budget) instead of per IP. apiIpBackstop still caps each IP,
  // so rotating made-up session cookies cannot lift the anonymous limit.
  keyGenerator: (req: Request) => apiClientKey(req),
  max: (req: Request) => (env.isTest ? 100_000 : apiClientKey(req).startsWith('session:') ? 1200 : 300),
});

/** Bucket for apiLimiter: the session token's hash when one is sent, otherwise the client IP. */
export function apiClientKey(req: Request): string {
  const cookie = (req.cookies as Record<string, string> | undefined)?.globalantic_token;
  const header = req.headers.authorization;
  const token = cookie || (header?.startsWith('Bearer ') ? header.slice(7) : '');
  return token ? `session:${sha256(token).slice(0, 32)}` : `ip:${req.ip}`;
}

/** Per-IP ceiling over all API traffic (signed in or not); server-to-server calls are exempt. */
export const apiIpBackstop = limiter(3000, 'Too many requests, please try again later.', {
  skip: (req: Request) => isInternalCall(req),
});

/**
 * Server-to-server calls from our own Next.js servers (SSR/ISR) all arrive from a few hosting
 * egress IPs, so a per-IP read limit would throttle every visitor at once. They carry
 * X-Internal-Token (INTERNAL_API_TOKEN, server-only) and skip ONLY this global read limiter —
 * login, form, account and per-user limiters still apply.
 */
export function isInternalCall(req: Request): boolean {
  const token = env.internalApiToken;
  const given = req.get('x-internal-token');
  return Boolean(token && given && safeEqual(given, token));
}

/** Login attempts per IP. */
export const loginLimiter = limiter(20, 'Too many sign-in attempts. Please try again later.');

/**
 * Login attempts per account (in addition to loginLimiter), so a distributed
 * attack on one account is still throttled. Not relaxed in tests (tested behaviour).
 */
export const loginAccountLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `login:${email}`;
  },
  message: message('Too many sign-in attempts for this account. Please wait 15 minutes and try again.'),
});

/**
 * Account flows that send email or consume one-time tokens: register, verify
 * email, resend verification, forgot/reset/change password. This is also the
 * limiter to use for any future OTP endpoint.
 */
export const authFlowLimiter = limiter(10, 'Too many attempts. Please wait a few minutes and try again.');

/** Public lead-capture forms: contact, legacy training apply, careers, newsletter. */
export const formLimiter = limiter(20, 'Too many submissions. Please try again later.');

/** Public lookups that must not be enumerated quickly: referral codes, certificate verification. */
export const lookupLimiter = limiter(60, 'Too many requests, please try again later.');

/**
 * @deprecated Kept for backward compatibility; use the purpose-specific limiters above.
 * It is a separate instance, so it no longer shares a counter with login.
 */
export const strictLimiter = limiter(20, 'Too many attempts, please try again later.');

/** Anonymous CTA / WhatsApp click counter (per IP). */
export const trackLimiter = limiter(120, 'Too many requests, please try again later.');

/** Exam autosave — per signed-in user (the client saves at most every few seconds). */
export const examSaveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isTest ? 100_000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `user:${req.user?.sub ?? req.ip}`,
  message: message('Saving too often. Your answers are kept; the next save will retry.'),
});

/** Sensitive authenticated writes (payments, submissions) — per user. */
export const userWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isTest ? 100_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `user:${req.user?.sub ?? req.ip}`,
  message: message('Too many requests, please slow down.'),
});
