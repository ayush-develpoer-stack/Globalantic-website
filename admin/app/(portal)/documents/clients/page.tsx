'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, Button, Checkbox, DataTable, Input, PageHeader, Pagination, Toolbar, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { ClientModal } from '@/lib/ClientModal';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ClientsPage() {
  const router = useRouter();
  const { can } = useSession();
  const canWrite = can('documents.manage') || can('documents.finance');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const q = useDebounced(search);
  const state = useAsync(() => api().documents.clients({ search: q, includeArchived: archived ? 'true' : undefined, page, pageSize: 20 }), JSON.stringify({ q, archived, page }));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>}
        title="Clients"
        description="Billing details used on quotations, agreements and invoices. Create a client from a lead to keep the CRM link."
        actions={canWrite ? <Button size="sm" onClick={() => setOpen(true)}>New client</Button> : undefined}
      />
      <Toolbar>
        <Input label="Search" placeholder="Name, company or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <div className={s.filterCheck}>
          <Checkbox label="Show archived" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} />
        </div>
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No clients yet', description: 'Add a client, or open a lead and create a quotation from it.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Clients"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/documents/clients/${r.id}`)}
              columns={[
                { key: 'n', header: 'Client', render: (r) => (<><Link href={`/documents/clients/${r.id}`} className={s.link}>{r.company ?? r.name}</Link><div className={s.small}>{r.company ? r.name : r.email}</div></>) },
                { key: 'e', header: 'Email', hideOnMobile: true, render: (r) => r.email },
                { key: 'l', header: 'Location', hideOnMobile: true, render: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—' },
                { key: 'lead', header: 'Lead', hideOnMobile: true, render: (r) => (r.lead ? <Link href={`/leads/${r.lead.id}`} className={s.link}>{r.lead.reference ?? 'Lead'}</Link> : '—') },
                { key: 'd', header: 'Documents', render: (r) => (<>{r._count.documents}{r.archivedAt && <> <Badge tone="warning">Archived</Badge></>}</>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      <ClientModal client={null} open={open} onClose={() => setOpen(false)} onSaved={(c) => router.push(`/documents/clients/${c.id}`)} />
    </>
  );
}
