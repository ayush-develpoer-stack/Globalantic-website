'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normalizePaging } from '@/lib/query';
import type { ListQuery, SortDirection } from '@/types';

/**
 * List state (search, status filter, sort, page, page size) stored in the URL
 * query string, so filtered views survive refresh and can be shared/bookmarked.
 * Pages using this hook must be wrapped in <Suspense> (useSearchParams).
 */
export function useListParams(): {
  query: ListQuery;
  setQuery: (patch: Partial<ListQuery>) => void;
  resetQuery: () => void;
  hasFilters: boolean;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = useMemo<ListQuery>(() => {
    const direction = params.get('dir');
    const { page, pageSize } = normalizePaging({
      page: Number(params.get('page')) || undefined,
      pageSize: Number(params.get('size')) || undefined,
    });
    return {
      search: params.get('q') ?? '',
      status: params.get('status') ?? 'ALL',
      sort: params.get('sort') ?? undefined,
      direction: direction === 'asc' || direction === 'desc' ? (direction as SortDirection) : undefined,
      page,
      pageSize,
    };
  }, [params]);

  const setQuery = useCallback(
    (patch: Partial<ListQuery>) => {
      const next = new URLSearchParams(params.toString());
      const set = (key: string, value: string | number | undefined, defaultValue?: string) => {
        if (value === undefined || value === '' || String(value) === defaultValue) next.delete(key);
        else next.set(key, String(value));
      };
      if ('search' in patch) set('q', patch.search);
      if ('status' in patch) set('status', patch.status, 'ALL');
      if ('sort' in patch) set('sort', patch.sort);
      if ('direction' in patch) set('dir', patch.direction);
      if ('pageSize' in patch) set('size', patch.pageSize, '10');
      // Any change other than paging returns to the first page.
      if ('page' in patch) set('page', patch.page, '1');
      else next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const resetQuery = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const hasFilters = Boolean(query.search) || (query.status !== undefined && query.status !== 'ALL');

  return { query, setQuery, resetQuery, hasFilters };
}
