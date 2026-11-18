'use client';

import { Star } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { AsyncView, PageHeader, formatDate, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function FeedbackPage() {
  usePageTitle('Feedback');
  const state = useAsync(() => api().student.feedback(), 'feedback');
  return (
    <div className={s.stack}>
      <PageHeader title="Trainer feedback" description="Personal feedback from your trainers." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No feedback yet', description: 'Feedback from your trainers will appear here.' }}>
        {(items) => (
          <ul className={s.list}>
            {items.map((f) => (
              <li key={String(f.id)} className={s.item}>
                <div className={s.between}>
                  <span className={s.title}>{f.trainer?.name ?? 'Trainer'}</span>
                  {typeof f.rating === 'number' && (
                    <span className={s.row} aria-label={`Rating ${f.rating} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={16} aria-hidden fill={i < f.rating ? 'currentColor' : 'none'} />
                      ))}
                    </span>
                  )}
                </div>
                <p className={s.body}>{f.content}</p>
                <span className={s.small}>
                  {f.batch?.name} · {formatDate(f.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
