'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { ENROLLMENT_STATUSES, enumLabel } from '@globalantic/types';
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
  ProgressBar,
  Select,
  StatusBadge,
  Textarea,
  formatDate,
  formatDateTime,
  formatINR,
  percent,
  toDateInput,
  useSession,
  useToast,
  useAsync,
} from '@globalantic/ui';
import { enumOptions, useConfirm } from '@/lib/admin';
import { NotesPanel } from '@/lib/notes';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function EditStudentModal({ student, open, onClose, onDone }: { student: Row; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const p = student.studentProfile ?? {};
  const [v, setV] = useState({
    name: student.name ?? '',
    city: p.city ?? '',
    qualification: p.qualification ?? '',
    institution: p.institution ?? '',
    graduationYear: p.graduationYear ? String(p.graduationYear) : '',
    dateOfBirth: toDateInput(p.dateOfBirth),
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.updateStudent(student.id, v);
      toast('Student updated');
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
    <Modal open={open} onClose={onClose} title="Edit student profile" size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={v.reason.trim().length < 3}>Save</Button></>}>
      <p className={s.muted}>Email and phone are identity fields and cannot be changed here. Every change is audited.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Full name" value={v.name} onChange={set('name')} error={fields.name} maxLength={120} />
        <Input label="City" value={v.city} onChange={set('city')} error={fields.city} maxLength={120} />
        <Input label="Qualification" value={v.qualification} onChange={set('qualification')} error={fields.qualification} maxLength={120} />
        <Input label="Institution" value={v.institution} onChange={set('institution')} error={fields.institution} maxLength={160} />
        <Input label="Graduation year" type="number" value={v.graduationYear} onChange={set('graduationYear')} error={fields.graduationYear} />
        <Input label="Date of birth" type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} error={fields.dateOfBirth} />
        <Textarea label="Reason for change" required containerClassName={s.span2} value={v.reason} onChange={set('reason')} error={fields.reason} rows={2} maxLength={500} />
      </div>
    </Modal>
  );
}

function EnrollmentStatusModal({ enrollment, open, onClose, onDone }: { enrollment: Row | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!enrollment) return null;
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.setEnrollmentStatus(enrollment.id, status, reason);
      toast('Enrollment updated');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Change enrollment: ${enrollment.course.title}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!status || reason.trim().length < 3}>Update</Button></>}>
      <p className={s.muted}>Current status: <StatusBadge status={enrollment.status} /></p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Choose a status" options={enumOptions(ENROLLMENT_STATUSES.filter((x) => x !== enrollment.status))} />
      <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
    </Modal>
  );
}

function CertificatePanel({ enrollment, onIssued }: { enrollment: Row; onIssued: () => void }) {
  const { ask, dialog } = useConfirm();
  const [check, setCheck] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (enrollment.certificate) {
    return (
      <p className={s.small}>
        Certificate {enrollment.certificate.certificateNumber} · <StatusBadge status={enrollment.certificate.status} />
      </p>
    );
  }
  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      setCheck(await api().admin.certificateEligibility(enrollment.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={s.stackSm}>
      {error && <Alert tone="danger">{error}</Alert>}
      {check && (check.eligible ? (
        <Alert tone="success" title="Eligible for a certificate">Attendance {percent(check.attendancePercent)} (minimum {check.minAttendancePercent}%).</Alert>
      ) : (
        <Alert tone="warning" title="Not eligible yet">
          <ul>{check.reasons.map((r: string) => <li key={r}>• {r}</li>)}</ul>
        </Alert>
      ))}
      <div className={s.actions}>
        <Button size="sm" variant="outline" onClick={runCheck} loading={loading}>Check certificate eligibility</Button>
        {check?.eligible && (
          <Button size="sm" onClick={() => ask({ title: 'Issue certificate?', message: 'The student will be notified and the certificate becomes publicly verifiable.', confirmLabel: 'Issue certificate', onConfirm: async () => { await api().admin.issueCertificate(enrollment.id); onIssued(); }, success: 'Certificate issued' })}>
            Issue certificate
          </Button>
        )}
      </div>
      {dialog}
    </div>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [enrollmentToChange, setEnrollmentToChange] = useState<Row | null>(null);
  const state = useAsync(() => api().admin.student(id), `student-${id}`);
  const manage = can('training.students.manage');

  return (
    <AsyncView state={state}>
      {(st) => {
        const p = st.studentProfile ?? {};
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/students" className={s.link}>← Students</Link>}
              title={st.name}
              description={<>{st.email} · <StatusBadge status={st.status} /></>}
              actions={
                manage ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit profile</Button>
                    {st.status === 'ACTIVE' ? (
                      <Button size="sm" variant="danger" onClick={() => ask({ title: `Suspend ${st.name}?`, message: 'All active sessions are revoked immediately and the student cannot sign in until reactivated.', confirmLabel: 'Suspend', tone: 'danger', requireReason: true, onConfirm: async (reason) => { await api().admin.setUserStatus(id, 'SUSPENDED', reason); state.reload(); }, success: 'Account suspended' })}>Suspend</Button>
                    ) : (
                      <Button size="sm" onClick={() => ask({ title: `Reactivate ${st.name}?`, confirmLabel: 'Reactivate', requireReason: true, onConfirm: async (reason) => { await api().admin.setUserStatus(id, 'ACTIVE', reason); state.reload(); }, success: 'Account reactivated' })}>Reactivate</Button>
                    )}
                  </>
                ) : undefined
              }
            />
            <div className={s.stack}>
              <div className={s.grid2}>
                <Card title="Profile">
                  <DescriptionList
                    items={[
                      { label: 'Phone', value: st.phone },
                      { label: 'Email verified', value: st.emailVerifiedAt ? formatDateTime(st.emailVerifiedAt) : 'Not verified' },
                      { label: 'City', value: p.city },
                      { label: 'Date of birth', value: p.dateOfBirth ? formatDate(p.dateOfBirth) : null },
                      { label: 'Qualification', value: p.qualification },
                      { label: 'Institution', value: p.institution },
                      { label: 'Graduation year', value: p.graduationYear },
                      { label: 'Joined', value: formatDate(st.createdAt) },
                      { label: 'Last sign-in', value: st.lastLoginAt ? formatDateTime(st.lastLoginAt) : 'Never' },
                      { label: 'Consent', value: p.consentAt ? `${formatDate(p.consentAt)} (v${p.consentVersion})` : null },
                    ]}
                  />
                </Card>
                <Card title="Referral programme">
                  <DescriptionList
                    items={[
                      { label: 'Own referral code', value: st.referralCode ? <>{st.referralCode.code} <StatusBadge status={st.referralCode.status} /></> : 'Not generated' },
                      { label: 'Referred by', value: st.referredBy ? <>{st.referredBy.referrer.name} · <StatusBadge status={st.referredBy.stage} /></> : 'No referrer' },
                    ]}
                  />
                  {st.referralCode && can('referrals.settings') && (
                    <div className={s.actions} style={{ marginTop: 12 }}>
                      <Button
                        size="sm"
                        variant={st.referralCode.status === 'ACTIVE' ? 'danger' : 'outline'}
                        onClick={() => {
                          const next = st.referralCode.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                          ask({ title: next === 'DISABLED' ? 'Disable referral code?' : 'Re-enable referral code?', confirmLabel: next === 'DISABLED' ? 'Disable' : 'Enable', tone: next === 'DISABLED' ? 'danger' : 'primary', requireReason: true, onConfirm: async (reason) => { await api().admin.setReferralCodeStatus(st.referralCode.id, next, reason); state.reload(); }, success: 'Referral code updated' });
                        }}
                      >
                        {st.referralCode.status === 'ACTIVE' ? 'Disable code' : 'Enable code'}
                      </Button>
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Enrollments">
                {st.enrollments.length === 0 ? (
                  <EmptyState title="No enrollments" />
                ) : (
                  <div className={s.list}>
                    {st.enrollments.map((e: Row) => (
                      <div key={e.id} className={s.listItem}>
                        <div className={s.rowBetween}>
                          <div>
                            <div className={s.strong}>{e.course.title}</div>
                            <div className={s.small}>{e.batch.name} · enrolled {formatDate(e.enrolledAt)}</div>
                          </div>
                          <div className={s.row}>
                            <StatusBadge status={e.status} />
                            {manage && e.status !== 'DROPPED' && <Button size="sm" variant="ghost" onClick={() => setEnrollmentToChange(e)}>Change status</Button>}
                          </div>
                        </div>
                        <div className={s.grid3}>
                          <div>
                            <p className={s.small}>Attendance {percent(e.attendancePercent)} ({e.progress.sessionsRecorded} sessions)</p>
                            <ProgressBar value={e.attendancePercent} label={`Attendance for ${e.course.title}`} />
                          </div>
                          <p className={s.small}>Assignments {e.progress.assignmentsSubmitted}/{e.progress.assignmentsTotal} submitted · avg {percent(e.progress.assignmentAveragePercent)}</p>
                          <p className={s.small}>Assessments passed {e.progress.results.filter((r: Row) => r.passed).length}/{e.progress.results.length}</p>
                        </div>
                        {can('training.certificates.issue') && <CertificatePanel enrollment={e} onIssued={state.reload} />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Applications">
                {st.applications.length === 0 ? (
                  <EmptyState title="No applications" />
                ) : (
                  <DataTable<Row>
                    caption="Applications"
                    rows={st.applications}
                    rowKey={(a) => a.id}
                    columns={[
                      { key: 'no', header: 'Application', render: (a) => <Link className={s.link} href={`/applications/${a.id}`}>{a.applicationNumber}</Link> },
                      { key: 'c', header: 'Course / batch', render: (a) => `${a.course.title} · ${a.batch.name}` },
                      { key: 'fee', header: 'Payable', hideOnMobile: true, render: (a) => formatINR(a.payablePaise) },
                      { key: 'st', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                    ]}
                  />
                )}
              </Card>

              {(can('users.manage') || can('training.students.manage')) && <NotesPanel userId={id} />}

              {can('payments.read') && (
                <Card title="Payment history">
                  {st.payments.length === 0 ? (
                    <EmptyState title="No payments" />
                  ) : (
                    <DataTable<Row>
                      caption="Payments"
                      rows={st.payments}
                      rowKey={(x) => x.id}
                      columns={[
                        { key: 'amt', header: 'Amount', render: (x) => <Link className={s.link} href={`/payments/${x.id}`}>{formatINR(x.amountPaise)}</Link> },
                        { key: 'via', header: 'Via', render: (x) => enumLabel(x.provider) },
                        { key: 'rcpt', header: 'Receipt', hideOnMobile: true, render: (x) => x.invoice?.invoiceNumber ?? '—' },
                        { key: 'date', header: 'Date', hideOnMobile: true, render: (x) => formatDate(x.verifiedAt ?? x.createdAt) },
                        { key: 'st', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
                      ]}
                    />
                  )}
                </Card>
              )}
            </div>
            {editing && <EditStudentModal student={st} open={editing} onClose={() => setEditing(false)} onDone={state.reload} />}
            {enrollmentToChange && <EnrollmentStatusModal enrollment={enrollmentToChange} open onClose={() => setEnrollmentToChange(null)} onDone={state.reload} />}
            {dialog}
          </>
        );
      }}
    </AsyncView>
  );
}
