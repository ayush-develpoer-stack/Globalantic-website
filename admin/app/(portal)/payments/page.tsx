'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { PAYMENT_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Select, Stat, StatGrid, StatusBadge, Toolbar, formatDateTime, formatINR, useAsync, useDebounced, formatDate } from '@globalantic/ui';
import { SortHeader, enumOptions, useSort } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function PaymentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().admin.payments({ search: q, status, page, pageSize: 20, sort }), `${q}|${status}|${page}|${sort ?? ''}`);
  const totals = state.data?.totals ?? {};

  return (
    <>
      <PageHeader title="Payments" description="Payment records verified from Razorpay (signature, webhook or reconciliation) and audited offline records." />
      <StatGrid>
        <Stat label="Paid" value={formatINR(totals.PAID?.amountPaise ?? 0)} hint={`${totals.PAID?.count ?? 0} payments`} tone="success" />
        <Stat label="Pending" value={totals.PENDING?.count ?? 0} hint="Authorised, awaiting capture" tone="warning" />
        <Stat label="Failed" value={totals.FAILED?.count ?? 0} tone="danger" />
        <Stat label="Refunded" value={formatINR(totals.REFUNDED?.amountPaise ?? 0)} hint={`${totals.REFUNDED?.count ?? 0} payments`} />
      </StatGrid>
      <div className={s.spacer} />
      <Toolbar>
        <Input label="Search" placeholder="Order/payment id, student, application or enrollment no." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={enumOptions(PAYMENT_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No payments found' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Payments"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/payments/${r.id}`)}
              columns={[
                { key: 'amt', header: <SortHeader label="Amount" field="amountPaise" sort={sort} onSort={onSort} />, render: (r) => (<><Link className={s.link} href={`/payments/${r.id}`}>{formatINR(r.amountPaise)}</Link><div className={s.small}>{enumLabel(r.provider)}{r.method ? ` · ${r.method}` : ''}</div></>) },
                { key: 'student', header: 'Student', render: (r) => (<><div className={s.strong}>{r.student.name}</div><div className={s.small}>{r.student.email}</div></>) },
                { key: 'app', header: 'For', hideOnMobile: true, render: (r) => (r.application ? <><div>{r.application.applicationNumber}</div><div className={s.small}>{r.application.course.title}</div></> : r.programEnrollment ? <><div>{r.programEnrollment.enrollmentNumber}</div><div className={s.small}>{r.programEnrollment.program.title} (certificate program)</div></> : '—') },
                { key: 'rcpt', header: 'Receipt', hideOnMobile: true, render: (r) => r.invoice?.invoiceNumber ?? '—' },
                { key: 'date', header: <SortHeader label="Verified" field="verifiedAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDateTime(r.verifiedAt ?? r.createdAt) },
                { key: 'created', header: <SortHeader label="Created" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 'st', header: <SortHeader label="Status" field="status" sort={sort} onSort={onSort} />, render: (r) => (<><StatusBadge status={r.status} />{r.failureReason === 'DUPLICATE_PAYMENT_REFUND_REQUIRED' && <div className={s.small}>Duplicate — refund</div>}</>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}
