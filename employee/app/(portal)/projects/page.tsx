'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, PageHeader, StatusBadge, formatDate, useAsync } from '@globalantic/ui';
import type { ProjectRow } from '@/lib/types';
import s from '@/lib/page.module.css';

export default function ProjectsPage() {
  const state = useAsync(() => api().employee.projects() as Promise<ProjectRow[]>, 'projects');
  return (
    <div className={s.stack}>
      <PageHeader title="Projects" description="Projects you are a member of." />
      <AsyncView state={state} empty={{ title: 'No projects yet', description: 'You will see projects here once you are added to one.' }} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <div className={s.cards}>
            {rows.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className={s.card}>
                <div className={s.itemHead}>
                  <span className={s.itemTitle}>{p.name}</span>
                  <StatusBadge status={p.status} />
                </div>
                <span className={s.small}>{p.code}</span>
                {p.description && <p className={s.body}>{p.description.length > 160 ? `${p.description.slice(0, 160)}…` : p.description}</p>}
                <span className={s.small}>
                  {[p._count ? `${p._count.members} members` : null, p.startDate ? `From ${formatDate(p.startDate)}` : null, p.endDate ? `to ${formatDate(p.endDate)}` : null].filter(Boolean).join(' · ')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </AsyncView>
    </div>
  );
}
