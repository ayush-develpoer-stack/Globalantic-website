'use client';

import { Download } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Card, DataTable, PageHeader, buttonClass, formatDate, useAsync } from '@globalantic/ui';
import type { DocumentRow } from '@/lib/types';
import { fileSize } from '@/lib/util';
import s from '@/lib/page.module.css';

export default function DocumentsPage() {
  const state = useAsync(() => api().employee.documents() as Promise<DocumentRow[]>, 'documents');
  return (
    <div className={s.stack}>
      <PageHeader title="Documents" description="Documents HR has shared with you. Downloads are private to your account." />
      <Card padded={false}>
        <AsyncView state={state} empty={{ title: 'No documents yet', description: 'Offer letters, payslips and policies shared by HR will appear here.' }} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <DataTable
              caption="My documents"
              rows={rows}
              rowKey={(d) => d.id}
              columns={[
                { key: 'title', header: 'Document', render: (d) => <span className={s.itemTitle}>{d.title}</span> },
                { key: 'category', header: 'Category', hideOnMobile: true, render: (d) => enumLabel(d.category) },
                { key: 'date', header: 'Added', hideOnMobile: true, render: (d) => formatDate(d.createdAt) },
                { key: 'size', header: 'Size', hideOnMobile: true, render: (d) => fileSize(d.file.sizeBytes) },
                {
                  key: 'download',
                  header: <span className="sr-only">Download</span>,
                  render: (d) => (
                    <a href={api().files.url(d.file.id)} download={d.file.name} className={buttonClass('outline', 'sm')} aria-label={`Download ${d.title}`}>
                      <Download size={16} aria-hidden /> Download
                    </a>
                  ),
                },
              ]}
            />
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
