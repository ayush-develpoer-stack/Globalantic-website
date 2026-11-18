'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { PageHeader, StatusBadge, formatDate, useAsync } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

const TABS = [
  { href: '', label: 'Overview' },
  { href: '/students', label: 'Students' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/assignments', label: 'Assignments' },
  { href: '/assessments', label: 'Assessments' },
  { href: '/materials', label: 'Materials' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/report', label: 'Report' },
];

/** Batch header + section navigation. The batch request doubles as the assignment check. */
export default function BatchLayout({ children }: { children: React.ReactNode }) {
  const batchId = useParam('batchId');
  const pathname = usePathname() || '';
  const state = useAsync(() => api().trainer.batch(batchId), `batch:${batchId}`);
  const base = `/batches/${batchId}`;

  return (
    <Guarded state={state}>
      {(b) => (
        <div>
          <PageHeader
            eyebrow={b.course?.title}
            title={b.name}
            description={
              <span className={s.row}>
                <StatusBadge status={b.status} />
                <span>
                  {formatDate(b.startDate)} – {formatDate(b.endDate)} · {String(b.mode).toLowerCase()}
                  {b.venue ? ` · ${b.venue}` : ''}
                </span>
              </span>
            }
          />
          <nav className={s.subnav} aria-label="Batch sections">
            {TABS.map((t) => {
              const href = base + t.href;
              const active = t.href === '' ? pathname === base : pathname.startsWith(href);
              return (
                <Link key={t.label} href={href} className={[s.subnavLink, active ? s.subnavActive : ''].join(' ')} aria-current={active ? 'page' : undefined}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </div>
      )}
    </Guarded>
  );
}
