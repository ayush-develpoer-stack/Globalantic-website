import { NextFunction, Request, Response } from 'express';
import { verifyToken, JwtPayload } from '../utils/token';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../config/database';
import { effectivePermissions, type Permission } from '../lib/permissions';
import { privacyHash } from '../lib/crypto';
import { audit, type Actor } from '../lib/audit';
import { isAccessExpired, suspendExpiredAccount } from '../lib/access-expiry';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload & { permissions?: Permission[] };
    }
  }
}

const TOKEN_COOKIE = 'globalantic_token';

function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[TOKEN_COOKIE];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

/**
 * Verifies the JWT *and* the server-side session it points to. Logout,
 * suspension and password resets revoke sessions, so a copied token stops
 * working immediately. The role is always taken from the database, never
 * from the token, so role changes apply on the next request.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    next(ApiError.unauthorized('Invalid or expired session'));
    return;
  }
  if (!payload.sid || !payload.sub) {
    next(ApiError.unauthorized('Invalid or expired session'));
    return;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, role: true, status: true, deletedAt: true, permissionGrants: { select: { permission: true } } } },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt
    ) {
      next(ApiError.unauthorized('Invalid or expired session'));
      return;
    }
    const grants = session.user.permissionGrants.map((g) => g.permission);
    if (isAccessExpired(grants)) {
      await suspendExpiredAccount(session.user.id, session.user.role);
      next(ApiError.unauthorized('Temporary access for this account has ended'));
      return;
    }
    req.user = {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sid: payload.sid,
      permissions: effectivePermissions(session.user.role, grants),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Decodes the request token without throwing (used by logout). */
export function verifyTokenSafe(req: Request): JwtPayload | null {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/** Legacy guard for the corporate CMS routes: ADMIN only (unchanged behaviour). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    next(ApiError.forbidden('Admin access required'));
    return;
  }
  next();
}

/**
 * Allows the request only if the user's effective permissions (role + individual
 * grants) include *every* listed permission. Denials are recorded in the audit
 * log as security events (best effort; never blocks the response).
 */
export function requirePermission(...permissions: Permission[]) {
  const guard = (req: Request, _res: Response, next: NextFunction): void => {
    const granted = req.user?.permissions ?? [];
    const missing = permissions.filter((p) => !granted.includes(p));
    if (missing.length) {
      if (req.user) {
        void audit(prisma, { id: req.user.sub, role: req.user.role, ipHash: privacyHash(req.ip) }, {
          action: 'security.forbidden',
          entityType: 'Route',
          entityId: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`.slice(0, 200),
          after: { missing },
        }).catch(() => {});
      }
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }
    next();
  };
  // Read by scripts/api-inventory.ts to document each route's access rule.
  return Object.assign(guard, { permissions, mode: 'all' as const });
}

/** Allows the request if the user has *any* of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]) {
  const guard = (req: Request, res: Response, next: NextFunction): void => {
    const granted = req.user?.permissions ?? [];
    const hit = permissions.find((p) => granted.includes(p));
    if (hit) return next();
    requirePermission(permissions[0])(req, res, next);
  };
  return Object.assign(guard, { permissions, mode: 'any' as const });
}

/** The authenticated actor, for services and audit logs. */
export function actorOf(req: Request): Actor {
  if (!req.user) throw ApiError.unauthorized('Authentication required');
  return { id: req.user.sub, role: req.user.role, ipHash: privacyHash(req.ip), permissions: req.user.permissions ?? [] };
}

export { TOKEN_COOKIE };
