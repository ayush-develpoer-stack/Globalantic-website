'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { OFFLINE_PAYMENT_METHODS, enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  formatDate,
  formatDateTime,
  formatINR,
  useAsync,
  useSession,
  useToast,
} from '@globalantic/ui';
import { enumOptions, useConfirm } from '@/lib/admin';
import { AuditHistory } from '@/lib/AuditHistory';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function OfflinePaymentModal({ app, open, onClose, onDone }: { app: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.recordOfflinePayment(app.id, { method, reference, reason });
      toast('Offline payment recorded and enrollment confirmed');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Record offline payment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={pending} disabled={!ack || reference.trim().length < 3 || reason.trim().length < 3}>Record payment of {formatINR(app.payablePaise)}</Button>
        </>
      }
    >
      <Alert tone="warning" title="This is a permanent, audited financial record">
        Only record money that has actually been received outside Razorpay (cash, bank transfer, UPI to the company account, cheque). The amount is fixed by the server to the application&apos;s payable fee. Your name, the reference and the reason are written to the audit log, and any referral reward created from this payment goes to manual review.
      </Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={enumOptions(OFFLINE_PAYMENT_METHODS)} />
      <Input label="Payment reference" required value={reference} onChange={(e) => setReference(e.target.value)} error={fields.reference} hint="Receipt number, bank UTR or UPI transaction id" maxLength={120} />
      <Textarea label="Reason / notes" required value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} rows={3} maxLength={500} />
      <label className={s.toggleRow}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span className={s.muted}>I confirm this payment has been received and verified.</span>
      </label>
    </Modal>
  );
}

function TransferModal({ app, open, onClose, onDone }: { app: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const batches = useAsync(() => (open ? api().admin.batches({ courseId: app.course.id, pageSize: 100 }) : Promise.resolve(null)), `transfer-${app.id}-${open}`);
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const options = (batches.data?.items ?? [])
    .filter((b) => b.id !== app.batch.id && !['CANCELLED', 'COMPLETED'].includes(b.status))
    .map((b) => ({ value: b.id, label: `${b.name} · ${enumLabel(b.status)} · ${b.seatsTaken}/${b.capacity} seats` }));
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.transfer(app.id, batchId, reason);
      toast('Batch changed');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Move to another batch" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!batchId || reason.trim().length < 3}>Move</Button></>}>
      <p className={s.muted}>Only batches of {app.course.title} are listed. The fee snapshot is not changed.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Target batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder={batches.loading ? 'Loading…' : options.length ? 'Choose a batch' : 'No other open batches'} options={options} />
      <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
    </Modal>
  );
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { ask, dialog } = useConfirm();
  const [offline, setOffline] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const state = useAsync(() => api().admin.application(id), `application-${id}`);
  const manage = can('training.admissions.manage');

  const review = (action: 'UNDER_REVIEW' | 'APPROVE' | 'REJECT', label: string) =>
    ask({
      title: `${label}?`,
      message:
        action === 'APPROVE'
          ? 'Approval reserves a seat. The student is notified and asked to pay (free courses enroll immediately).'
          : action === 'REJECT'
            ? 'The student is notified with the reason you give.'
            : 'The application will be marked as under review.',
      confirmLabel: label,
      tone: action === 'REJECT' ? 'danger' : 'primary',
      requireReason: action === 'REJECT',
      reasonLabel: 'Rejection reason (sent to the student)',
      onConfirm: async (reason) => {
        await api().admin.reviewApplication(id, action, reason || undefined);
        state.reload();
      },
      success: 'Application updated',
    });

  const requestInfo = () =>
    ask({
      title: 'Request more information?',
      message: 'The application moves to Under review and the applicant is notified by email and in their portal. They can reply once from the student portal.',
      confirmLabel: 'Send request',
      requireReason: true,
      reasonLabel: 'What do you need from the applicant?',
      onConfirm: async (reason) => {
        await api().admin.reviewApplication(id, 'REQUEST_INFO', reason);
        state.reload();
      },
      success: 'Information requested',
    });

  return (
    <AsyncView state={state}>
      {(a) => {
        const paid = (a.payments as Row[]).some((p) => p.status === 'PAID');
        const pendingPay = (a.payments as Row[]).some((p) => p.status === 'PENDING');
        const p = a.student.studentProfile ?? {};
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/applications" className={s.link}>← Admissions</Link>}
              title={a.applicationNumber}
              description={<>{a.course.title} · {a.batch.name} · <StatusBadge status={a.status} /></>}
              actions={
                manage ? (
                  <>
                    {a.status === 'SUBMITTED' && <Button size="sm" variant="outline" onClick={() => review('UNDER_REVIEW', 'Mark under review')}>Mark under review</Button>}
                    {['SUBMITTED', 'UNDER_REVIEW'].includes(a.status) && <Button size="sm" variant="outline" onClick={requestInfo}>Request more information</Button>}
                    {['SUBMITTED', 'UNDER_REVIEW'].includes(a.status) && <Button size="sm" onClick={() => review('APPROVE', 'Approve')}>Approve</Button>}
                    {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status) && !paid && !pendingPay && <Button size="sm" variant="danger" onClick={() => review('REJECT', 'Reject')}>Reject</Button>}
                  </>
                ) : undefined
              }
            />
            {!manage && <Alert tone="info">You have read-only access to admissions.</Alert>}
            {a.infoRequest && (
              <section className={s.callout} aria-label="Information request" style={{ marginBottom: 20 }}>
                <p className={s.strong}>Information requested{a.infoRequestedAt ? ` · ${formatDateTime(a.infoRequestedAt)}` : ''}</p>
                <p className={s.preWrap}>{a.infoRequest}</p>
                {a.infoResponse && a.infoRespondedAt && (!a.infoRequestedAt || new Date(a.infoRespondedAt) >= new Date(a.infoRequestedAt)) ? (
                  <>
                    <p className={s.strong}>Applicant’s response · {formatDateTime(a.infoRespondedAt)}</p>
                    <p className={s.preWrap}>{a.infoResponse}</p>
                  </>
                ) : (
                  <p className={s.muted}>Waiting for the applicant to respond.</p>
                )}
              </section>
            )}
            <div className={s.grid2}>
              <div className={s.stack}>
                <Card title="Student">
                  <DescriptionList
                    items={[
                      { label: 'Name', value: <Link className={s.link} href={`/students/${a.student.id}`}>{a.student.name}</Link> },
                      { label: 'Email', value: <>{a.student.email} {a.student.emailVerifiedAt ? '' : <StatusBadge status="PENDING" />}</> },
                      { label: 'Phone', value: a.student.phone },
                      { label: 'Account', value: <StatusBadge status={a.student.status} /> },
                      { label: 'City', value: p.city },
                    ]}
                  />
                </Card>
                <Card title="Education & statement">
                  <DescriptionList
                    items={[
                      { label: 'Qualification', value: a.qualification },
                      { label: 'Institution', value: a.institution },
                      { label: 'Graduation year', value: a.graduationYear },
                      { label: 'Statement', value: a.statement },
                      {
                        label: 'Document',
                        value: a.documentFile ? (
                          <a className={s.link} href={api().files.url(a.documentFile.id)}>
                            Download {a.documentFile.originalName} ({Math.ceil(a.documentFile.sizeBytes / 1024)} KB)
                          </a>
                        ) : a.documentUrl ? (
                          <a className={s.link} href={a.documentUrl} target="_blank" rel="noopener noreferrer">Open document</a>
                        ) : (
                          'None provided'
                        ),
                      },
                      { label: 'Documents verified', value: a.documentsVerifiedAt ? formatDateTime(a.documentsVerifiedAt) : 'Not yet' },
                    ]}
                  />
                  {manage && !a.documentsVerifiedAt && (
                    <div className={s.actions} style={{ marginTop: 12 }}>
                      <Button size="sm" variant="outline" onClick={() => ask({ title: 'Mark documents as verified?', confirmLabel: 'Verify', onConfirm: async () => { await api().admin.verifyDocuments(id); state.reload(); }, success: 'Documents verified' })}>Verify documents</Button>
                    </div>
                  )}
                </Card>
                {a.rejectionReason && <Alert tone="danger" title="Rejection reason">{a.rejectionReason}</Alert>}
              </div>
              <div className={s.stack}>
                <Card title="Fee (snapshot at submission)">
                  <DescriptionList
                    items={[
                      { label: 'Course fee', value: formatINR(a.feePaise) },
                      { label: 'Discount', value: formatINR(a.discountPaise) },
                      { label: 'Payable', value: <span className={s.strong}>{formatINR(a.payablePaise)}</span> },
                      { label: 'Enrollment', value: a.enrollment ? <StatusBadge status={a.enrollment.status} /> : 'Not enrolled' },
                    ]}
                  />
                  {manage && (
                    <div className={s.actions} style={{ marginTop: 12 }}>
                      {a.status === 'APPROVED' && (a.payablePaise === 0 || paid) && (
                        <Button size="sm" onClick={() => ask({ title: 'Confirm enrollment?', message: 'Allowed only because the fee is settled or zero.', confirmLabel: 'Confirm enrollment', onConfirm: async () => { await api().admin.confirmEnrollment(id); state.reload(); }, success: 'Enrollment confirmed' })}>Confirm enrollment</Button>
                      )}
                      {a.status === 'APPROVED' && a.payablePaise > 0 && !paid && !pendingPay && can('payments.record_offline') && (
                        <Button size="sm" variant="outline" onClick={() => setOffline(true)}><ShieldAlert size={16} aria-hidden /> Record offline payment</Button>
                      )}
                      {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ENROLLED'].includes(a.status) && can('training.batches.manage') && (
                        <Button size="sm" variant="ghost" onClick={() => setTransfer(true)}>Move to another batch</Button>
                      )}
                    </div>
                  )}
                </Card>
                <Card title="Payments">
                  {a.payments.length === 0 ? (
                    <EmptyState title="No payments yet" />
                  ) : (
                    <DataTable<Row>
                      caption="Payments"
                      rows={a.payments}
                      rowKey={(x) => x.id}
                      columns={[
                        { key: 'amt', header: 'Amount', render: (x) => (can('payments.read') ? <Link className={s.link} href={`/payments/${x.id}`}>{formatINR(x.amountPaise)}</Link> : formatINR(x.amountPaise)) },
                        { key: 'prov', header: 'Via', render: (x) => enumLabel(x.provider) },
                        { key: 'at', header: 'Date', hideOnMobile: true, render: (x) => formatDate(x.verifiedAt ?? x.createdAt) },
                        { key: 'st', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
                      ]}
                    />
                  )}
                  {a.invoices.length > 0 && <p className={s.small} style={{ marginTop: 10 }}>Receipts: {a.invoices.map((i: Row) => i.invoiceNumber).join(', ')}</p>}
                </Card>
                <Card title="History">
                  <AuditHistory entries={a.history} />
                </Card>
              </div>
            </div>
            <OfflinePaymentModal app={a} open={offline} onClose={() => setOffline(false)} onDone={state.reload} />
            {transfer && <TransferModal app={a} open={transfer} onClose={() => setTransfer(false)} onDone={state.reload} />}
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}
