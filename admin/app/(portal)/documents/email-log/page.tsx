'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, DataTable, PageHeader, formatDateTime, useAsync } from '@globalantic/ui';
import { EmailStatus } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

const KIND_LABEL: Record<string, string> = {
  'payment.confirmation': 'Payment confirmation + receipt',
  'payment.admin_alert': 'Payment alert to team',
  'program.certificate': 'Program certificate',
  'document.sent': 'Document sent',
};

function link(r: Row) {
  if (r.entityType === 'BusinessDocument') return <Link href={`/documents/${r.entityId}`} className={s.link}>Open document</Link>;
  return null;
}

export default function EmailLogPage() {
  const state = useAsync(() => api().documents.emailLog(), 'email-log');
  return (
    <>
      <PageHeader eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>} title="Email log" description="The latest 100 receipt, certificate and document emails and whether they were delivered to the email provider. “Not sent” means no email provider is configured on the server." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No emails recorded yet' }}>
        {(rows) => (
          <DataTable<Row>
            caption="Email log"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'w', header: 'When', render: (r) => formatDateTime(r.createdAt) },
              { key: 'k', header: 'Email', render: (r) => (<><div className={s.strong}>{KIND_LABEL[r.kind] ?? r.kind}</div><div className={s.small}>{r.subject}</div></>) },
              { key: 't', header: 'To', hideOnMobile: true, render: (r) => <span className={s.mono}>{r.to}</span> },
              { key: 's', header: 'Status', render: (r) => (<><EmailStatus status={r.status} />{r.error && <div className={s.small}>{r.error}</div>}</>) },
              { key: 'l', header: <span className="sr-only">Link</span>, hideOnMobile: true, render: link },
            ]}
          />
        )}
      </AsyncView>
    </>
  );
}
