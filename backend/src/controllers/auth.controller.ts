import { Request, Response } from 'express';
import {
  authenticate,
  changePassword,
  forgotPassword,
  getCurrentUser,
  registerStudent,
  resendVerification,
  resetPassword,
  revokeSession,
  verifyEmail,
} from '../services/auth.service';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { TOKEN_COOKIE, verifyTokenSafe } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { STAFF_ROLES } from '../lib/permissions';
import { toSessionDate } from '../services/learning.service';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/**
 * COOKIE_DOMAIN shares the session across portal subdomains. Browsers drop a cookie whose
 * Domain doesn't cover the responding host, so it is only set for hosts inside that domain
 * (otherwise sign-in never sticks on localhost).
 */
export function cookieDomainFor(hostname: string | undefined, cookieDomain: string | undefined): string | undefined {
  if (!cookieDomain) return undefined;
  const domain = cookieDomain.replace(/^\./, '').toLowerCase();
  const host = (hostname ?? '').toLowerCase();
  return host === domain || host.endsWith(`.${domain}`) ? cookieDomain : undefined;
}

function cookieOptions(req: Request) {
  const domain = cookieDomainFor(req.hostname, env.cookieDomain);
  return {
    httpOnly: true,
    // SameSite=None is only valid together with Secure.
    secure: env.isProd || env.cookieSameSite === 'none',
    sameSite: env.cookieSameSite,
    maxAge: SEVEN_DAYS,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authenticate(email, password, meta(req));

  res.cookie(TOKEN_COOKIE, result.token, cookieOptions(req));
  // The session token lives only in the httpOnly cookie (never in the body, where
  // page scripts could read it). Return just what the UI needs to render.
  const { id, name, email: userEmail, role, emailVerified } = result.user;
  sendSuccess(res, { user: { id, name, email: userEmail, role, emailVerified } }, 'Logged in successfully');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Revoke the server-side session so a copied token stops working too.
  const payload = verifyTokenSafe(req);
  if (payload?.sid) await revokeSession(payload.sid);
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions(req), maxAge: undefined });
  sendSuccess(res, null, 'Logged out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getCurrentUser(req.user!.sub);
  // Effective permissions = role + individual grants (computed by requireAuth).
  const permissions = req.user!.permissions ?? [];
  sendSuccess(res, { user: { ...user, permissions, isStaff: STAFF_ROLES.includes(user.role) } }, 'Current user');
});

const GENERIC_REGISTER =
  'Thanks! If the details are valid, we have sent a verification link to your email. Please check your inbox (and spam folder) to continue.';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { dateOfBirth, ...rest } = req.body as { dateOfBirth?: string } & Parameters<typeof registerStudent>[0];
  await registerStudent({ ...rest, ...(dateOfBirth ? { dateOfBirth: toSessionDate(dateOfBirth) } : {}) }, meta(req));
  sendSuccess(res, null, GENERIC_REGISTER, 202);
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  await verifyEmail(req.body.token);
  sendSuccess(res, null, 'Your email has been verified. You can now sign in and apply.');
});

export const resend = asyncHandler(async (req: Request, res: Response) => {
  await resendVerification(req.user!.sub);
  sendSuccess(res, null, 'If your email is not yet verified, a new link has been sent.');
});

export const forgot = asyncHandler(async (req: Request, res: Response) => {
  // Answer before doing the work: for a real account it waits on a DB write and the email
  // provider, so awaiting it would let response time reveal which emails have accounts.
  sendSuccess(res, null, 'If an account exists for that email, a password reset link has been sent.');
  forgotPassword(req.body.email).catch((err: unknown) =>
    console.error('[auth] forgot-password failed:', err instanceof Error ? err.message : 'unknown'),
  );
});

export const reset = asyncHandler(async (req: Request, res: Response) => {
  await resetPassword(req.body.token, req.body.password);
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions(req), maxAge: undefined });
  sendSuccess(res, null, 'Your password has been updated. Please sign in.');
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  await changePassword(req.user!.sub, req.user!.sid, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, null, 'Password changed. Other devices have been signed out.');
});
