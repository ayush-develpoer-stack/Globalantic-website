/**
 * Shared portal-access helpers (UI gating only). The backend is the final
 * authority: it re-checks the session, role, permission and ownership on
 * every request (backend/src/lib/permissions.ts).
 */
import type { Role } from '@globalantic/types';

export type Portal = 'website' | 'training' | 'intern' | 'employee' | 'admin' | 'trainer';

/** Roles that may enter each private portal (public portals: empty list). */
export const portalAccess: Record<Portal, Role[]> = {
  website: [],
  training: [],
  intern: ['STUDENT'],
  employee: ['EMPLOYEE'],
  admin: ['ADMIN', 'FINANCE', 'HR'],
  trainer: ['TRAINER'],
};

export function canAccessPortal(role: Role, portal: Portal): boolean {
  return portalAccess[portal]?.includes(role) ?? false;
}
