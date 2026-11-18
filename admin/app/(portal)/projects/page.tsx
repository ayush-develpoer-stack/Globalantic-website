'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { PROJECT_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, Button, DataTable, Input, PageHeader, Select, StatusBadge, Toolbar, formatDate, useAsync, useDebounced } from '@globalantic/ui';
import { ProjectFormModal } from './ProjectForm';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ProjectsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const state = useAsync(() => api().hr.projects({ search: q, status }), `${q}|${status}`);
  return (
    <>
      <PageHeader title="Projects & tasks" description="Internal projects, their members and task assignments." actions={<Button size="sm" onClick={() => setCreating(true)}>New project</Button>} />
      <Toolbar>
        <Input label="Search" placeholder="Project name" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" options={PROJECT_STATUSES.map((v) => ({ value: v, label: enumLabel(v) }))} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: q || status ? 'No projects match' : 'No projects yet', description: 'Create a project, add members, then assign tasks.' }}>
        {(rows) => (
          <DataTable<Row>
            caption="Projects"
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/projects/${r.id}`)}
            columns={[
              { key: 'name', header: 'Project', render: (r) => (<><Link className={s.link} href={`/projects/${r.id}`}>{r.name}</Link><div className={s.small}><span className={s.mono}>{r.code}</span></div></>) },
              { key: 'dates', header: 'Dates', hideOnMobile: true, render: (r) => (r.startDate ? `${formatDate(r.startDate)} – ${r.endDate ? formatDate(r.endDate) : 'ongoing'}` : '—') },
              { key: 'members', header: 'Members', render: (r) => r._count.members },
              { key: 'tasks', header: 'Tasks', render: (r) => r._count.tasks },
              { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </AsyncView>
      {creating && <ProjectFormModal onClose={() => setCreating(false)} onDone={(p) => router.push(`/projects/${p.id}`)} />}
    </>
  );
}
