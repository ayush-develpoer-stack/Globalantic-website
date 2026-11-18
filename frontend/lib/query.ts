import type { ListQuery, Paginated, SortDirection } from '@/types';

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export interface QueryConfig<T> {
  /** Fields matched (case-insensitive substring) by `query.search`. */
  searchFields: (keyof T & string)[];
  /** Fields the caller is allowed to sort by; anything else is ignored. */
  sortableFields: (keyof T & string)[];
  defaultSort: keyof T & string;
  defaultDirection?: SortDirection;
  /** How `query.status` filters an item. Omit to disable status filtering. */
  matchStatus?: (item: T, status: string) => boolean;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Compares two non-empty values. */
function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

/** Clamps paging input to sane values. */
export function normalizePaging(query: ListQuery): { page: number; pageSize: number } {
  const pageSize = PAGE_SIZE_OPTIONS.includes(query.pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
    ? (query.pageSize as number)
    : DEFAULT_PAGE_SIZE;
  const page = Number.isInteger(query.page) && (query.page as number) > 0 ? (query.page as number) : 1;
  return { page, pageSize };
}

/**
 * Applies search → status filter → sort → pagination to an in-memory list.
 * Pure and deterministic, so it is unit-tested and shared by the mock layer
 * and the API adapter (until the backend paginates server-side).
 */
export function applyListQuery<T>(items: readonly T[], query: ListQuery, config: QueryConfig<T>): Paginated<T> {
  const search = query.search?.trim().toLowerCase() ?? '';
  const status = query.status && query.status !== 'ALL' ? query.status : '';

  let result = items.filter((item) => {
    if (status && config.matchStatus && !config.matchStatus(item, status)) return false;
    if (!search) return true;
    return config.searchFields.some((field) => {
      const value = item[field];
      return value !== null && value !== undefined && String(value).toLowerCase().includes(search);
    });
  });

  const sortField =
    query.sort && (config.sortableFields as string[]).includes(query.sort)
      ? (query.sort as keyof T & string)
      : config.defaultSort;
  const direction = query.direction ?? config.defaultDirection ?? 'asc';
  result = [...result].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    // Empty values always sort last, whatever the direction.
    if (isEmpty(av) || isEmpty(bv)) return isEmpty(av) === isEmpty(bv) ? 0 : isEmpty(av) ? 1 : -1;
    const order = compare(av, bv);
    return direction === 'asc' ? order : -order;
  });

  const { page: requestedPage, pageSize } = normalizePaging(query);
  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: result.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}
