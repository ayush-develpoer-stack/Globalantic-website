'use client';

import { api } from '@globalantic/api-client';
import { AsyncView, PageHeader, formatDateTime, useAsync } from '@globalantic/ui';
import type { AnnouncementRow } from '@/lib/types';
import s from '@/lib/page.module.css';

export default function AnnouncementsPage() {
  const state = useAsync(() => api().employee.announcements() as Promise<AnnouncementRow[]>, 'announcements');
  return (
    <div className={s.stack}>
      <PageHeader title="Announcements" description="Company-wide updates from HR and management." />
      <AsyncView state={state} empty={{ title: 'No announcements yet' }} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <ul className={s.list}>
            {rows.map((a) => (
              <li key={a.id} className={s.item}>
                <div className={s.itemHead}>
                  <h2 className={s.itemTitle} style={{ fontSize: '1rem' }}>
                    {a.title}
                  </h2>
                  <span className={s.small}>{formatDateTime(a.createdAt)}</span>
                </div>
                <p className={s.body}>{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
