import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { getMockStore, type MockStore } from '@/lib/mock/store';
import { clone, failIfErrorScenario, isEmptyScenario, simulateLatency } from '@/lib/mock/runtime';
import { applyListQuery, type QueryConfig } from '@/lib/query';
import { statusSchemas, validate } from '@/lib/validation/admin';
import type {
  CareerApplication,
  ContactLead,
  ListQuery,
  NewsletterSubscriber,
  Paginated,
  TrainingApplication,
} from '@/types';

/**
 * Lead inboxes: contact enquiries, training applications, career applications
 * and newsletter subscribers. Subscribers are list + delete only — the API has
 * no status endpoint for them.
 */

export interface LeadRecordMap {
  contacts: ContactLead;
  training: TrainingApplication;
  careers: CareerApplication;
  newsletter: NewsletterSubscriber;
}
export type LeadKind = keyof LeadRecordMap;
export type StatusLeadKind = Exclude<LeadKind, 'newsletter'>;

const matchStatus = (item: { status: string }, status: string) => item.status === status;

/** Search fields match the backend controllers' search for each inbox. */
const QUERY_CONFIG: { [K in LeadKind]: QueryConfig<LeadRecordMap[K]> } = {
  contacts: {
    searchFields: ['name', 'email', 'company', 'service'],
    sortableFields: ['name', 'email', 'company', 'service', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    defaultDirection: 'desc',
    matchStatus,
  },
  training: {
    searchFields: ['fullName', 'email', 'phone', 'city'],
    sortableFields: ['fullName', 'email', 'mode', 'qualification', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    defaultDirection: 'desc',
    matchStatus,
  },
  careers: {
    searchFields: ['name', 'email', 'position'],
    sortableFields: ['name', 'email', 'position', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    defaultDirection: 'desc',
    matchStatus,
  },
  newsletter: {
    searchFields: ['email'],
    sortableFields: ['email', 'status', 'createdAt'],
    defaultSort: 'createdAt',
    defaultDirection: 'desc',
    matchStatus,
  },
};

function rowsOf<K extends LeadKind>(store: MockStore, kind: K): LeadRecordMap[K][] {
  return store[kind] as LeadRecordMap[K][];
}

// MOCK MODE: in-memory inboxes with the same validation as the API.
const mock = {
  async list<K extends LeadKind>(kind: K, query: ListQuery): Promise<Paginated<LeadRecordMap[K]>> {
    await simulateLatency();
    failIfErrorScenario();
    const rows = isEmptyScenario() ? [] : rowsOf(getMockStore(), kind);
    return clone(applyListQuery(rows, query, QUERY_CONFIG[kind] as QueryConfig<LeadRecordMap[K]>));
  },

  async updateStatus<K extends StatusLeadKind>(kind: K, id: string, status: string): Promise<LeadRecordMap[K]> {
    const result = validate(statusSchemas[kind], { status });
    if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
    await simulateLatency();
    const rows = rowsOf(getMockStore(), kind);
    const row = rows.find((r) => r.id === id);
    if (!row) throw new ServiceError('Record not found', 404);
    Object.assign(row, { status: result.data.status, updatedAt: new Date().toISOString() });
    return clone(row);
  },

  async remove(kind: LeadKind, id: string): Promise<void> {
    await simulateLatency();
    const rows = rowsOf(getMockStore(), kind);
    const index = rows.findIndex((r) => r.id === id);
    if (index === -1) throw new ServiceError('Record not found', 404);
    rows.splice(index, 1);
  },
};

const api: typeof mock = {
  async list(kind, query) {
    // The backend searches/filters but does not paginate yet; sort + page here.
    const status = query.status && query.status !== 'ALL' ? query.status : undefined;
    const search = kind === 'newsletter' ? undefined : query.search;
    const rows = await http.get<LeadRecordMap[typeof kind][]>(`/admin/${kind}`, { query: { search, status } });
    const local = kind === 'newsletter' ? query : { ...query, search: undefined, status: undefined };
    return applyListQuery(rows, local, QUERY_CONFIG[kind] as QueryConfig<LeadRecordMap[typeof kind]>);
  },
  updateStatus: (kind, id, status) => http.put(`/admin/${kind}/${encodeURIComponent(id)}`, { status }),
  async remove(kind, id) {
    await http.delete<unknown>(`/admin/${kind}/${encodeURIComponent(id)}`);
  },
};

export const leadsService = isMockMode ? mock : api;
