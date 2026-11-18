'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, Clock, HelpCircle, Repeat } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, PageHeader, Tabs, formatDateTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import e from '@/components/exam.module.css';
import { AttemptResultBadge, ExamStateBadge, KIND_LABEL, TRACK_LABEL } from '@/components/exam-ui';
import { usePageTitle } from '@/components/usePageTitle';

type View = 'exams' | 'history';

export default function ExamsPage() {
  usePageTitle('Internship exams');
  const [view, setView] = useState<View>('exams');
  const exams = useAsync(() => api().exams.list(), 'exams');
  const history = useAsync(() => (view === 'history' ? api().exams.attempts() : Promise.resolve([])), `exam-history-${view}`);

  return (
    <div className={s.stack}>
      <PageHeader title="Internship exams" description="Marketing and sales assessments assigned to you by the Globalantic team." />
      <Tabs
        label="Exams view"
        value={view}
        onChange={setView}
        items={[
          { value: 'exams', label: 'My exams', count: exams.data?.length },
          { value: 'history', label: 'Attempt history' },
        ]}
      />
      {view === 'exams' ? (
        <AsyncView state={exams} isEmpty={(d) => d.length === 0} empty={{ title: 'No exams assigned', description: 'When the team assigns you a marketing or sales exam, it will appear here and you will get a notification.' }}>
          {(items) => (
            <ul className={s.grid2}>
              {items.map((x) => (
                <li key={x.id}>
                  <Link href={`/exams/${x.id}`} className={`${s.item} ${s.itemLink}`}>
                    <div className={s.between}>
                      <span className={s.title}>{x.title}</span>
                      <ExamStateBadge state={x.state} />
                    </div>
                    <div className={s.row}>
                      <Badge tone="primary">{TRACK_LABEL[x.track]}</Badge>
                      <Badge>{KIND_LABEL[x.kind]}</Badge>
                    </div>
                    <div className={e.meta}>
                      {x.kind !== 'INTERVIEW' && (
                        <>
                          <span>
                            <Clock size={14} aria-hidden /> {x.durationMinutes} min
                          </span>
                          <span>
                            <HelpCircle size={14} aria-hidden /> {x.questionCount} questions
                          </span>
                          <span>
                            <Repeat size={14} aria-hidden /> {x.attemptsUsed}/{x.attemptsAllowed} attempts
                          </span>
                        </>
                      )}
                      {(x.opensAt || x.closesAt) && (
                        <span>
                          <CalendarClock size={14} aria-hidden />
                          {x.opensAt && `Opens ${formatDateTime(x.opensAt)}`}
                          {x.opensAt && x.closesAt && ' · '}
                          {x.closesAt && `Closes ${formatDateTime(x.closesAt)}`}
                        </span>
                      )}
                    </div>
                    {x.attempts.length > 0 && (
                      <div className={s.row}>
                        <span className={s.small}>Latest:</span>
                        <AttemptResultBadge a={x.attempts[x.attempts.length - 1]} />
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AsyncView>
      ) : (
        <AsyncView state={history} isEmpty={(d) => d.length === 0} empty={{ title: 'No attempts yet', description: 'Your submitted exams will be listed here.' }}>
          {(rows) => (
            <ul className={s.list}>
              {rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/exams/attempts/${a.id}`} className={`${s.item} ${s.itemLink}`}>
                    <div className={s.between}>
                      <span className={s.title}>
                        {a.exam.title} · attempt {a.attemptNo}
                      </span>
                      <AttemptResultBadge a={a} />
                    </div>
                    <span className={s.small}>
                      Started {formatDateTime(a.startedAt)}
                      {a.submittedAt && ` · submitted ${formatDateTime(a.submittedAt)}`}
                      {a.autoSubmitted && ' (automatically, when time ran out)'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AsyncView>
      )}
    </div>
  );
}
