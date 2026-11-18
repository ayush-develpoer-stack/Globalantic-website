'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Button, ErrorState, StatusBadge, buttonClass, formatDate, formatDateTime, formatINR, useAsync } from '@globalantic/ui';
import p from '@/components/print.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle('Receipt');
  const state = useAsync(() => api().student.invoice(id), `invoice-${id}`);
  if (state.status === 404) return <ErrorState title="Receipt not found" message="This receipt does not exist or belongs to another account." />;

  return (
    <AsyncView state={state}>
      {(inv) => {
        // Certificate-program receipts have no application (the API returns programEnrollment instead).
        const program = inv.programEnrollment ?? null;
        return (
        <div>
          <div className={p.toolbar}>
            <Link href="/payments" className={buttonClass('ghost', 'sm')}>
              Back to payments
            </Link>
            <a href={api().student.invoicePdfUrl(inv.id)} className={buttonClass('outline', 'sm')}>
              <Download size={16} aria-hidden /> Download receipt (PDF)
            </a>
            <Button size="sm" onClick={() => window.print()}>
              <Printer size={16} aria-hidden /> Print / save as PDF
            </Button>
          </div>
          <article className={p.doc} aria-label={`Receipt ${inv.invoiceNumber}`}>
            <div className={p.docHead}>
              <div>
                <div className={p.brand}>Globalantic</div>
                <div className={p.note}>Training &amp; Internship Programs</div>
              </div>
              <div className={p.meta}>
                <div>
                  <strong>Payment receipt</strong>
                </div>
                <div>{inv.invoiceNumber}</div>
                <div>Issued {formatDate(inv.issuedAt)}</div>
                <div style={{ marginTop: 6 }}>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            </div>
            <div>
              <div className={p.note}>Billed to</div>
              <div>
                <strong>{inv.student?.name}</strong>
              </div>
              <div>{inv.student?.email}</div>
              <div className={p.note} style={{ marginTop: 6 }}>
                {inv.application
                  ? `Application ${inv.application.applicationNumber}`
                  : program
                    ? `${program.program.title} · Enrollment ${program.enrollmentNumber}`
                    : null}
              </div>
            </div>
            <table className={p.items}>
              <caption className="sr-only">Receipt line items</caption>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.description}</td>
                    <td>{li.amountPaise < 0 ? `− ${formatINR(-li.amountPaise)}` : formatINR(li.amountPaise)}</td>
                  </tr>
                ))}
                <tr className={p.total}>
                  <td>Total paid</td>
                  <td>{formatINR(inv.amountPaise)}</td>
                </tr>
              </tbody>
            </table>
            <div className={p.note}>
              {inv.payment?.provider === 'OFFLINE' ? `Paid offline (${enumLabel(inv.payment.method)})` : 'Paid online via Razorpay'}
              {inv.payment?.providerPaymentId ? ` · Ref ${inv.payment.providerPaymentId}` : ''}
              {inv.payment?.verifiedAt ? ` · Verified ${formatDateTime(inv.payment.verifiedAt)}` : ''}
            </div>
            <div className={p.note}>This is a computer-generated receipt and does not require a signature.</div>
          </article>
        </div>
        );
      }}
    </AsyncView>
  );
}
