'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Card, PageHeader, buttonClass, formatDate, percent, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function CertificatesPage() {
  usePageTitle('Certificates');
  const state = useAsync(() => api().student.certificates(), 'certificates');
  return (
    <div className={s.stack}>
      <PageHeader title="Certificates" description="Certificates are issued by the training team once you meet every requirement of your course." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No courses yet', description: 'Certificate status appears here for each course you enroll in.' }}>
        {(rows) => (
          <div className={s.grid2}>
            {rows.map((r) => (
              <Card
                key={r.enrollmentId}
                title={r.course}
                actions={r.certificate ? <Badge tone="success">Issued</Badge> : r.revoked ? <Badge tone="danger">Revoked</Badge> : r.eligibility?.eligible ? <Badge tone="info">Eligible</Badge> : <Badge>In progress</Badge>}
              >
                <div className={s.stackSm}>
                  <span className={s.small}>
                    {r.batch.name} · {formatDate(r.batch.startDate)} – {formatDate(r.batch.endDate)}
                  </span>
                  {r.certificate ? (
                    <>
                      <span className={s.small}>
                        {r.certificate.certificateNumber} · issued {formatDate(r.certificate.issuedAt)}
                      </span>
                      <div className={s.row}>
                        <Link href={`/certificates/${r.certificate.id}`} className={buttonClass('primary', 'sm')}>
                          View &amp; download
                        </Link>
                      </div>
                    </>
                  ) : r.revoked ? (
                    <Alert tone="danger">This certificate has been revoked. Please contact support for details.</Alert>
                  ) : r.eligibility ? (
                    r.eligibility.eligible ? (
                      <Alert tone="info">You meet all requirements. Your certificate will be issued by the training team shortly.</Alert>
                    ) : (
                      <>
                        <p className={s.muted}>
                          Attendance {percent(r.eligibility.attendancePercent)} (minimum {r.eligibility.minAttendancePercent}%)
                        </p>
                        <ul className={s.list} aria-label="Requirements still to complete">
                          {r.eligibility.reasons.map((reason) => (
                            <li key={reason} className={s.body}>
                              • {reason}
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </AsyncView>
    </div>
  );
}
