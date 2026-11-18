'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { StudentApplication } from '@globalantic/types';
import { enumLabel } from '@globalantic/types';
import { Alert, Button, Card, DescriptionList, EmptyState, ErrorState, Input, LoadingState, Textarea, formatDate, formatINR, useAsync } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import { recallRef, siteUrls } from '@/lib/config';
import s from '@/styles/site.module.css';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ApplyFlow() {
  const batchId = useSearchParams().get('batch') ?? '';
  const valid = UUID.test(batchId);
  const state = useAsync(async () => {
    if (!valid) return null;
    const [batch, user] = await Promise.all([api().catalog.batch(batchId), api().auth.me()]);
    return { batch, user };
  }, batchId);

  if (!valid) {
    return <EmptyState title="Choose a batch first" description="Open a course or the batch list and press “Apply now” on the batch you want." action={<ButtonLink href="/batches">Browse batches</ButtonLink>} />;
  }
  if (state.loading && !state.data) return <LoadingState />;
  if (state.error || !state.data) {
    return <ErrorState title={state.status === 404 ? 'Batch not found' : 'Could not load this batch'} message={state.error} onRetry={state.status === 404 ? undefined : state.reload} />;
  }

  const { batch, user } = state.data;
  const next = `/apply?batch=${batch.id}`;

  return (
    <div className={s.detailGrid}>
      <div className={s.stack}>
        {!batch.admissionOpen ? (
          <Alert tone="warning" title="Admissions closed">
            {batch.admissionBlockedReason ?? 'This batch is not accepting applications.'} <Link href="/batches" className={s.inlineLink}>See other batches</Link>
          </Alert>
        ) : !user ? (
          <Card title="Sign in to apply">
            <p>You need a verified student account to apply. It only takes a minute.</p>
            <div className={s.row} style={{ marginTop: 16 }}>
              <ButtonLink href={`/register?next=${encodeURIComponent(next)}`}>Create an account</ButtonLink>
              <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="outline">
                Sign in
              </ButtonLink>
            </div>
          </Card>
        ) : user.role !== 'STUDENT' ? (
          <Alert tone="info" title="Student accounts only">
            You are signed in as {user.email}, which is not a student account. Sign out and use a student account to apply.
          </Alert>
        ) : !user.emailVerified ? (
          <VerifyFirst email={user.email} />
        ) : (
          <ApplicationForm batchId={batch.id} />
        )}
      </div>
      <aside className={s.aside}>
        <Card title="You are applying for">
          <DescriptionList
            items={[
              { label: 'Course', value: batch.course ? <Link className={s.inlineLink} href={`/courses/${batch.course.slug}`}>{batch.course.title}</Link> : '—' },
              { label: 'Batch', value: batch.name },
              { label: 'Mode', value: enumLabel(batch.mode) },
              { label: 'Starts', value: formatDate(batch.startDate) },
              { label: 'Apply by', value: formatDate(batch.registrationDeadline) },
              { label: 'Seats left', value: String(batch.availableSeats) },
              {
                label: 'Fee payable',
                value:
                  batch.fee.payablePaise === 0
                    ? 'Free'
                    : `${formatINR(batch.fee.payablePaise)}${batch.fee.discountPaise > 0 ? ` (after ${formatINR(batch.fee.discountPaise)} discount)` : ''}`,
              },
            ]}
          />
          <p className={s.muted} style={{ marginTop: 12 }}>
            You pay only after your application is approved. The final amount is calculated by our servers.
          </p>
        </Card>
      </aside>
    </div>
  );
}

function VerifyFirst({ email }: { email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Card title="Verify your email to continue">
      <p>We sent a verification link to {email}. Open it, then come back to this page.</p>
      {msg && <Alert tone="success">{msg}</Alert>}
      {err && <Alert tone="danger">{err}</Alert>}
      <div style={{ marginTop: 16 }}>
        <Button
          variant="outline"
          loading={pending}
          onClick={async () => {
            setPending(true);
            setErr(null);
            try {
              setMsg((await api().auth.resendVerification()).message);
            } catch (e) {
              setErr(errorMessage(e));
            } finally {
              setPending(false);
            }
          }}
        >
          Resend verification email
        </Button>
      </div>
    </Card>
  );
}

function ApplicationForm({ batchId }: { batchId: string }) {
  const [form, setForm] = useState({ qualification: '', institution: '', graduationYear: '', statement: '', referralCode: recallRef() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<StudentApplication | null>(null);
  const [doc, setDoc] = useState<File | null>(null);
  // Re-use an already-uploaded document if the application call fails and the student retries.
  const [uploaded, setUploaded] = useState<{ file: File; id: string } | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'submitting'>('idle');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.qualification.trim().length < 2) local.qualification = 'Enter your highest qualification';
    const year = form.graduationYear ? Number(form.graduationYear) : undefined;
    if (year !== undefined && (!Number.isInteger(year) || year < 1970 || year > 2040)) local.graduationYear = 'Enter a year between 1970 and 2040';
    if (form.referralCode && !/^[A-Za-z0-9]{4,20}$/.test(form.referralCode.trim())) local.referralCode = 'Referral codes contain only letters and numbers';
    if (doc && doc.size > 5 * 1024 * 1024) local.document = 'The document is larger than 5 MB';
    setErrors(local);
    if (Object.keys(local).length || pending) return;
    setPending(true);
    setError(null);
    try {
      let documentFileId: string | undefined;
      if (doc) {
        if (uploaded?.file === doc) {
          documentFileId = uploaded.id;
        } else {
          setStage('uploading');
          try {
            documentFileId = (await api().files.upload(doc, 'ADMISSION_DOCUMENT')).id;
            setUploaded({ file: doc, id: documentFileId });
          } catch (uploadErr) {
            setErrors({ document: fieldErrorMap(uploadErr).file ?? errorMessage(uploadErr) });
            setError(`Your document could not be uploaded: ${errorMessage(uploadErr)} You can remove it and apply without a document.`);
            return;
          }
        }
      }
      setStage('submitting');
      const app = await api().student.apply({
        documentFileId,
        batchId,
        qualification: form.qualification.trim(),
        institution: form.institution.trim() || undefined,
        graduationYear: year,
        statement: form.statement.trim() || undefined,
        referralCode: form.referralCode.trim() || undefined,
      });
      setDone(app);
    } catch (err) {
      setError(errorMessage(err));
      const fields = fieldErrorMap(err);
      setErrors(fields.documentFileId ? { ...fields, document: fields.documentFileId } : fields);
    } finally {
      setPending(false);
      setStage('idle');
    }
  };

  if (done) {
    return (
      <Card title="Application submitted">
        <Alert tone="success" title={`Application ${done.applicationNumber} received`}>
          Our admissions team will review it and notify you by email. {done.payablePaise > 0 ? 'Once approved, you can pay the fee from the student portal.' : 'This course has no fee — your seat is confirmed on approval.'}
        </Alert>
        <div className={s.row} style={{ marginTop: 16 }}>
          <ButtonLink href="/application-status">Track my application</ButtonLink>
          <ButtonLink href={`${siteUrls.internPortal}/applications/${done.id}`} external variant="outline">
            Open student portal
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Admission application">
      <h2 style={{ fontSize: '1.2rem' }}>Your application</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Highest qualification" required value={form.qualification} onChange={set('qualification')} error={errors.qualification} maxLength={120} placeholder="e.g. B.Tech (CSE)" />
        <Input label="College / institution" value={form.institution} onChange={set('institution')} error={errors.institution} maxLength={160} />
        <Input label="Year of passing" type="number" inputMode="numeric" value={form.graduationYear} onChange={set('graduationYear')} error={errors.graduationYear} min={1970} max={2040} />
        <Input label="Referral code (optional)" value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} error={errors.referralCode} maxLength={20} hint="Only if you did not use one when registering." />
        <Textarea label="Why do you want to join? (optional)" value={form.statement} onChange={set('statement')} error={errors.statement} maxLength={2000} rows={4} containerClassName={s.full} />
        <Input
          label="Supporting document (resume / marksheet)"
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
          hint="Optional. PDF, PNG, JPEG or WEBP, up to 5 MB. Only the admissions team can see it."
          onChange={(e) => setDoc(e.target.files?.[0] ?? null)}
          error={errors.document}
          disabled={pending}
          containerClassName={s.full}
        />
      </div>
      <Button type="submit" loading={pending} disabled={pending}>
        {stage === 'uploading' ? 'Uploading document…' : stage === 'submitting' ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  );
}
