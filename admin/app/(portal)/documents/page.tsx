'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AsyncView, DataTable, Input, LoadingState, PageHeader, Pagination, Select, Stat, StatGrid, StatusBadge, Toolbar, buttonClass, formatDate, formatINR, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { api } from '@globalantic/api-client';
import { enumOptions } from '@/lib/admin';
import { DOC_STATUSES, DOC_TYPE_LABEL, docTypeOptions } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function DocumentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const [type, setType] = useState(params.get('type') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const filters = { type, status, search: q };
  const state = useAsync(() => api().documents.list({ ...filters, page, pageSize: 20 }), JSON.stringify({ ...filters, page }));
  const summary = (state.data?.summary ?? []) as Row[];
  const count = (pred: (r: Row) => boolean) => summary.filter(pred).reduce((n, r) => n + r.count, 0);
  const outstanding = summary.filter((r) => r.type === 'INVOICE' && ['ISSUED', 'SENT', 'PARTIALLY_PAID'].includes(r.status)).reduce((n, r) => n + (r.totalPaise - r.paidPaise), 0);
  const canCreate = can('documents.manage') || can('documents.finance');

  return (
    <>
      <PageHeader
        title="Documents"
        description="Quotations, proposals, agreements, invoices and receipts. Issued documents are numbered and frozen; PDFs are stored privately."
        actions={
          <div className={s.actions}>
            <Link href="/documents/clients" className={buttonClass('outline', 'sm')}>Clients</Link>
            <Link href="/documents/templates" className={buttonClass('outline', 'sm')}>Templates</Link>
            {canCreate && <Link href="/documents/new" className={buttonClass('primary', 'sm')}>New document</Link>}
          </div>
        }
      />
      {summary.length > 0 && (
        <StatGrid>
          <Stat label="Drafts" value={count((r) => r.status === 'DRAFT')} />
          <Stat label="Quotations awaiting reply" value={count((r) => (r.type === 'QUOTATION' || r.type === 'PROPOSAL') && (r.status === 'ISSUED' || r.status === 'SENT'))} />
          <Stat label="Accepted" value={count((r) => r.status === 'ACCEPTED')} tone="success" />
          <Stat label="Outstanding invoices" value={formatINR(outstanding)} tone={outstanding ? 'warning' : undefined} />
        </StatGrid>
      )}
      <div className={s.spacer} />
      <Toolbar>
        <Input label="Search" placeholder="Number, title or client" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder="All types" options={docTypeOptions} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status" options={enumOptions(DOC_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No documents yet', description: 'Create a quotation from a lead or start a new document.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Documents"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/documents/${r.id}`)}
              columns={[
                { key: 'doc', header: 'Document', render: (r) => (<><Link href={`/documents/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>{DOC_TYPE_LABEL[r.type]} · <span className={s.mono}>{r.number ?? 'Draft'}</span></div></>) },
                { key: 'party', header: 'Client', hideOnMobile: true, render: (r) => r.client?.company ?? r.client?.name ?? r.party?.company ?? r.party?.name ?? '—' },
                { key: 'total', header: 'Total', render: (r) => formatINR(r.totalPaise) },
                { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.issueDate ?? r.createdAt) },
                { key: 'by', header: 'Created by', hideOnMobile: true, render: (r) => r.createdBy?.name ?? '—' },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DocumentsInner />
    </Suspense>
  );
}
