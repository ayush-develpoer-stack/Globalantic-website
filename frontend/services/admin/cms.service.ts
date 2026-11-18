import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { getMockStore } from '@/lib/mock/store';
import { clone, failIfErrorScenario, isEmptyScenario, mockId, simulateLatency } from '@/lib/mock/runtime';
import { applyListQuery, type QueryConfig } from '@/lib/query';
import { cmsSchemas, validate } from '@/lib/validation/admin';
import type { CmsRecord, CmsResource, ListQuery, Paginated } from '@/types';

/**
 * Admin CMS for services, solutions, industries, portfolio and blog.
 * Status filter values: 'PUBLISHED' | 'DRAFT' | 'ALL'.
 */

export const CMS_STATUS_FILTERS = ['PUBLISHED', 'DRAFT'] as const;

const matchPublished = (item: CmsRecord, status: string) =>
  status === 'PUBLISHED' ? item.published === true : status === 'DRAFT' ? item.published !== true : true;

/** Search fields match the backend's admin search (services/content.instances.ts). */
const QUERY_CONFIG: Record<CmsResource, QueryConfig<CmsRecord>> = {
  services: {
    searchFields: ['title', 'slug', 'shortDesc'],
    sortableFields: ['title', 'slug', 'order', 'updatedAt'],
    defaultSort: 'order',
    matchStatus: matchPublished,
  },
  solutions: {
    searchFields: ['title', 'slug', 'shortDesc'],
    sortableFields: ['title', 'slug', 'order', 'updatedAt'],
    defaultSort: 'order',
    matchStatus: matchPublished,
  },
  industries: {
    searchFields: ['title', 'slug', 'shortDesc'],
    sortableFields: ['title', 'slug', 'order', 'updatedAt'],
    defaultSort: 'order',
    matchStatus: matchPublished,
  },
  portfolio: {
    searchFields: ['title', 'slug', 'shortDescription', 'category'],
    sortableFields: ['title', 'slug', 'category', 'order', 'updatedAt'],
    defaultSort: 'order',
    matchStatus: matchPublished,
  },
  blog: {
    searchFields: ['title', 'slug', 'excerpt'],
    sortableFields: ['title', 'slug', 'author', 'publishedAt', 'updatedAt'],
    defaultSort: 'publishedAt',
    defaultDirection: 'desc',
    matchStatus: matchPublished,
  },
};

export function cmsQueryConfig(resource: CmsResource): QueryConfig<CmsRecord> {
  return QUERY_CONFIG[resource];
}

type Payload = Record<string, unknown>;

function validateOrThrow(resource: CmsResource, data: Payload, partial: boolean): Payload {
  const schema = partial ? cmsSchemas[resource].partial() : cmsSchemas[resource];
  const result = validate(schema, data);
  if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
  return result.data as Payload;
}

/** Mirrors the backend controller's normalisation (blog publishedAt, empty categoryId). */
function normalize(resource: CmsResource, data: Payload, existing?: CmsRecord): Payload {
  const out = { ...data };
  if (resource === 'blog') {
    if (out.categoryId === '' || out.categoryId === undefined) out.categoryId = existing?.categoryId ?? null;
    if (out.published === true && !existing?.published) out.publishedAt = new Date().toISOString();
    if (out.published === false) out.publishedAt = null;
  }
  return out;
}

// MOCK MODE: operates on the in-memory store with the same rules as the API.
const mock = {
  async list(resource: CmsResource, query: ListQuery): Promise<Paginated<CmsRecord>> {
    await simulateLatency();
    failIfErrorScenario();
    const rows = isEmptyScenario() ? [] : getMockStore().cms[resource];
    return clone(applyListQuery(rows, query, QUERY_CONFIG[resource]));
  },

  async get(resource: CmsResource, id: string): Promise<CmsRecord> {
    await simulateLatency();
    const row = getMockStore().cms[resource].find((r) => r.id === id);
    if (!row) throw new ServiceError('Content not found', 404);
    return clone(row);
  },

  async create(resource: CmsResource, data: Payload): Promise<CmsRecord> {
    const parsed = validateOrThrow(resource, data, false);
    await simulateLatency();
    const rows = getMockStore().cms[resource];
    if (rows.some((r) => r.slug === parsed.slug)) {
      throw new ServiceError('A record with these details already exists', 409, [
        { field: 'slug', message: 'This slug is already in use' },
      ]);
    }
    const now = new Date().toISOString();
    const record = {
      published: resource !== 'blog',
      ...normalize(resource, parsed),
      id: mockId(resource),
      createdAt: now,
      updatedAt: now,
    } as unknown as CmsRecord;
    rows.unshift(record);
    return clone(record);
  },

  async update(resource: CmsResource, id: string, data: Payload): Promise<CmsRecord> {
    const parsed = validateOrThrow(resource, data, true);
    await simulateLatency();
    const rows = getMockStore().cms[resource];
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) throw new ServiceError('Content not found', 404);
    if (parsed.slug && rows.some((r) => r.slug === parsed.slug && r.id !== id)) {
      throw new ServiceError('A record with these details already exists', 409, [
        { field: 'slug', message: 'This slug is already in use' },
      ]);
    }
    const updated = { ...rows[index], ...normalize(resource, parsed, rows[index]), updatedAt: new Date().toISOString() };
    rows[index] = updated;
    return clone(updated);
  },

  async remove(resource: CmsResource, id: string): Promise<void> {
    await simulateLatency();
    const rows = getMockStore().cms[resource];
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) throw new ServiceError('Content not found', 404);
    rows.splice(index, 1);
  },

  async setPublished(resource: CmsResource, id: string, published: boolean): Promise<CmsRecord> {
    return mock.update(resource, id, { published });
  },
};

const api: typeof mock = {
  async list(resource, query) {
    // The backend filters by search/published but does not paginate yet, so
    // sorting and paging are applied here (remove once the API paginates).
    const published = query.status === 'PUBLISHED' ? 'true' : query.status === 'DRAFT' ? 'false' : undefined;
    const rows = await http.get<CmsRecord[]>(`/admin/${resource}`, { query: { search: query.search, published } });
    return applyListQuery(rows, { ...query, search: undefined, status: undefined }, QUERY_CONFIG[resource]);
  },
  get: (resource, id) => http.get<CmsRecord>(`/admin/${resource}/${encodeURIComponent(id)}`),
  create: (resource, data) => http.post<CmsRecord>(`/admin/${resource}`, data),
  update: (resource, id, data) => http.put<CmsRecord>(`/admin/${resource}/${encodeURIComponent(id)}`, data),
  async remove(resource, id) {
    await http.delete<unknown>(`/admin/${resource}/${encodeURIComponent(id)}`);
  },
  setPublished: (resource, id, published) =>
    http.patch<CmsRecord>(`/admin/${resource}/${encodeURIComponent(id)}/${published ? 'publish' : 'unpublish'}`),
};

export const cmsService = isMockMode ? mock : api;
