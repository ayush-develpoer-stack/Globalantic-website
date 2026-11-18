'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DataTable, DescriptionList, PageHeader, StatusBadge, buttonClass, formatDateTime, formatINR, useAsync, useSession, useToast } from '@globalantic/ui';
import { useConfirm, useRun } from '@/lib/admin';
import { deliveryMessage } from '@/lib/docs';
import { AuditHistory } from '@/lib/AuditHistory';
import { EmailLogList } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ProgramEnrollmentPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const canManage = can('programs.manage');
  const run = useRun();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const state = useAsync(() => api().programAdmin.enrollment(id), `program-enrollment-${id}`);

  return (
    <AsyncView state={state} loadingRows={6}>
      {(e) => {
        const progress = new Map<string, Row>(((e.lessonProgress as Row[]) ?? []).map((p) => [p.lessonId, p]));
        const cert = e.certificate as Row | null;
        const elig = e.eligibility as Row;
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/programs/enrollments" className={s.link}>← Enrollments</Link>}
              title={e.student.name}
              description={<span className={s.row}><StatusBadge status={e.status} /> <span className={s.mono}>{e.enrollmentNumber}</span> <span>{e.program.title}</span></span>}
              actions={
                canManage ? (
                  <div className={s.actions}>
                    {e.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" onClick={() => ask({ title: 'Grant one extra assessment attempt?', requireReason: true, confirmLabel: 'Grant attempt', onConfirm: async (reason) => { await api().programAdmin.grantExtraAttempt(e.id, reason); state.reload(); }, success: 'Extra attempt granted' })}>
                        Grant extra attempt
                      </Button>
                    )}
                    {e.status === 'PENDING_PAYMENT' && (
                      <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Cancel this unpaid registration?', message: 'The student can register again later at the then-current fee.', requireReason: true, tone: 'danger', confirmLabel: 'Cancel registration', onConfirm: async (reason) => { await api().programAdmin.cancelEnrollment(e.id, reason); state.reload(); }, success: 'Registration cancelled' })}>
                        Cancel registration
                      </Button>
                    )}
                    {!cert && elig.eligible && (
                      <Button size="sm" onClick={() => ask({ title: 'Issue the certificate?', message: 'The student meets every completion rule. The certificate is emailed to them.', confirmLabel: 'Issue certificate', onConfirm: async () => { await api().programAdmin.issueCertificate(e.id); state.reload(); }, success: 'Certificate issued' })}>
                        Issue certificate
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            />
            <div className={s.stack}>
              {!cert && (
                <Alert tone={elig.eligible ? 'success' : 'info'} title={elig.eligible ? 'Eligible for the certificate' : 'Not yet eligible for the certificate'}>
                  {elig.eligible ? 'All completion rules are met.' : (
                    <ul style={{ paddingLeft: 18 }}>
                      {(elig.reasons as string[]).map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                </Alert>
              )}
              <div className={s.grid2}>
                <Card title="Enrollment">
                  <DescriptionList
                    items={[
                      { label: 'Student', value: <>{e.student.name}<div className={s.small}>{e.student.email}{e.student.phone ? ` · +${e.student.phone}` : ''}</div></> },
                      { label: 'Program', value: <Link href={`/programs/${e.program.id}`} className={s.link}>{e.program.title}</Link> },
                      { label: 'Fee (at registration)', value: formatINR(e.feePaise) },
                      { label: 'Registered', value: formatDateTime(e.registeredAt) },
                      { label: 'Activated', value: e.activatedAt ? formatDateTime(e.activatedAt) : 'After verified payment' },
                      { label: 'Completed', value: e.completedAt ? formatDateTime(e.completedAt) : '—' },
                      { label: 'Lessons completed', value: `${elig.lessonsDone} of ${elig.lessonsRequired} required` },
                      { label: 'Attempts allowed', value: `${e.program.maxAttempts} + ${e.extraAttempts} extra` },
                    ]}
                  />
                </Card>
                <Card title="Certificate">
                  {cert ? (
                    <div className={s.stackSm}>
                      <DescriptionList
                        items={[
                          { label: 'Number', value: <span className={s.mono}>{cert.certificateNumber}</span> },
                          { label: 'Verification code', value: <span className={s.mono}>{cert.verificationCode}</span> },
                          { label: 'Status', value: <StatusBadge status={cert.status} /> },
                          { label: 'Issued', value: `${formatDateTime(cert.issuedAt)}${cert.issuedById ? ' (manually)' : ' (automatically)'}` },
                          { label: 'Score', value: `${cert.scorePercent}%` },
                          { label: 'Revoked', value: cert.revokedAt ? `${formatDateTime(cert.revokedAt)} — ${cert.revokeReason}` : null },
                        ]}
                      />
                      <div className={s.actions}>
                        <a className={buttonClass('outline', 'sm')} href={api().programAdmin.certificatePdfUrl(cert.id)} target="_blank" rel="noopener noreferrer">View PDF</a>
                        {canManage && cert.status === 'ISSUED' && (
                          <>
                            <Button size="sm" variant="outline" onClick={async () => { const r = await run(() => api().programAdmin.resendCertificate(cert.id)); if (r) { toast(deliveryMessage(r.status, r.error), r.status === 'SENT' ? 'success' : 'danger'); state.reload(); } }}>
                              Resend email
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => ask({ title: 'Revoke this certificate?', message: 'Public verification will show it as revoked. This cannot be undone here.', tone: 'danger', requireReason: true, confirmLabel: 'Revoke', onConfirm: async (reason) => { await api().programAdmin.revokeCertificate(cert.id, reason); state.reload(); }, success: 'Certificate revoked' })}>
                              Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className={s.muted}>Issued automatically once the fee is verified, every required lesson is completed and the final assessment is passed.</p>
                  )}
                </Card>
              </div>
              <Card title="Payments">
                {(e.payments as Row[]).length === 0 ? (
                  <p className={s.muted}>No payment attempts yet.</p>
                ) : (
                  <DataTable<Row>
                    caption="Payments"
                    rows={e.payments}
                    rowKey={(p) => p.id}
                    columns={[
                      { key: 'amt', header: 'Amount', render: (p) => <Link href={`/payments/${p.id}`} className={s.link}>{formatINR(p.amountPaise)}</Link> },
                      { key: 'st', header: 'Status', render: (p) => (<><StatusBadge status={p.status} />{p.disputeStatus && <> <Badge tone="warning">Dispute {p.disputeStatus.toLowerCase()}</Badge></>}</>) },
                      { key: 'ref', header: 'Reference', hideOnMobile: true, render: (p) => <span className={s.mono}>{p.providerPaymentId ?? p.offlineReference ?? p.providerOrderId ?? '—'}</span> },
                      { key: 'v', header: 'Verified', hideOnMobile: true, render: (p) => (p.verifiedAt ? formatDateTime(p.verifiedAt) : '—') },
                      { key: 'r', header: 'Receipt', render: (p) => (p.invoice ? <a className={s.link} href={api().admin.paymentReceiptUrl(p.id)} target="_blank" rel="noopener noreferrer">{p.invoice.invoiceNumber}</a> : '—') },
                    ]}
                  />
                )}
              </Card>
              <div className={s.grid2}>
                <Card title="Lesson progress">
                  <ul className={s.list}>
                    {(e.program.lessons as Row[]).map((l) => {
                      const p = progress.get(l.id);
                      return (
                        <li key={l.id} className={s.listItem}>
                          <div className={s.rowBetween}>
                            <span className={s.strong}>{l.title}</span>
                            {p?.completedAt ? <Badge tone="success">Completed</Badge> : p ? <Badge tone="info">Opened</Badge> : <Badge>Not started</Badge>}
                          </div>
                          <span className={s.small}>
                            {l.required ? 'Required' : 'Optional'}
                            {p?.openedAt ? ` · opened ${formatDateTime(p.openedAt)}` : ''}
                            {p?.completedAt ? ` · completed ${formatDateTime(p.completedAt)}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card title="Assessment attempts">
                  {(e.attempts as Row[]).length === 0 ? (
                    <p className={s.muted}>No attempts yet.</p>
                  ) : (
                    <ul className={s.list}>
                      {(e.attempts as Row[]).map((a) => (
                        <li key={a.id} className={s.listItem}>
                          <div className={s.rowBetween}>
                            <span className={s.strong}>{a.submittedAt ? `${a.scorePercent}%` : 'In progress'}</span>
                            {a.submittedAt && (a.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>)}
                          </div>
                          <span className={s.small}>Started {formatDateTime(a.startedAt)}{a.submittedAt ? ` · submitted ${formatDateTime(a.submittedAt)}` : ` · due ${formatDateTime(a.deadlineAt)}`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <div className={s.grid2}>
                <Card title="Emails">
                  <EmailLogList emails={e.emails} />
                </Card>
                <Card title="History">
                  <AuditHistory entries={e.history} />
                </Card>
              </div>
            </div>
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}
