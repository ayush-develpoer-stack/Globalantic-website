'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, Button, DataTable, Input, LoadingState, PageHeader, Pagination, Select, StatusBadge, Toolbar, formatDate, formatINR, useAsync, useDebounced } from '@globalantic/ui';
import { downloadCsv, useRun } from '@/lib/admin';
import { ENROLLMENT_STATUSES } from '@/lib/programs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function EnrollmentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const run = useRun();
  const [programId, setProgramId] = useState(params.get('programId') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const programs = useAsync(() => api().programAdmin.programs(), 'programs');
  const filters = { programId, status, search: q };
  const state = useAsync(() => api().programAdmin.enrollments({ ...filters, page, pageSize: 20 }), JSON.stringify({ ...filters, page }));

  const exportCsv = async () => {
    setExporting(true);
    const r = await run(() => api().programAdmin.exportEnrollments({ programId, status }));
    setExporting(false);
    if (r?.rows.length) downloadCsv(`program-enrollments-${new Date().toISOString().slice(0, 10)}.csv`, r.rows);
    else if (r) await run(() => Promise.reject(new Error('No enrollments match these filters.')));
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/programs" className={s.link}>← Programs</Link>}
        title="Program enrollments"
        description="Registrations, payment status, progress and certificates."
        actions={<Button size="sm" variant="outline" onClick={exportCsv} loading={exporting}><Download size={16} aria-hidden /> Export CSV</Button>}
      />
      <Toolbar>
        <Input label="Search" placeholder="Name, email or enrollment number" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Program" value={programId} onChange={(e) => { setProgramId(e.target.value); setPage(1); }} placeholder="All programs" options={(programs.data ?? []).map((p: Row) => ({ value: p.id, label: p.title }))} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status" options={ENROLLMENT_STATUSES} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No enrollments match', description: 'Students appear here when they register for a published program.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Program enrollments"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/programs/enrollments/${r.id}`)}
              columns={[
                { key: 'st', header: 'Student', render: (r) => (<><Link href={`/programs/enrollments/${r.id}`} className={s.link}>{r.student.name}</Link><div className={s.small}>{r.student.email}</div></>) },
                { key: 'no', header: 'Enrollment', hideOnMobile: true, render: (r) => (<><div className={s.mono}>{r.enrollmentNumber}</div><div className={s.small}>{r.program.title}</div></>) },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'fee', header: 'Fee', hideOnMobile: true, render: (r) => formatINR(r.feePaise) },
                { key: 'prog', header: 'Progress', hideOnMobile: true, render: (r) => `${r._count.lessonProgress} lesson(s) · ${r._count.attempts} attempt(s)` },
                { key: 'cert', header: 'Certificate', hideOnMobile: true, render: (r) => (r.certificate ? <><span className={s.mono}>{r.certificate.certificateNumber}</span> <StatusBadge status={r.certificate.status} /></> : <Badge>None</Badge>) },
                { key: 'reg', header: 'Registered', hideOnMobile: true, render: (r) => formatDate(r.registeredAt) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}

export default function ProgramEnrollmentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <EnrollmentsInner />
    </Suspense>
  );
}
