import type { Request } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Editorial approval for website content. Anyone with cms.manage writes and edits drafts;
 * only cms.publish (ADMIN, or a user it is granted to) puts content live, changes or deletes
 * live content, unpublishes or archives it. Every change stays in the audit log.
 */
export function canPublish(req: Request): boolean {
  return (req.user?.permissions ?? []).includes('cms.publish');
}

/** Publication fields a non-publisher may not set (editor forms send them; they are dropped). */
const LIVE_FIELDS = ['published', 'publishedAt', 'archivedAt', 'indexable'] as const;

/** Live content is changed only by a publisher. */
export function assertNotLive(current: unknown): void {
  if ((current as { published?: boolean } | null)?.published) {
    throw ApiError.forbidden('This content is live. Changes to published content need a publisher (cms.publish): ask an admin to make the change or unpublish it for editing.');
  }
}

/**
 * Removes publication fields from a non-publisher's write. Returns true when the editor asked
 * for publication (so the response can say the draft awaits approval).
 */
export function stripLiveFields(body: Record<string, unknown>): boolean {
  const requested = body.published === true || Boolean(body.publishedAt) || body.indexable === true;
  for (const f of LIVE_FIELDS) delete body[f];
  return requested;
}

export const AWAITING_APPROVAL = 'Saved as a draft. A publisher (admin) must review and publish it.';
