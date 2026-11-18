'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Circle, Download, ExternalLink } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DataTable, DescriptionList, ErrorState, PageHeader, ProgressBar, StatusBadge, buttonClass, formatDate, formatDateTime, formatINR, useAsync } from '@globalantic/ui';
import { PayButton } from '@/components/PayButton';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

type Row = Record<string, any>;

export default function ProgramEnrollmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  usePageTitle('Certificate program');
  const state = useAsync(() => api().programStudent.enrollment(id), `program-enrollment-${id}`);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (state.status === 404) return <ErrorState title="Enrollment not found" message="This registration does not exist or belongs to another account." />;

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const a = await api().programStudent.startAttempt(id);
      router.push(`/program/${id}/assessment/${a.attemptId}`);
    } catch (err) {
      setStartError(errorMessage(err));
      setStarting(false);
    }
  };

  return (
    <AsyncView state={state}>
      {(e: Row) => {
        const lessons: Row[] = e.program.lessons;
        const progress = new Map<string, Row>((e.lessonProgress as Row[]).map((p) => [p.lessonId, p]));
        const elig: Row = e.eligibility;
        const open = e.status === 'ACTIVE' || e.status === 'COMPLETED';
        const lessonsDone = elig.lessonsDone >= elig.lessonsRequired;
        const passed = Boolean(elig.passedAttempt);
        const attemptsLeft = e.attemptsAllowed - e.attemptsUsed;
        const pct = elig.lessonsRequired ? Math.round((elig.lessonsDone * 100) / elig.lessonsRequired) : 100;
        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow="Certificate program"
              title={e.program.title}
              description={e.program.summary}
              actions={
                <Link href="/program" className={buttonClass('ghost', 'sm')}>
                  All programs
                </Link>
              }
            />
            <Card title="Registration">
              <DescriptionList
                items={[
                  { label: 'Enrollment no.', value: e.enrollmentNumber },
                  { label: 'Status', value: <StatusBadge status={e.status} /> },
                  { label: 'Program fee', value: formatINR(e.feePaise) },
                  { label: 'Registered', value: formatDate(e.registeredAt) },
                  ...(e.activatedAt ? [{ label: 'Unlocked', value: formatDate(e.activatedAt) }] : []),
                  ...(e.completedAt ? [{ label: 'Completed', value: formatDate(e.completedAt) }] : []),
                ]}
              />
            </Card>

            {e.status === 'PENDING_PAYMENT' && (
              <Card title="Pay the program fee">
                <div className={s.stackSm}>
                  <p className={s.muted}>
                    Paying unlocks the lessons and the final assessment. Your payment is confirmed by our server with the payment provider; you will receive a receipt by email.
                    Paying does not by itself earn the certificate.
                  </p>
                  <PayButton
                    amountPaise={e.feePaise}
                    onSettled={state.reload}
                    createOrder={() => api().programStudent.createOrder(id)}
                    verify={(input) => api().programStudent.verifyPayment(input)}
                    reportFailure={(orderId, reason) => api().programStudent.reportPaymentFailure(orderId, reason)}
                    successMessage="Payment verified. The program is unlocked."
                  />
                </div>
              </Card>
            )}

            {(e.status === 'REFUNDED' || e.status === 'CANCELLED') && (
              <Alert tone="warning" title={e.status === 'REFUNDED' ? 'Payment refunded' : 'Registration cancelled'}>
                Access to the lessons and the assessment is closed for this registration. Contact support if you have questions.
              </Alert>
            )}

            {e.certificate && (
              <Card title="Your certificate">
                <div className={s.stackSm}>
                  {e.certificate.status === 'ISSUED' ? (
                    <>
                      <DescriptionList
                        items={[
                          { label: 'Certificate no.', value: e.certificate.certificateNumber },
                          { label: 'Issued', value: formatDate(e.certificate.issuedAt) },
                          { label: 'Score', value: `${e.certificate.scorePercent}%` },
                          { label: 'Verification code', value: <span className={s.code}>{e.certificate.verificationCode}</span> },
                        ]}
                      />
                      <div className={s.row}>
                        <a href={api().programStudent.certificatePdfUrl(id)} className={buttonClass('primary', 'md')}>
                          <Download size={16} aria-hidden /> Download PDF
                        </a>
                        {e.verifyUrl && (
                          <a href={e.verifyUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('outline', 'md')}>
                            <ExternalLink size={16} aria-hidden /> Public verification<span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        )}
                      </div>
                      <p className={s.small}>The certificate confirms completion of a Globalantic program. It is not an academic degree or a government or university accreditation.</p>
                    </>
                  ) : (
                    <Alert tone="danger" title="Certificate revoked">This certificate is no longer valid. Contact support for details.</Alert>
                  )}
                </div>
              </Card>
            )}

            {open && (
              <div className={s.grid2}>
                <Card title="Lessons">
                  <div className={s.stackSm}>
                    <ProgressBar value={pct} label={`Required lessons completed: ${elig.lessonsDone} of ${elig.lessonsRequired}`} />
                    <p className={s.small}>
                      {elig.lessonsDone} of {elig.lessonsRequired} required lessons completed
                    </p>
                    <ol className={s.list} style={{ listStyle: 'none' }}>
                      {lessons.map((l, i) => {
                        const done = Boolean(progress.get(l.id)?.completedAt);
                        return (
                          <li key={l.id}>
                            <Link href={`/program/${id}/lessons/${l.id}`} className={`${s.item} ${s.itemLink}`}>
                              <span className={s.row}>
                                {done ? <CheckCircle2 size={18} aria-hidden color="var(--success, green)" /> : <Circle size={18} aria-hidden />}
                                <span className={s.title}>
                                  {i + 1}. {l.title}
                                </span>
                                <span className="sr-only">{done ? ', completed' : ', not completed'}</span>
                              </span>
                              <span className={s.small}>
                                {l.required ? 'Required' : 'Optional'}
                                {l.minMinutes ? ` · at least ${l.minMinutes} min` : ''}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </Card>

                <div className={s.stack}>
                  <Card title="Certificate requirements">
                    <ul className={s.list} style={{ listStyle: 'none' }}>
                      {[
                        { ok: elig.paid, label: 'Program fee verified' },
                        { ok: lessonsDone, label: `All required lessons completed (${elig.lessonsDone}/${elig.lessonsRequired})` },
                        { ok: passed, label: `Final assessment passed (at least ${e.program.passPercent}%)` },
                      ].map((r) => (
                        <li key={r.label} className={s.row}>
                          {r.ok ? <CheckCircle2 size={18} aria-hidden color="var(--success, green)" /> : <Circle size={18} aria-hidden />}
                          <span>{r.label}</span>
                          <span className="sr-only">{r.ok ? ' — done' : ' — not yet'}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card title="Final assessment">
                    <div className={s.stackSm}>
                      <p className={s.muted}>
                        Pass mark {e.program.passPercent}% · {e.program.timeLimitMinutes} minutes per attempt · attempts used {e.attemptsUsed} of {e.attemptsAllowed}
                      </p>
                      {passed ? (
                        <Alert tone="success">You passed the final assessment with {elig.passedAttempt.scorePercent}%.</Alert>
                      ) : e.status !== 'ACTIVE' ? null : !lessonsDone ? (
                        <p className={s.small}>Complete every required lesson to unlock the assessment.</p>
                      ) : e.openAttemptId ? (
                        <Link href={`/program/${id}/assessment/${e.openAttemptId}`} className={buttonClass('primary', 'md')}>
                          Resume attempt
                        </Link>
                      ) : attemptsLeft > 0 ? (
                        <div>
                          <Button onClick={start} loading={starting}>
                            Start the assessment
                          </Button>
                        </div>
                      ) : (
                        <Alert tone="warning">No attempts left. Contact support if you need another attempt.</Alert>
                      )}
                      {startError && <Alert tone="danger">{startError}</Alert>}
                      {(e.attempts as Row[]).filter((a) => a.submittedAt).length > 0 && (
                        <ul className={s.list} style={{ listStyle: 'none' }} aria-label="Past attempts">
                          {(e.attempts as Row[])
                            .filter((a) => a.submittedAt)
                            .map((a) => (
                              <li key={a.id} className={s.between}>
                                <span className={s.small}>{formatDateTime(a.submittedAt)}</span>
                                <span className={s.row}>
                                  <span className={s.strong}>{a.scorePercent}%</span>
                                  <Badge tone={a.passed ? 'success' : 'danger'}>{a.passed ? 'Passed' : 'Not passed'}</Badge>
                                </span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {(e.payments as Row[]).length > 0 && (
              <Card title="Payments">
                <DataTable<Row>
                  caption="Program payments"
                  rows={e.payments}
                  rowKey={(p) => p.id}
                  columns={[
                    { key: 'd', header: 'Date', render: (p) => formatDateTime(p.verifiedAt ?? p.createdAt) },
                    { key: 'a', header: 'Amount', render: (p) => formatINR(p.amountPaise) },
                    { key: 's', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
                    {
                      key: 'r',
                      header: 'Receipt',
                      render: (p) =>
                        p.invoice ? (
                          <a href={api().student.invoicePdfUrl(p.invoice.id)} className={s.link}>
                            {p.invoice.invoiceNumber} (PDF)
                          </a>
                        ) : (
                          '—'
                        ),
                    },
                  ]}
                />
              </Card>
            )}
          </div>
        );
      }}
    </AsyncView>
  );
}
