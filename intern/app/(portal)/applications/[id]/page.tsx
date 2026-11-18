'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@globalantic/api-client';
import type { StudentApplication } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  ErrorState,
  PageHeader,
  StatusBadge,
  buttonClass,
  formatDate,
  formatDateTime,
  formatINR,
  useAsync,
  useToast,
} from '@globalantic/ui';
import { PayButton } from '@/components/PayButton';
import { InfoRequestPanel } from '@/components/InfoRequest';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

const FLOW = [
  { key: 'SUBMITTED', label: 'Application submitted' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'APPROVED', label: 'Approved — fee payment' },
  { key: 'ENROLLED', label: 'Enrolled' },
] as const;

function Timeline({ app }: { app: StudentApplication }) {
  const ended = app.status === 'REJECTED' || app.status === 'WITHDRAWN';
  const reached = FLOW.findIndex((f) => f.key === app.status);
  return (
    <ol className={s.timeline} aria-label="Application progress">
      {FLOW.map((step, i) => {
        const done = !ended && reached >= i;
        return (
          <li key={step.key} className={s.step}>
            <span className={`${s.dot} ${done ? s.dotDone : ''}`} aria-hidden />
            <span className={s.stepLabel}>
              {step.label}
              <span className="sr-only">{done ? ' (done)' : ' (pending)'}</span>
            </span>
          </li>
        );
      })}
      {ended && (
        <li className={s.step}>
          <span className={`${s.dot} ${s.dotBad}`} aria-hidden />
          <span className={s.stepLabel}>{app.status === 'REJECTED' ? 'Not approved' : 'Withdrawn'}</span>
        </li>
      )}
    </ol>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  usePageTitle('Application');
  const state = useAsync(() => api().student.application(id), `application-${id}`);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  if (state.status === 404) {
    return <ErrorState title="Application not found" message="It may have been removed, or it belongs to another account." />;
  }

  return (
    <AsyncView state={state} loadingRows={4}>
      {(app) => {
        const paid = app.payments.some((p) => p.status === 'PAID');
        const pending = app.payments.some((p) => p.status === 'PENDING');
        const canPay = app.status === 'APPROVED' && app.payablePaise > 0 && !paid && !pending && app.batch.status !== 'CANCELLED';
        const canWithdraw = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(app.status) && !paid && !pending;
        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow={app.applicationNumber}
              title={app.course.title}
              description={`${app.batch.name} · ${formatDate(app.batch.startDate)} – ${formatDate(app.batch.endDate)}`}
              actions={<StatusBadge status={app.status} />}
            />

            {app.status === 'REJECTED' && (
              <Alert tone="danger" title="Application not approved">
                {app.rejectionReason ? <p>Reason: {app.rejectionReason}</p> : null}
              </Alert>
            )}
            <InfoRequestPanel app={app} onDone={state.reload} />

            {app.batch.status === 'CANCELLED' && <Alert tone="warning" title="This batch has been cancelled">Our admissions team will contact you about the next steps and any refund due.</Alert>}
            {pending && <Alert tone="info" title="Payment being confirmed">Your payment has been received and is awaiting final confirmation. Please do not pay again.</Alert>}
            {app.enrollment && (
              <Alert tone="success" title="You are enrolled">
                <Link href={`/enrollments/${app.enrollment.id}`} className={s.link}>
                  Go to your course
                </Link>
              </Alert>
            )}

            <div className={s.grid2}>
              <Card title="Progress">
                <Timeline app={app} />
              </Card>

              <Card title="Fees">
                <DescriptionList
                  items={[
                    { label: 'Course fee', value: formatINR(app.feePaise) },
                    { label: 'Discount', value: app.discountPaise > 0 ? `− ${formatINR(app.discountPaise)}` : '—' },
                    { label: 'Amount payable', value: <strong>{formatINR(app.payablePaise)}</strong> },
                    { label: 'Payment status', value: paid ? <StatusBadge status="PAID" /> : app.payablePaise === 0 ? 'No fee' : 'Not paid' },
                  ]}
                />
                <div style={{ marginTop: 16 }}>
                  {canPay ? (
                    <PayButton applicationId={app.id} amountPaise={app.payablePaise} onSettled={state.reload} />
                  ) : app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW' ? (
                    <p className={s.muted}>Payment opens once your application is approved.</p>
                  ) : null}
                </div>
              </Card>
            </div>

            <Card title="Application details">
              <DescriptionList
                items={[
                  { label: 'Qualification', value: app.qualification },
                  { label: 'Institution', value: app.institution },
                  { label: 'Graduation year', value: app.graduationYear },
                  { label: 'Statement', value: app.statement },
                  {
                    label: 'Supporting document',
                    value: app.documentFile ? (
                      <a href={api().files.url(app.documentFile.id)} download className={s.link}>
                        Download {'originalName' in app.documentFile ? app.documentFile.originalName : app.documentFile.name}
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Mode', value: app.batch.mode },
                  { label: 'Submitted', value: formatDateTime(app.createdAt) },
                  { label: 'Last reviewed', value: formatDateTime(app.reviewedAt) },
                ]}
              />
            </Card>

            {app.payments.length > 0 && (
              <Card title="Payments">
                <DataTable
                  caption="Payments for this application"
                  rows={app.payments}
                  rowKey={(p) => p.id}
                  columns={[
                    { key: 'date', header: 'Date', render: (p) => formatDateTime(p.createdAt) },
                    { key: 'amount', header: 'Amount', render: (p) => formatINR(p.amountPaise) },
                    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                    { key: 'note', header: 'Note', hideOnMobile: true, render: (p) => p.failureReason ?? '—' },
                  ]}
                />
                {app.invoices.length > 0 && (
                  <div className={s.row} style={{ marginTop: 12 }}>
                    {app.invoices.map((inv) => (
                      <Link key={inv.id} href={`/invoices/${inv.id}`} className={buttonClass('outline', 'sm')}>
                        Receipt {inv.invoiceNumber}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {canWithdraw && (
              <div className={s.actions}>
                <Button variant="ghost" onClick={() => setConfirmWithdraw(true)}>
                  Withdraw application
                </Button>
              </div>
            )}

            <ConfirmDialog
              open={confirmWithdraw}
              title="Withdraw this application?"
              message="Your seat request will be cancelled. You can apply again later if admissions are still open."
              confirmLabel="Withdraw"
              tone="danger"
              onClose={() => setConfirmWithdraw(false)}
              onConfirm={async () => {
                await api().student.withdraw(app.id);
                toast('Application withdrawn');
                state.reload();
                router.refresh();
              }}
            />
          </div>
        );
      }}
    </AsyncView>
  );
}
