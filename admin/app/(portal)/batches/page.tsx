'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { BATCH_STATUSES } from '@globalantic/types';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Select, StatusBadge, Toolbar, buttonClass, formatDate, useAsync, useDebounced } from '@globalantic/ui';
import { SortHeader, enumOptions, useSort } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function BatchesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const courses = useAsync(() => api().admin.courses({ pageSize: 100 }), 'courses-all');
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().admin.batches({ search: q, status, courseId, page, pageSize: 20, sort }), `${q}|${status}|${courseId}|${page}|${sort ?? ''}`);

  return (
    <>
      <PageHeader title="Batches" description="Schedules, capacity, trainers and admission windows." actions={<Link href="/batches/new" className={buttonClass('primary', 'sm')}>New batch</Link>} />
      <Toolbar>
        <Input label="Search" placeholder="Batch name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Course" value={courseId} onChange={(e) => { setCourseId(e.target.value); setPage(1); }} placeholder="All courses" options={(courses.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={enumOptions(BATCH_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No batches found' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Batches"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/batches/${r.id}`)}
              columns={[
                { key: 'name', header: <SortHeader label="Batch" field="name" sort={sort} onSort={onSort} />, render: (r) => (<><Link className={s.link} href={`/batches/${r.id}`}>{r.name}</Link><div className={s.small}>{r.course?.title}</div></>) },
                { key: 'dates', header: <SortHeader label="Dates" field="startDate" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
                { key: 'deadline', header: 'Apply by', hideOnMobile: true, render: (r) => formatDate(r.registrationDeadline) },
                { key: 'seats', header: <SortHeader label="Seats" field="capacity" sort={sort} onSort={onSort} />, render: (r) => `${r.seatsTaken}/${r.capacity}` },
                { key: 'trainers', header: 'Trainers', hideOnMobile: true, render: (r) => (r.trainers ?? []).map((t: Row) => t.trainer.name).join(', ') || '—' },
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
