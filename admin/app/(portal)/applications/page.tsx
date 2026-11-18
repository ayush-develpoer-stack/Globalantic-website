'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { APPLICATION_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, DataTable, Input, LoadingState, PageHeader, Pagination, StatusBadge, Tabs, Toolbar, formatDate, formatINR, useAsync, useDebounced } from '@globalantic/ui';
import { SortHeader, useSort } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;
type TabValue = 'ALL' | 'PENDING_PAYMENT' | (typeof APPLICATION_STATUSES)[number];

function Applications() {
  const router = useRouter();
  const params = useSearchParams();
  const initial: TabValue = params.get('pendingPayment') === 'true' ? 'PENDING_PAYMENT' : ((params.get('status') as TabValue) || 'ALL');
  const [tab, setTab] = useState<TabValue>(initial);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(
    () =>
      api().admin.applications({
        search: q,
        page,
        pageSize: 20,
        sort,
        ...(tab === 'PENDING_PAYMENT' ? { pendingPayment: 'true' } : tab !== 'ALL' ? { status: tab } : {}),
      }),
    `${tab}|${q}|${page}|${sort ?? ''}`,
  );
  const counts = state.data?.statusCounts ?? {};
  const total = Object.values(counts).reduce<number>((a, b) => a + (b as number), 0);

  return (
    <>
      <PageHeader title="Admissions" description="Review applications, approve or reject, and track pending payments." />
      <Tabs<TabValue>
        label="Application status"
        value={tab}
        onChange={(v) => { setTab(v); setPage(1); }}
        items={[
          { value: 'ALL', label: 'All', count: total },
          ...APPLICATION_STATUSES.map((st) => ({ value: st as TabValue, label: enumLabel(st), count: counts[st] ?? 0 })),
          { value: 'PENDING_PAYMENT', label: 'Pending payment' },
        ]}
      />
      <Toolbar>
        <Input label="Search" placeholder="Application no., name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No applications', description: 'Nothing matches these filters.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Applications"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/applications/${r.id}`)}
              columns={[
                { key: 'no', header: <SortHeader label="Application" field="applicationNumber" sort={sort} onSort={onSort} />, render: (r) => (<><Link className={s.link} href={`/applications/${r.id}`}>{r.applicationNumber}</Link><div className={s.small}>{formatDate(r.createdAt)}</div></>) },
                { key: 'student', header: 'Student', render: (r) => (<><div className={s.strong}>{r.student.name}</div><div className={s.small}>{r.student.email}</div></>) },
                { key: 'course', header: 'Course / batch', hideOnMobile: true, render: (r) => (<><div>{r.course.title}</div><div className={s.small}>{r.batch.name}</div></>) },
                { key: 'fee', header: <SortHeader label="Payable" field="payablePaise" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatINR(r.payablePaise) },
                { key: 'pay', header: 'Payment', hideOnMobile: true, render: (r) => (r.payments?.[0] ? <StatusBadge status={r.payments[0].status} /> : <span className={s.small}>—</span>) },
                { key: 'submitted', header: <SortHeader label="Submitted" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 'status', header: <SortHeader label="Status" field="status" sort={sort} onSort={onSort} />, render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Applications />
    </Suspense>
  );
}
