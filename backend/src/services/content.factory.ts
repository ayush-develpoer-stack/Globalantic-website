import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

/**
 * A minimal delegate shape shared by the Prisma models we expose as content.
 * We keep it loosely typed on purpose so a single factory can serve every
 * content entity (services, solutions, industries, portfolio, blog) without
 * duplicating CRUD logic.
 */
interface PrismaDelegate {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
}

type DelegateName =
  | 'service'
  | 'solution'
  | 'industry'
  | 'portfolioProject'
  | 'blogPost';

interface FactoryOptions {
  /** Default ordering for list queries. */
  orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
  /** Extra include for detail/list queries. */
  include?: Record<string, unknown>;
  /** Column that marks a record published. */
  publishedField?: string;
  /** String columns searched (case-insensitive) by the admin list filter. */
  searchFields?: string[];
  /** Model has archivedAt: archived records are never public. */
  archivable?: boolean;
  /** Model has publishedAt: a future date keeps a published record hidden until then. */
  scheduled?: boolean;
}

/** Admin list filter parsed from query params. */
export interface AdminListFilter {
  search?: string;
  published?: boolean;
  /** draft | published | scheduled | archived */
  status?: 'draft' | 'published' | 'scheduled' | 'archived';
  /** Extra Prisma where (e.g. category) */
  where?: Record<string, unknown>;
  /** Optional pagination (without it every row is returned, as before) */
  skip?: number;
  take?: number;
}

export function createContentService(name: DelegateName, options: FactoryOptions = {}) {
  const delegate = prisma[name] as unknown as PrismaDelegate;
  const orderBy = options.orderBy ?? { createdAt: 'desc' };
  const publishedField = options.publishedField ?? 'published';
  const searchFields = options.searchFields ?? ['title', 'slug'];

  /** What "visible to the public" means for this model right now. */
  const publicWhere = (): Record<string, unknown> => ({
    [publishedField]: true,
    ...(options.archivable ? { archivedAt: null } : {}),
    ...(options.scheduled ? { OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] } : {}),
  });

  const isPublic = (r: Record<string, unknown>) =>
    r[publishedField] === true &&
    (!options.archivable || !r.archivedAt) &&
    (!options.scheduled || !r.publishedAt || new Date(r.publishedAt as string).getTime() <= Date.now());

  return {
    /** Public: only published (not archived, not scheduled for later) records. */
    async listPublished(extraWhere?: Record<string, unknown>) {
      return delegate.findMany({
        where: extraWhere ? { AND: [publicWhere(), extraWhere] } : publicWhere(),
        orderBy,
        ...(options.include ? { include: options.include } : {}),
      });
    },

    /** Public: single published record by slug (drafts, archived and scheduled records are 404). */
    async getPublishedBySlug(slug: string) {
      const record = await delegate.findUnique({
        where: { slug },
        ...(options.include ? { include: options.include } : {}),
      });
      if (!record || !isPublic(record as Record<string, unknown>)) {
        throw ApiError.notFound('Content not found');
      }
      return record;
    },

    /** Admin: all records, optionally filtered by search term and published status. */
    async listAll(filter: AdminListFilter = {}) {
      const and = this.adminWhere(filter);
      return delegate.findMany({
        ...(and.length ? { where: { AND: and } } : {}),
        orderBy,
        ...(options.include ? { include: options.include } : {}),
        ...(filter.take ? { skip: filter.skip ?? 0, take: filter.take } : {}),
      });
    },

    async countAll(filter: AdminListFilter = {}) {
      const and = this.adminWhere(filter);
      return delegate.count(and.length ? { where: { AND: and } } : undefined);
    },

    adminWhere(filter: AdminListFilter): Record<string, unknown>[] {
      const and: Record<string, unknown>[] = [];
      const now = new Date();
      if (filter.where) and.push(filter.where);
      if (filter.status === 'archived') and.push({ archivedAt: { not: null } });
      else if (filter.status) {
        if (options.archivable) and.push({ archivedAt: null });
        if (filter.status === 'draft') and.push({ [publishedField]: false });
        if (filter.status === 'published') and.push({ [publishedField]: true, ...(options.scheduled ? { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] } : {}) });
        if (filter.status === 'scheduled') and.push({ [publishedField]: true, publishedAt: { gt: now } });
      }
      if (typeof filter.published === 'boolean') and.push({ [publishedField]: filter.published });
      if (filter.search) {
        and.push({
          OR: searchFields.map((field) => ({
            [field]: { contains: filter.search, mode: 'insensitive' },
          })),
        });
      }
      return and;
    },

    /** Admin: is this slug free (optionally ignoring the record being edited)? */
    async slugAvailable(slug: string, excludeId?: string) {
      const existing = (await delegate.findUnique({ where: { slug } })) as { id: string } | null;
      return !existing || existing.id === excludeId;
    },

    /** Admin: archive (also unpublishes) or restore (as a draft). */
    async setArchived(id: string, archived: boolean) {
      if (!options.archivable) throw ApiError.badRequest('This content type cannot be archived');
      await this.getById(id);
      return delegate.update({ where: { id }, data: archived ? { archivedAt: new Date(), [publishedField]: false } : { archivedAt: null } });
    },

    async getById(id: string) {
      const record = await delegate.findUnique({ where: { id } });
      if (!record) throw ApiError.notFound('Content not found');
      return record;
    },

    async create(data: Record<string, unknown>) {
      return delegate.create({ data });
    },

    async update(id: string, data: Record<string, unknown>) {
      await this.getById(id);
      return delegate.update({ where: { id }, data });
    },

    async remove(id: string) {
      await this.getById(id);
      await delegate.delete({ where: { id } });
      return { id };
    },

    /** Admin: toggle the published flag (and publishedAt for blog-style models). */
    /**
     * Admin: toggle the published flag. For dated models the first publication stamps
     * publishedAt (a date chosen by the editor is kept, so posts can be scheduled);
     * unpublishing keeps the date so re-publishing does not reorder the archive.
     */
    async setPublished(id: string, published: boolean, trackPublishedAt = false) {
      const current = (await this.getById(id)) as { archivedAt?: Date | null; publishedAt?: Date | null };
      if (published && current.archivedAt) throw ApiError.conflict('Restore this item from the archive before publishing it');
      const data: Record<string, unknown> = { [publishedField]: published };
      if (trackPublishedAt && published && !current.publishedAt) data.publishedAt = new Date();
      return delegate.update({ where: { id }, data });
    },

    count(where?: Record<string, unknown>) {
      return delegate.count(where ? { where } : undefined);
    },
  };
}
