'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type CmsKind } from '@globalantic/api-client';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Tabs, Toolbar, buttonClass, useAsync, useDebounced, type Column } from '@globalantic/ui';
import { STATUS_TABS, type PublicState } from './cms';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Paginated, searchable CMS list with status tabs (blog / projects) and optional extra filters. */
export function CmsList({
  kind,
  title,
  description,
  basePath,
  newLabel,
  columns,
  statusTabs = true,
  extraQuery = {},
  filters,
  emptyText,
}: {
  kind: CmsKind;
  title: string;
  description: string;
  basePath: string;
  newLabel: string;
  columns: Column<Row>[];
  statusTabs?: boolean;
  extraQuery?: Record<string, string | undefined>;
  filters?: React.ReactNode;
  emptyText: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | PublicState>('');
  const term = useDebounced(search.trim(), 300);
  const extraKey = JSON.stringify(extraQuery);
  // A different filter (e.g. category) starts again at page 1.
  useEffect(() => setPage(1), [extraKey]);
  const q = { page, pageSize: 20, ...(term ? { search: term } : {}), ...(status ? { status } : {}), ...extraQuery };
  const state = useAsync(() => api().cms.list(kind, q), `${kind}-${JSON.stringify(q)}`);

  return (
    <>
      <PageHeader title={title} description={description} actions={<Link href={`${basePath}/new`} className={buttonClass('primary', 'sm')}>{newLabel}</Link>} />
      {statusTabs && <Tabs label="Status" items={STATUS_TABS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />}
      <Toolbar>
        <Input label="Search" placeholder="Title or slug" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {filters}
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'Nothing here yet', description: emptyText }}>
        {(d) => (
          <div className={s.stackSm}>
            <DataTable<Row> caption={title} rows={d.items} rowKey={(r) => r.id} onRowClick={(r) => router.push(`${basePath}/${r.id}`)} columns={columns} />
            <Pagination page={d.page ?? page} totalPages={d.totalPages ?? 1} onChange={setPage} />
            <p className={s.small}>{d.total} item{d.total === 1 ? '' : 's'}</p>
          </div>
        )}
      </AsyncView>
    </>
  );
}
