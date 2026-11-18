'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { TASK_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, Badge, Card, DataTable, PageHeader, Tabs, formatDate, useAsync } from '@globalantic/ui';
import type { TaskRow } from '@/lib/types';
import { TaskStatusSelect } from './TaskStatusSelect';
import s from '@/lib/page.module.css';

type Filter = 'ALL' | (typeof TASK_STATUSES)[number];

const PRIORITY_TONE = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral' } as const;

export default function TasksPage() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const state = useAsync(() => api().employee.tasks(filter === 'ALL' ? undefined : filter) as Promise<TaskRow[]>, `tasks:${filter}`);

  return (
    <div className={s.stack}>
      <PageHeader title="My tasks" description="Tasks assigned to you. You can update the status; other changes are made by your project lead or HR." />
      <Tabs label="Filter tasks by status" value={filter} onChange={setFilter} items={[{ value: 'ALL', label: 'All' }, ...TASK_STATUSES.map((st) => ({ value: st, label: enumLabel(st) }))]} />
      <Card padded={false}>
        <AsyncView state={state} empty={{ title: 'No tasks here', description: filter === 'ALL' ? 'Nothing has been assigned to you yet.' : 'No tasks with this status.' }} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <DataTable
              caption="My tasks"
              rows={rows}
              rowKey={(t) => t.id}
              columns={[
                {
                  key: 'title',
                  header: 'Task',
                  render: (t) => (
                    <div>
                      <div className={s.itemTitle}>{t.title}</div>
                      {t.description && <p className={s.small}>{t.description.length > 140 ? `${t.description.slice(0, 140)}…` : t.description}</p>}
                    </div>
                  ),
                },
                {
                  key: 'project',
                  header: 'Project',
                  hideOnMobile: true,
                  render: (t) => (t.project ? <Link href={`/projects/${t.project.id}`} className={s.link}>{t.project.name}</Link> : '—'),
                },
                { key: 'priority', header: 'Priority', hideOnMobile: true, render: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{enumLabel(t.priority)}</Badge> },
                { key: 'due', header: 'Due', render: (t) => (t.dueDate ? formatDate(t.dueDate) : '—') },
                { key: 'status', header: 'Status', render: (t) => <TaskStatusSelect key={`${t.id}:${t.status}`} taskId={t.id} title={t.title} status={t.status} onChanged={state.reload} /> },
              ]}
            />
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
