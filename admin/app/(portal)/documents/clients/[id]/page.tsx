'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, Button, Card, DataTable, DescriptionList, PageHeader, StatusBadge, buttonClass, formatDate, formatINR, useAsync, useSession } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import { ClientModal } from '@/lib/ClientModal';
import { DOC_TYPE_LABEL } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const canWrite = can('documents.manage') || can('documents.finance');
  const { ask, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const state = useAsync(() => api().documents.client(id), `doc-client-${id}`);

  return (
    <AsyncView state={state}>
      {(c) => (
        <>
          <PageHeader
            eyebrow={<Link href="/documents/clients" className={s.link}>← Clients</Link>}
            title={c.company ?? c.name}
            description={c.archivedAt ? <Badge tone="warning">Archived</Badge> : c.email}
            actions={
              canWrite ? (
                <div className={s.actions}>
                  {!c.archivedAt && <Link href={`/documents/new?clientId=${c.id}`} className={buttonClass('primary', 'sm')}>New document</Link>}
                  <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => ask({ title: c.archivedAt ? 'Restore client?' : 'Archive client?', message: c.archivedAt ? undefined : 'Existing documents are kept. Archived clients cannot be chosen for new documents.', confirmLabel: c.archivedAt ? 'Restore' : 'Archive', onConfirm: async () => { await api().documents.archiveClient(c.id, !c.archivedAt); state.reload(); }, success: 'Client updated' })}>
                    {c.archivedAt ? 'Restore' : 'Archive'}
                  </Button>
                </div>
              ) : undefined
            }
          />
          <div className={s.stack}>
            <Card title="Billing details">
              <DescriptionList
                items={[
                  { label: 'Contact', value: c.name },
                  { label: 'Company', value: c.company },
                  { label: 'Email', value: c.email },
                  { label: 'Phone', value: c.phone },
                  { label: 'Address', value: [c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country].filter(Boolean).join(', ') || null },
                  { label: 'GST state code', value: c.stateCode },
                  { label: 'GSTIN', value: c.gstin },
                  { label: 'Lead', value: c.lead ? <Link href={`/leads/${c.lead.id}`} className={s.link}>{c.lead.reference ?? c.lead.name}</Link> : null },
                  { label: 'Notes', value: c.notes ? <span className={s.preWrap}>{c.notes}</span> : null },
                ]}
              />
            </Card>
            <Card title="Documents">
              {c.documents.length === 0 ? (
                <p className={s.muted}>No documents yet.</p>
              ) : (
                <DataTable<Row>
                  caption="Client documents"
                  rows={c.documents}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'd', header: 'Document', render: (r) => (<><Link href={`/documents/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>{DOC_TYPE_LABEL[r.type]} · {r.number ?? 'Draft'}</div></>) },
                    { key: 't', header: 'Total', render: (r) => formatINR(r.totalPaise) },
                    { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'dt', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.issueDate ?? r.createdAt) },
                  ]}
                />
              )}
            </Card>
          </div>
          <ClientModal client={c} open={open} onClose={() => setOpen(false)} onSaved={() => state.reload()} />
          {dialog}
        </>
      )}
    </AsyncView>
  );
}
