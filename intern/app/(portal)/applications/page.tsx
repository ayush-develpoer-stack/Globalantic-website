'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, PageHeader, StatusBadge, buttonClass, formatDate, formatINR, useAsync } from '@globalantic/ui';
import { infoRequestOpen } from '@/components/InfoRequest';
import { TRAINING_URL } from '@/lib/config';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function ApplicationsPage() {
  usePageTitle('Applications');
  const state = useAsync(() => api().student.applications(), 'applications');
  return (
    <div className={s.stack}>
      <PageHeader
        title="My applications"
        description="Track your admission applications, payments and enrollment."
        actions={
          <a href={`${TRAINING_URL}/courses`} className={buttonClass('primary', 'sm')}>
            Browse courses
          </a>
        }
      />
      <AsyncView
        state={state}
        isEmpty={(d) => d.length === 0}
        empty={{
          title: 'No applications yet',
          description: 'Choose a course and batch on the training website to apply.',
          action: (
            <a href={`${TRAINING_URL}/courses`} className={buttonClass('outline', 'sm')}>
              Explore courses
            </a>
          ),
        }}
      >
        {(apps) => (
          <ul className={s.list}>
            {apps.map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className={`${s.item} ${s.itemLink}`}>
                  <div className={s.between}>
                    <span className={s.title}>
                      {a.course.title} — {a.batch.name}
                    </span>
                    <span className={s.row}>
                      {infoRequestOpen(a) && <Badge tone="warning">Information needed</Badge>}
                      <StatusBadge status={a.status} />
                    </span>
                  </div>
                  <span className={s.small}>
                    {a.applicationNumber} · Applied {formatDate(a.createdAt)} · Fee {formatINR(a.payablePaise)}
                  </span>
                  {a.status === 'APPROVED' && a.payablePaise > 0 && <span className={s.link}>Payment due — open to pay</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
