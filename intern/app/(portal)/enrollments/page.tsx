'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, PageHeader, StatusBadge, buttonClass, formatDate, useAsync } from '@globalantic/ui';
import { TRAINING_URL } from '@/lib/config';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function EnrollmentsPage() {
  usePageTitle('My courses');
  const state = useAsync(() => api().student.enrollments(), 'enrollments');
  return (
    <div className={s.stack}>
      <PageHeader title="My courses" description="Courses you are enrolled in." />
      <AsyncView
        state={state}
        isEmpty={(d) => d.length === 0}
        empty={{
          title: 'No enrollments yet',
          description: 'Your course appears here once your admission is confirmed.',
          action: (
            <a href={`${TRAINING_URL}/courses`} className={buttonClass('outline', 'sm')}>
              Browse courses
            </a>
          ),
        }}
      >
        {(rows) => (
          <ul className={s.grid3}>
            {rows.map((e) => (
              <li key={e.id}>
                <Link href={`/enrollments/${e.id}`} className={`${s.item} ${s.itemLink}`}>
                  <div className={s.between}>
                    <span className={s.title}>{e.course.title}</span>
                    <StatusBadge status={e.status} />
                  </div>
                  <span className={s.small}>{e.batch.name}</span>
                  <span className={s.small}>
                    {formatDate(e.batch.startDate)} – {formatDate(e.batch.endDate)} · {enumLabel(e.batch.mode)}
                    {e.course.durationLabel ? ` · ${e.course.durationLabel}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
