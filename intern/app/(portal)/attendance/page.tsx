'use client';

import { useState } from 'react';
import { api } from '@globalantic/api-client';
import {
  AsyncView,
  Card,
  DataTable,
  PageHeader,
  ProgressBar,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  formatDate,
  percent,
  useAsync,
} from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

function EnrollmentAttendance({ enrollmentId }: { enrollmentId: string }) {
  const state = useAsync(() => api().student.attendance(enrollmentId), `att-${enrollmentId}`);
  return (
    <AsyncView state={state}>
      {(a) => (
        <div className={s.stack}>
          <Card title="Summary">
            <StatGrid>
              <Stat label="Attendance" value={percent(a.percent)} tone="primary" />
              <Stat label="Present" value={a.counts.PRESENT ?? 0} />
              <Stat label="Late" value={a.counts.LATE ?? 0} />
              <Stat label="Absent" value={a.counts.ABSENT ?? 0} />
              <Stat label="Excused" value={a.counts.EXCUSED ?? 0} />
            </StatGrid>
            <div style={{ marginTop: 16 }}>
              <ProgressBar value={a.percent} label="Attendance percentage" />
              <p className={s.small} style={{ marginTop: 6 }}>
                Present and late count as attended. Excused sessions are not counted.
              </p>
            </div>
          </Card>
          <Card title="History">
            {a.records.length === 0 ? (
              <p className={s.muted}>No sessions have been recorded yet.</p>
            ) : (
              <DataTable
                caption="Attendance history"
                rows={a.records}
                rowKey={(r) => r.sessionDate}
                columns={[
                  { key: 'd', header: 'Date', render: (r) => formatDate(r.sessionDate) },
                  { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'r', header: 'Remarks', render: (r) => r.remarks ?? '—' },
                ]}
              />
            )}
          </Card>
        </div>
      )}
    </AsyncView>
  );
}

export default function AttendancePage() {
  usePageTitle('Attendance');
  const enrollments = useAsync(() => api().student.enrollments(), 'enrollments');
  const [selected, setSelected] = useState('');
  return (
    <div className={s.stack}>
      <PageHeader title="Attendance" description="Your attendance summary and session history." />
      <AsyncView state={enrollments} isEmpty={(d) => d.length === 0} empty={{ title: 'No courses yet', description: 'Attendance appears once you are enrolled.' }}>
        {(rows) => {
          const current = selected || rows[0].id;
          return (
            <div className={s.stack}>
              {rows.length > 1 && (
                <div style={{ maxWidth: 420 }}>
                  <Select
                    label="Course"
                    value={current}
                    onChange={(e) => setSelected(e.target.value)}
                    options={rows.map((r) => ({ value: r.id, label: `${r.course.title} — ${r.batch.name}` }))}
                  />
                </div>
              )}
              <EnrollmentAttendance key={current} enrollmentId={current} />
            </div>
          );
        }}
      </AsyncView>
    </div>
  );
}
