'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, DataTable, Input, PageHeader, Pagination, Select, StatusBadge, Toolbar, buttonClass, formatDateTime, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { KIND_LABEL, TRACK_LABEL, trackOptions } from '@/lib/exams';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ExamsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const state = useAsync(() => api().examAdmin.exams({ search: q, status, track, page, pageSize: 20 }), `${q}|${status}|${track}|${page}`);

  return (
    <>
      <PageHeader
        title="Internship exams"
        description="Marketing and sales assessments for internship candidates: schedule, assign, evaluate and publish results."
        actions={
          can('exams.manage') ? (
            <div className={s.actions}>
              <Link href="/exams/questions" className={buttonClass('outline', 'sm')}>Question bank</Link>
              <Link href="/exams/new" className={buttonClass('primary', 'sm')}>New exam</Link>
            </div>
          ) : undefined
        }
      />
      <Toolbar>
        <Input label="Search" placeholder="Exam title" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'ARCHIVED', label: 'Archived' }]} />
        <Select label="Category" value={track} onChange={(e) => { setTrack(e.target.value); setPage(1); }} placeholder="All categories" options={trackOptions} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No exams yet', description: 'Create questions in the question bank, then create an exam and assign it to candidates.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Exams"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/exams/${r.id}`)}
              columns={[
                { key: 'title', header: 'Exam', render: (r) => (<><Link href={`/exams/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>{TRACK_LABEL[r.track]} · {KIND_LABEL[r.kind]}</div></>) },
                { key: 'window', header: 'Window', hideOnMobile: true, render: (r) => (r.opensAt || r.closesAt ? <span className={s.small}>{r.opensAt ? formatDateTime(r.opensAt) : 'Now'} → {r.closesAt ? formatDateTime(r.closesAt) : 'open-ended'}</span> : <span className={s.small}>Always open</span>) },
                { key: 'questions', header: 'Questions', hideOnMobile: true, render: (r) => (r.kind === 'INTERVIEW' ? '—' : r._count?.questions ?? 0) },
                { key: 'assigned', header: 'Assigned to', hideOnMobile: true, render: (r) => `${r._count?.assignments ?? 0} group(s)` },
                { key: 'attempts', header: 'Attempts', render: (r) => (<>{r._count?.attempts ?? 0}{r.pendingEvaluation > 0 && <div><Badge tone="info">{r.pendingEvaluation} to evaluate</Badge></div>}</>) },
                { key: 'status', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.resultsReleasedAt && <div className={s.small}>Results released</div>}</>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}
