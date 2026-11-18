import { Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { createContentService, type AdminListFilter } from '../services/content.factory';
import { actorOf } from '../middleware/auth.middleware';
import { audit } from '../lib/audit';
import { prisma } from '../config/database';
import { AWAITING_APPROVAL, assertNotLive, canPublish, stripLiveFields } from '../lib/editorial';
import { ApiError } from '../utils/ApiError';
import { emitAdminEvent } from '../services/admin-events.service';

/** Admin portal screen per content entity (for notification links). */
const ADMIN_PATH: Record<string, string> = { BlogPost: '/website/blog', PortfolioProject: '/website/projects', Service: '/website/services' };
const LABEL: Record<string, string> = { BlogPost: 'Blog post', PortfolioProject: 'Portfolio project', Service: 'Service page', Solution: 'Solution page', Industry: 'Industry page' };

function contentEvent(entity: string | undefined, kind: 'published' | 'awaiting_approval', item: { id: string; title?: unknown }) {
  if (!entity) return Promise.resolve();
  const label = LABEL[entity] ?? entity;
  const title = typeof item.title === 'string' ? item.title : item.id;
  return emitAdminEvent({
    // One event per action (a later re-publish is a new event; a retried request within the same second is not).
    dedupeKey: `content.${kind}:${entity}:${item.id}:${Math.floor(Date.now() / 1000)}`,
    category: 'content',
    severity: 'info',
    title: kind === 'published' ? `${label} published: ${title}` : `${label} awaiting approval: ${title}`,
    body: kind === 'published' ? 'Now live on the website.' : 'An editor saved changes that need someone with publish rights.',
    link: ADMIN_PATH[entity] ? `${ADMIN_PATH[entity]}/${item.id}` : null,
    entityType: entity,
    entityId: item.id,
  });
}

/**
 * Optimistic concurrency: when the editor sends the updatedAt it loaded, a save on top of
 * someone else's newer change is refused instead of silently overwriting it.
 */
function assertNotStale(current: unknown, expected: unknown) {
  if (typeof expected !== 'string' || !expected) return;
  const at = (current as { updatedAt?: Date }).updatedAt;
  if (at && new Date(expected).getTime() !== at.getTime()) {
    throw ApiError.conflict('Someone else saved this item after you opened it. Reload to see their changes, then apply yours again.');
  }
}

type ContentService = ReturnType<typeof createContentService>;

interface ControllerOptions {
  /** When true, set publishedAt automatically from the `published` flag (blog). */
  trackPublishedAt?: boolean;
  /** Normalize empty-string foreign keys to null on write (blog categoryId). */
  nullableFields?: string[];
  /** Entity name for the audit log, e.g. "BlogPost". */
  entity?: string;
  /** Applied to every record served publicly (e.g. hide unapproved client details). */
  publicTransform?: (record: Record<string, unknown>) => Record<string, unknown>;
  /** Public list filter from query params (e.g. ?service=web-development). */
  publicFilter?: (query: Request['query']) => Record<string, unknown> | undefined;
}

export function createContentController(service: ContentService, options: ControllerOptions = {}) {
  function normalize(body: Record<string, unknown>): Record<string, unknown> {
    const data = { ...body };
    for (const field of options.nullableFields ?? []) {
      if (data[field] === '' || data[field] === undefined) data[field] = null;
    }
    if (typeof data.publishedAt === 'string') data.publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
    if (options.trackPublishedAt && data.published === true && !data.publishedAt) data.publishedAt = new Date();
    return data;
  }

  const record = async (req: Request, action: string, id: string, after?: Record<string, unknown>) => {
    if (!options.entity) return;
    await audit(prisma, actorOf(req), { action: `${options.entity.toLowerCase()}.${action}`, entityType: options.entity, entityId: id, ...(after ? { after: after as never } : {}) });
  };
  const show = (r: unknown) => (options.publicTransform ? options.publicTransform(r as Record<string, unknown>) : r);

  return {
    // ----- Public -----
    listPublic: asyncHandler(async (req: Request, res: Response) => {
      const items = await service.listPublished(options.publicFilter?.(req.query));
      sendSuccess(res, items.map(show));
    }),

    getPublicBySlug: asyncHandler(async (req: Request, res: Response) => {
      const item = await service.getPublishedBySlug(req.params.slug);
      sendSuccess(res, show(item));
    }),

    // ----- Admin -----
    listAll: asyncHandler(async (req: Request, res: Response) => {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const publishedParam = req.query.published;
      const published =
        publishedParam === 'true' ? true : publishedParam === 'false' ? false : undefined;
      const statusParam = req.query.status;
      const status = statusParam === 'draft' || statusParam === 'published' || statusParam === 'scheduled' || statusParam === 'archived' ? statusParam : undefined;
      const categoryId = typeof req.query.categoryId === 'string' && /^[0-9a-f-]{36}$/.test(req.query.categoryId) ? req.query.categoryId : undefined;
      const filter: AdminListFilter = { search, published, status, ...(categoryId ? { where: { categoryId } } : {}) };
      // Paginated when ?page is given (the new admin portal); a plain array otherwise (embedded admin).
      if (req.query.page !== undefined) {
        const page = Math.max(1, Math.min(10_000, Number.parseInt(String(req.query.page), 10) || 1));
        const pageSize = Math.max(1, Math.min(100, Number.parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
        const [items, total] = await Promise.all([service.listAll({ ...filter, skip: (page - 1) * pageSize, take: pageSize }), service.countAll(filter)]);
        sendSuccess(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
        return;
      }
      const items = await service.listAll(filter);
      sendSuccess(res, items);
    }),

    slugAvailable: asyncHandler(async (req: Request, res: Response) => {
      const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
      const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined;
      sendSuccess(res, { slug, available: Boolean(slug) && (await service.slugAvailable(slug, excludeId)) });
    }),

    archive: asyncHandler(async (req: Request, res: Response) => {
      const item = await service.setArchived(req.params.id, true);
      await record(req, 'archived', req.params.id);
      sendSuccess(res, item, 'Archived');
    }),

    restore: asyncHandler(async (req: Request, res: Response) => {
      const item = await service.setArchived(req.params.id, false);
      await record(req, 'restored', req.params.id);
      sendSuccess(res, item, 'Restored as a draft');
    }),

    getOne: asyncHandler(async (req: Request, res: Response) => {
      const item = await service.getById(req.params.id);
      sendSuccess(res, item);
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      // Without cms.publish, new content is always a draft awaiting review.
      const asked = !canPublish(req) && stripLiveFields(req.body);
      // Some models default to published=true, so a draft is set explicitly.
      const { expectedUpdatedAt: _ignored, ...body } = req.body as Record<string, unknown>;
      const item = await service.create({ ...normalize(body), ...(canPublish(req) ? {} : { published: false }) });
      await record(req, 'created', (item as { id: string }).id);
      if (asked) await contentEvent(options.entity, 'awaiting_approval', item as { id: string; title?: unknown });
      sendSuccess(res, item, asked ? AWAITING_APPROVAL : 'Created successfully', 201);
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      let asked = false;
      const { expectedUpdatedAt, ...body } = req.body as Record<string, unknown>;
      const current = await service.getById(req.params.id);
      assertNotStale(current, expectedUpdatedAt);
      if (!canPublish(req)) {
        assertNotLive(current);
        asked = stripLiveFields(body);
      }
      const item = await service.update(req.params.id, normalize(body));
      await record(req, 'updated', req.params.id, { fields: Object.keys(body) });
      if (asked) await contentEvent(options.entity, 'awaiting_approval', item as { id: string; title?: unknown });
      sendSuccess(res, item, asked ? AWAITING_APPROVAL : 'Updated successfully');
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      if (!canPublish(req)) assertNotLive(await service.getById(req.params.id));
      const result = await service.remove(req.params.id);
      await record(req, 'deleted', req.params.id);
      sendSuccess(res, result, 'Deleted successfully');
    }),

    publish: asyncHandler(async (req: Request, res: Response) => {
      const before = (await service.getById(req.params.id)) as { published?: boolean };
      const item = await service.setPublished(req.params.id, true, options.trackPublishedAt);
      await record(req, 'published', req.params.id);
      if (!before.published) await contentEvent(options.entity, 'published', item as { id: string; title?: unknown });
      sendSuccess(res, item, 'Published');
    }),

    unpublish: asyncHandler(async (req: Request, res: Response) => {
      const item = await service.setPublished(req.params.id, false, options.trackPublishedAt);
      await record(req, 'unpublished', req.params.id);
      sendSuccess(res, item, 'Unpublished');
    }),
  };
}
