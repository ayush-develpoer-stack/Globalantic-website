'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, PageHeader, StatusBadge, buttonClass, formatDate, formatINR, useAsync, useToast } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

type Row = Record<string, any>;

/** Certificate program: the student's registrations, or the published programs to register for. */
export default function ProgramListPage() {
  usePageTitle('Certificate program');
  const router = useRouter();
  const toast = useToast();
  const mine = useAsync(() => api().programStudent.enrollments(), 'program-enrollments');
  const catalogue = useAsync(() => api().programs.list(), 'program-catalogue');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const register = async (slug: string) => {
    setBusy(slug);
    setError(null);
    try {
      const e = await api().programStudent.register(slug);
      toast('Registered. Complete the payment to unlock the program.', 'success');
      router.push(`/program/${e.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const registered = new Set((mine.data ?? []).map((e: Row) => e.program.id));

  return (
    <div className={s.stack}>
      <PageHeader
        title="Certificate program"
        description="A self-paced program: complete every required lesson and pass the final assessment to receive a certificate with a public verification code."
      />
      <Card title="My registrations">
        <AsyncView state={mine} isEmpty={(d) => d.length === 0} empty={{ title: 'Not registered yet', description: 'Choose a program below to register.' }}>
          {(rows) => (
            <div className={s.list}>
              {rows.map((e: Row) => (
                <Link key={e.id} href={`/program/${e.id}`} className={`${s.item} ${s.itemLink}`}>
                  <div className={s.between}>
                    <span className={s.title}>{e.program.title}</span>
                    <span className={s.row}>
                      {e.certificate?.status === 'ISSUED' && <Badge tone="success">Certificate issued</Badge>}
                      <StatusBadge status={e.status} />
                    </span>
                  </div>
                  <span className={s.small}>
                    {e.enrollmentNumber} · registered {formatDate(e.registeredAt)} · fee {formatINR(e.feePaise)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </AsyncView>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card title="Available programs">
        <AsyncView state={catalogue} isEmpty={(d) => d.length === 0} empty={{ title: 'No program is open for registration right now' }}>
          {(rows) => (
            <div className={s.list}>
              {rows.map((p: Row) => (
                <div key={p.id} className={s.item}>
                  <div className={s.between}>
                    <span className={s.title}>{p.title}</span>
                    <span className={s.strong}>{formatINR(p.feePaise)}</span>
                  </div>
                  <p className={s.body}>{p.summary}</p>
                  <ul className={s.muted} style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
                    <li>{p.lessons.filter((l: Row) => l.required).length} required lesson(s) to complete</li>
                    <li>
                      Final assessment: pass with at least {p.passPercent}% · {p.maxAttempts} attempt(s) · {p.timeLimitMinutes} minutes
                    </li>
                    <li>Paying the fee unlocks the lessons; the certificate is issued only after you complete the requirements.</li>
                  </ul>
                  <p className={s.small}>The certificate confirms completion of a Globalantic program. It is not an academic degree or a government or university accreditation.</p>
                  <div className={s.actions}>
                    {registered.has(p.id) ? (
                      <span className={s.small}>You are registered.</span>
                    ) : (
                      <Button onClick={() => register(p.slug)} loading={busy === p.slug} disabled={busy !== null}>
                        Register
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsyncView>
      </Card>
      <p className={s.small}>
        Questions? <Link href="/support" className={s.link}>Contact support</Link>. You can also open <Link href="/payments" className={buttonClass('ghost', 'sm')}>payments &amp; receipts</Link>.
      </p>
    </div>
  );
}
