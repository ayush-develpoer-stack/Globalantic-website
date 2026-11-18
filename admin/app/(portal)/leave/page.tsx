'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { LEAVE_STATUSES, enumLabel, type LeaveStatus } from '@globalantic/types';
import { AsyncView, Button, DataTable, PageHeader, Pagination, StatusBadge, Tabs, formatDate, useAsync, useSession } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function LeavePage() {
  const { user } = useSession();
  const { ask, dialog } = useConfirm();
  const [status, setStatus] = useState<LeaveStatus>('PENDING');
  const [page, setPage] = useState(1);
  const state = useAsync(() => api().hr.leaves({ status, page, pageSize: 20 }), `${status}|${page}`);

  return (
    <>
      <PageHeader title="Leave requests" description="Approve or reject employee leave. Decisions notify the employee and are audited." />
      <Tabs<LeaveStatus> label="Leave status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={LEAVE_STATUSES.map((v) => ({ value: v, label: enumLabel(v) }))} />
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: `No ${enumLabel(status).toLowerCase()} leave requests` }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Leave requests"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'emp',
                  header: 'Employee',
                  render: (r) => (
                    <>
                      <Link className={s.link} href={`/employees/${r.employee.id}`}>{r.employee.name}</Link>
                      <div className={s.small}>{r.employee.employeeProfile?.employeeCode} · {r.employee.employeeProfile?.department}</div>
                    </>
                  ),
                },
                { key: 'type', header: 'Type', render: (r) => enumLabel(r.type) },
                { key: 'dates', header: 'Dates', render: (r) => (<>{formatDate(r.startDate)} – {formatDate(r.endDate)}<div className={s.small}>{r.days} day{r.days === 1 ? '' : 's'}</div></>) },
                { key: 'reason', header: 'Reason', hideOnMobile: true, render: (r) => r.reason },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.reviewNote && <div className={s.small}>{r.reviewNote}</div>}</>) },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) =>
                    r.status === 'PENDING' && r.employee.id !== user.id ? (
                      <div className={s.actions}>
                        <Button size="sm" onClick={() => ask({ title: `Approve leave for ${r.employee.name}?`, message: `${r.days} day(s) of ${enumLabel(r.type).toLowerCase()} leave.`, confirmLabel: 'Approve', onConfirm: async () => { await api().hr.reviewLeave(r.id, 'APPROVE'); state.reload(); }, success: 'Leave approved' })}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => ask({ title: `Reject leave for ${r.employee.name}?`, tone: 'danger', confirmLabel: 'Reject', requireReason: true, reasonLabel: 'Note to the employee', onConfirm: async (note) => { await api().hr.reviewLeave(r.id, 'REJECT', note); state.reload(); }, success: 'Leave rejected' })}>Reject</Button>
                      </div>
                    ) : r.status === 'PENDING' ? (
                      <span className={s.small}>Your own request</span>
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
