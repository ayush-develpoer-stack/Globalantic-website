import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const paginationQuery = {
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
};

export function pageArgs(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paged<T>(items: T[], total: number, q: { page: number; pageSize: number }) {
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/**
 * Server-side sorting from a whitelisted `?sort=field:asc|desc` value.
 * `fields` maps public sort keys to Prisma orderBy builders; anything else is
 * rejected by the request schema (see sortParam) before reaching the service.
 */
export type SortDir = 'asc' | 'desc';

export function sortParam<const K extends string>(keys: readonly K[]) {
  const values = keys.flatMap((k) => [`${k}:asc`, `${k}:desc`]) as [string, ...string[]];
  return z.preprocess((v) => (v === '' ? undefined : v), z.enum(values).optional());
}

export function orderByFrom<T>(sort: string | undefined, fields: Record<string, (dir: SortDir) => T>, fallback: T): T {
  if (!sort) return fallback;
  const [key, dir] = sort.split(':') as [string, SortDir];
  const build = fields[key];
  return build ? build(dir === 'asc' ? 'asc' : 'desc') : fallback;
}
