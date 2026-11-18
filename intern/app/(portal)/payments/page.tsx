'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Card, DataTable, PageHeader, StatusBadge, buttonClass, formatDate, formatDateTime, formatINR, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';

type Row = Record<string, any>;
/** Course payments carry an application; certificate-program payments carry a program enrollment. */
const purposeOf = (r: Row) => (r.application ? `${r.application.course.title} · ${r.application.batch.name}` : r.programEnrollment ? `${r.programEnrollment.program.title} (${r.programEnrollment.enrollmentNumber})` : '—');
import { usePageTitle } from '@/components/usePageTitle';

export default function PaymentsPage() {
  usePageTitle('Payments');
  const payments = useAsync(() => api().student.payments(), 'payments');
  const invoices = useAsync(() => api().student.invoices(), 'invoices');
  return (
    <div className={s.stack}>
      <PageHeader title="Payments & receipts" description="Fee payments are verified by our server with the payment provider before a receipt is issued." />
      <Card title="Receipts">
        <AsyncView state={invoices} isEmpty={(d) => d.length === 0} empty={{ title: 'No receipts yet', description: 'A receipt is issued automatically once a payment is verified.' }}>
          {(rows) => (
            <DataTable
              caption="Receipts"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'n', header: 'Receipt', render: (r) => <span className={s.strong}>{r.invoiceNumber}</span> },
                { key: 'c', header: 'For', hideOnMobile: true, render: (r) => purposeOf(r as Row) },
                { key: 'a', header: 'Amount', render: (r) => formatINR(r.amountPaise) },
                { key: 'd', header: 'Date', hideOnMobile: true, render: (r) => formatDate(r.issuedAt) },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'v',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) => (
                    <span className={s.row}>
                      <Link href={`/invoices/${r.id}`} className={buttonClass('outline', 'sm')}>
                        View<span className="sr-only"> receipt {r.invoiceNumber}</span>
                      </Link>
                      <a href={api().student.invoicePdfUrl(r.id)} className={buttonClass('ghost', 'sm')}>
                        PDF<span className="sr-only"> download receipt {r.invoiceNumber}</span>
                      </a>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </AsyncView>
      </Card>
      <Card title="Payment history">
        <AsyncView state={payments} isEmpty={(d) => d.length === 0} empty={{ title: 'No payments yet' }}>
          {(rows) => (
            <DataTable
              caption="Payment history"
              rows={rows}
              rowKey={(r) => String(r.id)}
              columns={[
                { key: 'd', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
                {
                  key: 'c',
                  header: 'For',
                  render: (r) =>
                    r.application ? (
                      <Link href={`/applications/${r.application.id}`} className={s.link}>
                        {r.application.course.title}
                      </Link>
                    ) : r.programEnrollment ? (
                      <Link href={`/program/${r.programEnrollment.id}`} className={s.link}>
                        {r.programEnrollment.program.title}
                      </Link>
                    ) : (
                      '—'
                    ),
                },
                { key: 'a', header: 'Amount', render: (r) => formatINR(r.amountPaise) },
                { key: 'm', header: 'Method', hideOnMobile: true, render: (r) => (r.provider === 'OFFLINE' ? `Offline (${enumLabel(r.method)})` : r.method ? enumLabel(r.method) : 'Online') },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'f', header: 'Note', hideOnMobile: true, render: (r) => r.failureReason ?? '—' },
              ]}
            />
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
