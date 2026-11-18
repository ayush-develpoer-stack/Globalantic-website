'use client';

import { api } from '@globalantic/api-client';
import { Badge, Button, Card, DataTable, EmptyState, StatusBadge, formatDateTime, percent, useAsync } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import { downloadCsv, toCsv } from '@/lib/csv';
import s from '@/lib/page.module.css';

interface ReportRow {
  student: string;
  email: string;
  status: string;
  attendancePercent: number | null;
  meetsAttendance: boolean;
  assignmentsSubmitted: number;
  assignmentsTotal: number;
  assignmentAveragePercent: number | null;
  assessmentsPassed: number;
  assessmentsTaken: number;
}

interface Report {
  batch: { id: string; name: string; course: string; minAttendancePercent: number };
  generatedAt: string;
  rows: ReportRow[];
}

export default function ReportPage() {
  const batchId = useParam('batchId');
  const state = useAsync(() => api().trainer.report(batchId) as Promise<Report>, `report:${batchId}`);

  const exportCsv = (r: Report) => {
    const csv = toCsv(
      ['Student', 'Email', 'Status', 'Attendance %', `Meets ${r.batch.minAttendancePercent}%`, 'Assignments submitted', 'Assignments total', 'Assignment average %', 'Assessments passed', 'Assessments taken'],
      r.rows.map((x) => [x.student, x.email, x.status, x.attendancePercent ?? '', x.meetsAttendance ? 'Yes' : 'No', x.assignmentsSubmitted, x.assignmentsTotal, x.assignmentAveragePercent ?? '', x.assessmentsPassed, x.assessmentsTaken]),
    );
    const safe = `${r.batch.course}-${r.batch.name}`.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 80);
    downloadCsv(`batch-report-${safe}-${r.generatedAt.slice(0, 10)}.csv`, csv);
  };

  return (
    <Guarded state={state}>
      {(r) => (
        <Card
          title="Batch learning report"
          actions={
            <Button size="sm" variant="outline" onClick={() => exportCsv(r)} disabled={!r.rows.length}>
              Export CSV
            </Button>
          }
        >
          <p className={s.small}>
            Generated {formatDateTime(r.generatedAt)}. Learning data only: no fees, payments or phone numbers. Certificate attendance threshold: {r.batch.minAttendancePercent}%.
          </p>
          {r.rows.length === 0 ? (
            <EmptyState title="No students in this batch" />
          ) : (
            <DataTable
              caption="Per-student progress"
              rows={r.rows}
              rowKey={(x) => x.email}
              columns={[
                { key: 'student', header: 'Student', render: (x) => x.student },
                { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} />, hideOnMobile: true },
                {
                  key: 'att',
                  header: 'Attendance',
                  render: (x) => (
                    <span className={s.row}>
                      {percent(x.attendancePercent)}
                      {!x.meetsAttendance && <Badge tone="warning">Below</Badge>}
                    </span>
                  ),
                },
                { key: 'asg', header: 'Assignments', render: (x) => `${x.assignmentsSubmitted}/${x.assignmentsTotal}` },
                { key: 'avg', header: 'Avg %', render: (x) => percent(x.assignmentAveragePercent), hideOnMobile: true },
                { key: 'pass', header: 'Assessments passed', render: (x) => `${x.assessmentsPassed}/${x.assessmentsTaken}` },
              ]}
            />
          )}
        </Card>
      )}
    </Guarded>
  );
}
