'use client';

import { api } from '@globalantic/api-client';
import { AsyncView, Badge, PageHeader, formatDateTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function AnnouncementsPage() {
  usePageTitle('Announcements');
  const state = useAsync(() => api().student.announcements(), 'announcements');
  return (
    <div className={s.stack}>
      <PageHeader title="Announcements" description="Updates from your trainers and the training team." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No announcements', description: 'Announcements for your batches appear here.' }}>
        {(items) => (
          <ul className={s.list}>
            {items.map((a) => (
              <li key={a.id} className={s.item}>
                <div className={s.between}>
                  <h2 className={s.title}>{a.title}</h2>
                  {a.batch ? <Badge tone="primary">{a.batch.name}</Badge> : <Badge>All students</Badge>}
                </div>
                <p className={s.body}>{a.body}</p>
                <span className={s.small}>{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
