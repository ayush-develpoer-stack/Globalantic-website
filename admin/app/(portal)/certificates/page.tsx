'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Button, DataTable, PageHeader, Pagination, StatusBadge, formatDate, useAsync } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function CertificatesPage() {
  const [page, setPage] = useState(1);
  const { ask, dialog } = useConfirm();
  const state = useAsync(() => api().admin.certificates({ page, pageSize: 20 }), `certs-${page}`);
  return (
    <>
      <PageHeader title="Certificates" description="Issued certificates. Issue new ones from a student's enrollment once they are eligible." />
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No certificates issued yet', description: 'Open a student and check certificate eligibility on their enrollment.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Certificates"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'no', header: 'Certificate', render: (r) => (<><div className={s.strong}>{r.certificateNumber}</div><div className={s.mono}>{r.verificationCode}</div></>) },
                { key: 'student', header: 'Student', render: (r) => (<><Link className={s.link} href={`/students/${r.student.id}`}>{r.student.name}</Link><div className={s.small}>{r.student.email}</div></>) },
                { key: 'course', header: 'Course', hideOnMobile: true, render: (r) => (<><div>{r.course.title}</div><div className={s.small}>{r.batch.name}</div></>) },
                { key: 'att', header: 'Attendance', hideOnMobile: true, render: (r) => `${r.attendancePercent}%` },
                { key: 'issued', header: 'Issued', hideOnMobile: true, render: (r) => formatDate(r.issuedAt) },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.revokeReason && <div className={s.small}>{r.revokeReason}</div>}</>) },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) =>
                    r.status === 'ISSUED' ? (
                      <Button size="sm" variant="ghost" onClick={() => ask({ title: `Revoke ${r.certificateNumber}?`, message: 'Public verification will show this certificate as revoked. This cannot be undone here.', confirmLabel: 'Revoke', tone: 'danger', requireReason: true, onConfirm: async (reason) => { await api().admin.revokeCertificate(r.id, reason); state.reload(); }, success: 'Certificate revoked' })}>
                        Revoke
                      </Button>
                    ) : null,
                },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {dialog}
    </>
  );
}
