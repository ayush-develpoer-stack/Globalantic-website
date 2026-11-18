'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { Card, DataTable, EmptyState, StatusBadge, formatDate, percent, useAsync } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface RosterRow {
  enrollmentId: string;
  status: string;
  enrolledAt: string;
  student: { id: string; name: string; email: string };
  attendancePercent: number | null;
}

export default function StudentsPage() {
  const batchId = useParam('batchId');
  const state = useAsync(() => api().trainer.roster(batchId) as Promise<RosterRow[]>, `roster:${batchId}`);

  return (
    <Card title="Student roster">
      <Guarded state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No students enrolled yet" description="Students appear here once their admission and payment are confirmed." />
          ) : (
            <DataTable
              caption="Students enrolled in this batch"
              rows={rows}
              rowKey={(r) => r.enrollmentId}
              columns={[
                {
                  key: 'name',
                  header: 'Student',
                  render: (r) => (
                    <Link className={s.link} href={`/students/${r.enrollmentId}`}>
                      {r.student.name}
                    </Link>
                  ),
                },
                { key: 'email', header: 'Email', render: (r) => r.student.email, hideOnMobile: true },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'att', header: 'Attendance', render: (r) => percent(r.attendancePercent) },
                { key: 'since', header: 'Enrolled', render: (r) => formatDate(r.enrolledAt), hideOnMobile: true },
              ]}
            />
          )
        }
      </Guarded>
    </Card>
  );
}
