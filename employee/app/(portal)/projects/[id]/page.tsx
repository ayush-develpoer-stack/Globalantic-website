'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Card, DataTable, DescriptionList, ErrorState, LoadingState, PageHeader, StatusBadge, buttonClass, formatDate, useAsync } from '@globalantic/ui';
import type { ProjectDetail } from '@/lib/types';
import { TaskStatusSelect } from '../../tasks/TaskStatusSelect';
import s from '@/lib/page.module.css';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsync(() => api().employee.project(id) as Promise<ProjectDetail>, `project:${id}`);

  if (state.status === 404) {
    return (
      <div className={s.stack}>
        <ErrorState title="Project not found" message="It may not exist, or you are not a member of it." />
        <p style={{ textAlign: 'center' }}>
          <Link href="/projects" className={buttonClass('outline', 'sm')}>
            Back to projects
          </Link>
        </p>
      </div>
    );
  }
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingState />;
  const p = state.data;

  return (
    <div className={s.stack}>
      <PageHeader eyebrow={p.code} title={p.name} description={<StatusBadge status={p.status} />} />
      <div className={s.grid2}>
        <Card title="About">
          <div className={s.stack}>
            {p.description ? <p className={s.body}>{p.description}</p> : <p className={s.muted}>No description.</p>}
            <DescriptionList
              items={[
                { label: 'Start', value: p.startDate ? formatDate(p.startDate) : '—' },
                { label: 'End', value: p.endDate ? formatDate(p.endDate) : '—' },
              ]}
            />
          </div>
        </Card>
        <Card title={`Team (${p.members.length})`}>
          <ul className={s.list}>
            {p.members.map((m) => (
              <li key={m.user.id} className={s.item}>
                <span className={s.itemTitle}>{m.user.name}</span>
                {m.role && <span className={s.small}>{m.role}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="My tasks in this project" padded={false}>
        {p.myTasks.length === 0 ? (
          <p className={s.muted} style={{ padding: 20 }}>
            No tasks assigned to you in this project.
          </p>
        ) : (
          <DataTable
            caption="My tasks in this project"
            rows={p.myTasks}
            rowKey={(t) => t.id}
            columns={[
              { key: 'title', header: 'Task', render: (t) => <span className={s.itemTitle}>{t.title}</span> },
              { key: 'priority', header: 'Priority', hideOnMobile: true, render: (t) => enumLabel(t.priority) },
              { key: 'due', header: 'Due', render: (t) => (t.dueDate ? formatDate(t.dueDate) : '—') },
              { key: 'status', header: 'Status', render: (t) => <TaskStatusSelect key={`${t.id}:${t.status}`} taskId={t.id} title={t.title} status={t.status} onChanged={state.reload} /> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
