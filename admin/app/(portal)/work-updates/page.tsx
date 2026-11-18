'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, DataTable, PageHeader, Pagination, Select, Toolbar, formatDate, useAsync } from '@globalantic/ui';
import { useEmployeeOptions } from '@/lib/hr';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function duration(minutes: number | null) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export default function WorkUpdatesPage() {
  const employees = useEmployeeOptions();
  const projects = useAsync(() => api().hr.projects(), 'work-update-projects');
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => api().hr.workUpdates({ employeeId, projectId, page, pageSize: 25 }), `${employeeId}|${projectId}|${page}`);
  return (
    <>
      <PageHeader title="Work updates" description="Daily updates logged by employees in their portal." />
      <Toolbar>
        <Select label="Employee" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }} placeholder="All employees" options={employees.options} />
        <Select label="Project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }} placeholder="All projects" options={(projects.data ?? []).map((p: Row) => ({ value: p.id, label: p.name }))} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No work updates found' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Work updates"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'emp', header: 'Employee', render: (r) => <Link className={s.link} href={`/employees/${r.employee.id}`}>{r.employee.name}</Link> },
                { key: 'sum', header: 'Update', render: (r) => (<><div style={{ whiteSpace: 'pre-wrap' }}>{r.summary}</div><div className={s.small}>{[r.project?.name, r.task?.title].filter(Boolean).join(' · ')}</div></>) },
                { key: 'time', header: 'Time', hideOnMobile: true, render: (r) => duration(r.minutes) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}
