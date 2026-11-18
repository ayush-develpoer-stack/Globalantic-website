'use client';

import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Button, Card, DataTable, EmptyState, PageHeader, formatDateTime, formatINR, percent, useAsync } from '@globalantic/ui';
import { downloadCsv } from '@/lib/admin';
import { TypedReport } from './TypedReport';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

/** One report table with an empty state and a CSV export (formula-injection safe via downloadCsv). */
function ReportTable({ title, file, rows, columns, rowKey }: { title: string; file: string; rows: Row[]; columns: { key: string; header: string; render?: (r: Row) => React.ReactNode }[]; rowKey?: (r: Row) => string }) {
  return (
    <Card
      title={title}
      actions={
        <Button size="sm" variant="ghost" disabled={!rows.length} onClick={() => downloadCsv(`${file}.csv`, rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, r[c.key]]))))}>
          Export CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No data yet" />
      ) : (
        <DataTable<Row> caption={title} rows={rows} rowKey={rowKey ?? ((r) => String(r[columns[0].key]))} columns={columns.map((c) => ({ key: c.key, header: c.header, render: c.render ?? ((r: Row) => r[c.key]) }))} />
      )}
    </Card>
  );
}

const statusRows = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).map(([status, count]) => ({ status: enumLabel(status), count }));

export default function ReportsPage() {
  const state = useAsync(() => api().platform.reportSummary(), 'report-summary');
  return (
    <>
      <PageHeader title="Reports" description="Detailed reports with date filters, plus an aggregated summary across training, finance, leads and HR." actions={<Button size="sm" variant="outline" onClick={state.reload} loading={state.loading}>Refresh summary</Button>} />
      <TypedReport />
      <div className={s.spacer} />
      <h2 className={s.strong}>Summary</h2>
      <div className={s.spacer} />
      <AsyncView state={state}>
        {(d) => {
          const rewards = Object.entries(d.referralRewards ?? {}).map(([status, v]) => ({ status: enumLabel(status), count: (v as Row).count, amountPaise: (v as Row).amountPaise }));
          const leads = (['contact', 'training', 'careers'] as const).flatMap((kind) => Object.entries(d.leads?.[kind] ?? {}).map(([status, count]) => ({ key: `${kind}-${status}`, source: enumLabel(kind), status: enumLabel(status), count })));
          const departments = Object.entries(d.employeesByDepartment ?? {}).map(([department, count]) => ({ department, count }));
          return (
            <div className={s.stack}>
              <p className={s.small}>Generated {formatDateTime(d.generatedAt)}</p>
              <div className={s.grid2}>
                <ReportTable
                  title="Revenue by month (verified payments)"
                  file="revenue-by-month"
                  rows={d.revenueByMonth}
                  columns={[
                    { key: 'month', header: 'Month' },
                    { key: 'payments', header: 'Payments' },
                    { key: 'amountPaise', header: 'Amount (paise)', render: (r) => formatINR(r.amountPaise) },
                  ]}
                />
                <ReportTable title="Admissions by status" file="admissions-by-status" rows={statusRows(d.admissions)} columns={[{ key: 'status', header: 'Status' }, { key: 'count', header: 'Applications' }]} />
                <ReportTable
                  title="Enrollments by course"
                  file="enrollments-by-course"
                  rows={d.enrollmentsByCourse}
                  columns={[
                    { key: 'course', header: 'Course' },
                    { key: 'active', header: 'Active' },
                    { key: 'completed', header: 'Completed' },
                  ]}
                />
                <ReportTable title="Attendance by running batch" file="attendance-by-batch" rows={d.attendanceByBatch} columns={[{ key: 'batch', header: 'Batch' }, { key: 'percent', header: 'Attendance %', render: (r) => percent(r.percent) }]} />
                <ReportTable
                  title="Referral rewards"
                  file="referral-rewards"
                  rows={rewards}
                  columns={[
                    { key: 'status', header: 'Status' },
                    { key: 'count', header: 'Rewards' },
                    { key: 'amountPaise', header: 'Amount (paise)', render: (r) => formatINR(r.amountPaise) },
                  ]}
                />
                <ReportTable title="Leads" file="leads" rows={leads} rowKey={(r) => r.key} columns={[{ key: 'source', header: 'Source' }, { key: 'status', header: 'Status' }, { key: 'count', header: 'Count' }]} />
                <ReportTable title="Employees by department" file="employees-by-department" rows={departments} columns={[{ key: 'department', header: 'Department' }, { key: 'count', header: 'Employees' }]} />
                <ReportTable title="Leave requests" file="leave-requests" rows={statusRows(d.leaveRequests)} columns={[{ key: 'status', header: 'Status' }, { key: 'count', header: 'Requests' }]} />
              </div>
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
