'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Select, StatusBadge, Toolbar, formatDate, useAsync, useDebounced } from '@globalantic/ui';
import { SortHeader, useSort } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function StudentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().admin.students({ search: q, status, page, pageSize: 20, sort }), `${q}|${status}|${page}|${sort ?? ''}`);
  return (
    <>
      <PageHeader title="Students" description="Search student accounts, enrollments and progress." />
      <Toolbar>
        <Input label="Search" placeholder="Name, email or phone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Account status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No students found' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Students"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/students/${r.id}`)}
              columns={[
                { key: 'name', header: <SortHeader label="Student" field="name" sort={sort} onSort={onSort} />, render: (r) => (<Link className={s.link} href={`/students/${r.id}`}>{r.name}</Link>) },
                { key: 'email', header: <SortHeader label="Email" field="email" sort={sort} onSort={onSort} />, render: (r) => <span className={s.small}>{r.email}</span> },
                { key: 'phone', header: 'Phone', hideOnMobile: true, render: (r) => r.phone ?? '—' },
                { key: 'city', header: 'City', hideOnMobile: true, render: (r) => r.studentProfile?.city ?? '—' },
                { key: 'enr', header: 'Enrollments', render: (r) => r._count.enrollments },
                { key: 'joined', header: <SortHeader label="Joined" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 'login', header: <SortHeader label="Last sign-in" field="lastLoginAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => (r.lastLoginAt ? formatDate(r.lastLoginAt) : 'Never') },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{!r.emailVerifiedAt && <div className={s.small}>Email unverified</div>}</>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}
