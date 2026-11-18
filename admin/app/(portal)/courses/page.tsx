'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { COURSE_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Select, StatusBadge, Toolbar, buttonClass, formatINR, useAsync, useDebounced, formatDate } from '@globalantic/ui';
import { SortHeader, enumOptions, useSort } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function CoursesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().admin.courses({ search: q, status, page, pageSize: 20, sort }), `${q}|${status}|${page}|${sort ?? ''}`);

  return (
    <>
      <PageHeader title="Courses" description="Create and publish courses, manage syllabus, fees and SEO." actions={<Link href="/courses/new" className={buttonClass('primary', 'sm')}>New course</Link>} />
      <Toolbar>
        <Input label="Search" placeholder="Title or slug" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={enumOptions(COURSE_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No courses found', description: 'Create your first course to start taking admissions.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Courses"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/courses/${r.id}`)}
              columns={[
                { key: 'title', header: <SortHeader label="Course" field="title" sort={sort} onSort={onSort} />, render: (r) => (<><Link href={`/courses/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>/{r.slug}</div></>) },
                { key: 'type', header: 'Type', hideOnMobile: true, render: (r) => `${enumLabel(r.programType)} · ${enumLabel(r.mode)}` },
                { key: 'fee', header: <SortHeader label="Fee" field="feePaise" sort={sort} onSort={onSort} />, render: (r) => (<>{formatINR(r.feePaise - r.discountPaise)}{r.discountPaise > 0 && <div className={s.small}>was {formatINR(r.feePaise)}</div>}</>) },
                { key: 'batches', header: 'Batches', hideOnMobile: true, render: (r) => r._count?.batches ?? 0 },
                { key: 'enrolled', header: 'Enrolled', hideOnMobile: true, render: (r) => r._count?.enrollments ?? 0 },
                { key: 'created', header: <SortHeader label="Created" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
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
