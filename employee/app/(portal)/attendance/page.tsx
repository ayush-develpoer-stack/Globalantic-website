'use client';

import { useState } from 'react';
import { api } from '@globalantic/api-client';
import { EMPLOYEE_ATTENDANCE_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, Card, DataTable, Input, PageHeader, Stat, StatGrid, StatusBadge, formatDate, useAsync } from '@globalantic/ui';
import type { AttendanceRow } from '@/lib/types';
import { istMonth, timeOf } from '@/lib/util';
import s from '@/lib/page.module.css';

export default function AttendancePage() {
  const [month, setMonth] = useState(istMonth());
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const state = useAsync(
    () => api().employee.attendance(valid ? month : undefined) as Promise<{ records: AttendanceRow[]; counts: Record<string, number> }>,
    `attendance:${valid ? month : ''}`,
  );

  return (
    <div className={s.stack}>
      <PageHeader title="Attendance" description="Your daily check-ins. Corrections are made by HR and are recorded in the audit log." />
      <div className={s.narrow}>
        <Input label="Month" type="month" value={month} max={istMonth()} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <AsyncView state={state} empty={{ title: 'No attendance recorded', description: 'No check-ins for this month.' }} isEmpty={(d) => d.records.length === 0}>
        {(d) => (
          <>
            <StatGrid>
              {EMPLOYEE_ATTENDANCE_STATUSES.map((st) => (
                <Stat key={st} label={enumLabel(st)} value={d.counts[st] ?? 0} />
              ))}
            </StatGrid>
            <Card title="History" padded={false}>
              <DataTable
                caption="Attendance history"
                rows={d.records}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'in', header: 'In', render: (r) => timeOf(r.checkInAt) },
                  { key: 'out', header: 'Out', render: (r) => timeOf(r.checkOutAt) },
                  { key: 'notes', header: 'Notes', hideOnMobile: true, render: (r) => r.notes ?? '—' },
                ]}
              />
            </Card>
          </>
        )}
      </AsyncView>
    </div>
  );
}
