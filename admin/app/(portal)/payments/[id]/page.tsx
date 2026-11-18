'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, Card, buttonClass, DataTable, DescriptionList, PageHeader, StatusBadge, formatDateTime, formatINR, useAsync, useSession, useToast } from '@globalantic/ui';
import { useConfirm, useRun } from '@/lib/admin';
import { EmailLogList, deliveryMessage } from '@/lib/docs';
import { AuditHistory } from '@/lib/AuditHistory';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const run = useRun();
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const { ask, dialog } = useConfirm();
  const [reconcile, setReconcile] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useAsync(() => api().admin.payment(id), `payment-${id}`);

  return (
    <AsyncView state={state}>
      {(p) => (
        <>
          <PageHeader
            eyebrow={<Link href="/payments" className={s.link}>← Payments</Link>}
            title={`${formatINR(p.amountPaise)} · ${enumLabel(p.provider)}`}
            description={<><StatusBadge status={p.status} /> · created {formatDateTime(p.createdAt)}</>}
            actions={
              <>
                {p.invoice && (
                  <a className={buttonClass('outline', 'sm')} href={api().admin.paymentReceiptUrl(p.id)} target="_blank" rel="noopener noreferrer">Receipt PDF</a>
                )}
                {can('payments.reconcile') && p.invoice && p.status === 'PAID' && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={resending}
                    onClick={async () => {
                      setResending(true);
                      const r = await run(() => api().admin.resendReceipt(id));
                      setResending(false);
                      if (r) {
                        toast(deliveryMessage(r.status, r.error), r.status === 'SENT' ? 'success' : 'danger');
                        state.reload();
                      }
                    }}
                  >
                    Resend receipt email
                  </Button>
                )}
                {can('payments.reconcile') && p.provider === 'RAZORPAY' && p.providerOrderId && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      const r = await run(() => api().admin.reconcilePayment(id), 'Checked with Razorpay');
                      setBusy(false);
                      if (r) {
                        setReconcile(r);
                        state.reload();
                      }
                    }}
                  >
                    Reconcile with Razorpay
                  </Button>
                )}
                {can('payments.reconcile') && p.status === 'PAID' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      ask({
                        title: 'Record a refund?',
                        message: 'Use this only after the refund has actually been executed in the Razorpay dashboard or by bank transfer. The receipt is marked refunded and any unpaid referral reward is cancelled. This is audited.',
                        confirmLabel: 'Record refund',
                        tone: 'danger',
                        requireReason: true,
                        onConfirm: async (reason) => {
                          await api().admin.recordRefund(id, reason);
                          state.reload();
                        },
                        success: 'Refund recorded',
                      })
                    }
                  >
                    Record refund
                  </Button>
                )}
              </>
            }
          />
          {p.disputeStatus && (
            <Alert tone="warning" title={`Payment dispute: ${enumLabel(p.disputeStatus)}`}>
              Raised {formatDateTime(p.disputedAt)}. The money status is not changed automatically{p.disputeStatus === 'LOST' ? ' — record the refund once it has been settled' : ''}.
            </Alert>
          )}
          {p.failureReason === 'DUPLICATE_PAYMENT_REFUND_REQUIRED' && (
            <Alert tone="warning" title="Duplicate payment">This application was already paid by another payment. No enrollment or reward was created from this one; refund it to the student.</Alert>
          )}
          {reconcile && (
            <Alert tone="info" title={`Reconciliation result: ${enumLabel(reconcile.result)}`} onDismiss={() => setReconcile(null)}>
              {reconcile.attempts.length === 0 ? 'Razorpay reports no payment attempts for this order.' : (
                <DataTable<Row>
                  caption="Provider attempts"
                  rows={reconcile.attempts}
                  rowKey={(a) => a.id}
                  columns={[
                    { key: 'id', header: 'Provider payment', render: (a) => <span className={s.mono}>{a.id}</span> },
                    { key: 'st', header: 'Status', render: (a) => a.status },
                    { key: 'amt', header: 'Amount', render: (a) => formatINR(a.amount) },
                    { key: 'm', header: 'Method', render: (a) => a.method ?? '—' },
                  ]}
                />
              )}
            </Alert>
          )}
          <div className={s.grid2} style={{ marginTop: 16 }}>
            <Card title="Payment">
              <DescriptionList
                items={[
                  { label: 'Status', value: <StatusBadge status={p.status} /> },
                  { label: 'Amount', value: formatINR(p.amountPaise) },
                  { label: 'Provider', value: enumLabel(p.provider) },
                  { label: 'Method', value: p.method },
                  { label: 'Order id', value: p.providerOrderId ? <span className={s.mono}>{p.providerOrderId}</span> : null },
                  { label: 'Provider payment id', value: p.providerPaymentId ? <span className={s.mono}>{p.providerPaymentId}</span> : null },
                  { label: 'Offline reference', value: p.offlineReference },
                  { label: 'Verified', value: p.verifiedAt ? `${formatDateTime(p.verifiedAt)} via ${enumLabel(p.verifiedVia)}` : 'Not verified' },
                  { label: 'Failure reason', value: p.failureReason },
                  { label: 'Refunded', value: p.refundedAt ? formatDateTime(p.refundedAt) : null },
                ]}
              />
            </Card>
            <Card title="Linked records">
              <DescriptionList
                items={[
                  { label: 'Student', value: <Link className={s.link} href={`/students/${p.student.id}`}>{p.student.name}</Link> },
                  { label: 'Email', value: p.student.email },
                  { label: 'Application', value: p.application ? <Link className={s.link} href={`/applications/${p.application.id}`}>{p.application.applicationNumber}</Link> : null },
                  { label: 'Application status', value: p.application ? <StatusBadge status={p.application.status} /> : null },
                  { label: 'Certificate program', value: p.programEnrollment ? <><Link className={s.link} href={`/programs/enrollments/${p.programEnrollment.id}`}>{p.programEnrollment.enrollmentNumber}</Link> · {p.programEnrollment.program.title} <StatusBadge status={p.programEnrollment.status} /></> : null },
                  { label: 'Receipt', value: p.invoice ? `${p.invoice.invoiceNumber} (${enumLabel(p.invoice.status)})` : 'Created only after verified payment' },
                  { label: 'Referral reward', value: p.referralReward ? <>{formatINR(p.referralReward.amountPaise)} <StatusBadge status={p.referralReward.status} /></> : 'None' },
                ]}
              />
            </Card>
          </div>
          <div className={s.grid2} style={{ marginTop: 20 }}>
            <Card title="Receipt emails">
              <EmailLogList emails={p.emails} />
            </Card>
            <Card title="Audit history">
              <AuditHistory entries={p.history} />
            </Card>
          </div>
          {dialog}
        </>
      )}
    </AsyncView>
  );
}
