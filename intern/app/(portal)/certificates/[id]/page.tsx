'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Button, ErrorState, buttonClass, formatDate, useAsync } from '@globalantic/ui';
import { TRAINING_URL } from '@/lib/config';
import p from '@/components/print.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle('Certificate');
  const state = useAsync(() => api().student.certificate(id), `certificate-${id}`);
  if (state.status === 404) return <ErrorState title="Certificate not found" message="This certificate does not exist, was revoked, or belongs to another account." />;

  return (
    <AsyncView state={state}>
      {(c) => {
        const verifyUrl = `${TRAINING_URL}/certificates/verify?code=${encodeURIComponent(c.verificationCode)}`;
        return (
          <div>
            <div className={p.toolbar}>
              <Link href="/certificates" className={buttonClass('ghost', 'sm')}>
                Back to certificates
              </Link>
              <Button size="sm" onClick={() => window.print()}>
                <Printer size={16} aria-hidden /> Print / save as PDF
              </Button>
            </div>
            <article className={p.cert} aria-label="Certificate of completion">
              <div className={p.certEyebrow}>Certificate of completion</div>
              <p>This is to certify that</p>
              <div className={p.certName}>{c.student.name}</div>
              <p>has successfully completed</p>
              <div className={p.certCourse}>{c.course.title}</div>
              <p>
                {c.batch.name} · {enumLabel(c.batch.mode)} · {formatDate(c.batch.startDate)} – {formatDate(c.batch.endDate)}
                {c.course.durationLabel ? ` · ${c.course.durationLabel}` : ''}
              </p>
              <p>Attendance: {c.attendancePercent}%</p>
              <div className={p.certFoot}>
                <div>
                  <div>
                    <strong>Globalantic</strong>
                  </div>
                  <div>Issued {formatDate(c.issuedAt)}</div>
                  <div>Certificate no. {c.certificateNumber}</div>
                </div>
                <div>
                  <div>Verification code</div>
                  <div className={p.verify}>
                    <strong>{c.verificationCode}</strong>
                  </div>
                  <div className={p.verify}>{verifyUrl}</div>
                </div>
              </div>
            </article>
          </div>
        );
      }}
    </AsyncView>
  );
}
