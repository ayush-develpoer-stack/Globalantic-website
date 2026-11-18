'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@globalantic/api-client';
import type { StudentAssignment } from '@globalantic/types';
import { AsyncView, Badge, PageHeader, StatusBadge, Tabs, formatDateTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

type Filter = 'todo' | 'submitted' | 'all';

const isTodo = (a: StudentAssignment) => !a.submission && a.status === 'PUBLISHED';

export default function AssignmentsPage() {
  usePageTitle('Assignments');
  const state = useAsync(() => api().student.assignments(), 'assignments');
  const [filter, setFilter] = useState<Filter>('todo');
  return (
    <div className={s.stack}>
      <PageHeader title="Assignments" description="Submit your work and see marks and feedback from your trainers." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No assignments yet', description: 'Assignments from your trainers appear here.' }}>
        {(items) => {
          const todo = items.filter(isTodo);
          const submitted = items.filter((a) => a.submission);
          const shown = filter === 'todo' ? todo : filter === 'submitted' ? submitted : items;
          return (
            <div className={s.stack}>
              <Tabs
                label="Filter assignments"
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'todo', label: 'To do', count: todo.length },
                  { value: 'submitted', label: 'Submitted', count: submitted.length },
                  { value: 'all', label: 'All', count: items.length },
                ]}
              />
              {shown.length === 0 ? (
                <p className={s.muted}>Nothing here.</p>
              ) : (
                <ul className={s.list}>
                  {shown.map((a) => {
                    const overdue = !a.submission && new Date(a.dueAt).getTime() < Date.now();
                    return (
                      <li key={a.id}>
                        <Link href={`/assignments/${a.id}`} className={`${s.item} ${s.itemLink}`}>
                          <div className={s.between}>
                            <span className={s.title}>{a.title}</span>
                            {a.submission ? (
                              <StatusBadge status={a.submission.status} />
                            ) : a.status === 'CLOSED' ? (
                              <StatusBadge status="CLOSED" />
                            ) : overdue ? (
                              <Badge tone="danger">Overdue</Badge>
                            ) : (
                              <Badge tone="warning">Not submitted</Badge>
                            )}
                          </div>
                          <span className={s.small}>
                            {a.batch.course.title} · {a.batch.name}
                          </span>
                          <span className={s.small}>
                            Due {formatDateTime(a.dueAt)} · {a.maxMarks} marks
                            {a.submission?.marks !== null && a.submission?.marks !== undefined ? ` · Scored ${a.submission.marks}/${a.maxMarks}` : ''}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        }}
      </AsyncView>
    </div>
  );
}
