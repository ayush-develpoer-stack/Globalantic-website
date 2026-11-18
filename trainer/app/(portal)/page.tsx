'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { DAY_NAMES } from '@globalantic/types';
import { AsyncView, Card, EmptyState, PageHeader, Stat, StatGrid, StatusBadge, formatDate, formatTime, useAsync, useSession } from '@globalantic/ui';
import s from '@/lib/page.module.css';

interface DashBatch {
  id: string;
  name: string;
  status: string;
  role: string;
  course: { id: string; title: string };
  startDate: string;
  endDate: string;
  mode: string;
  activeStudents: number;
}

interface TodayClass {
  id: string;
  batchId: string;
  batchName: string;
  course: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  location: string | null;
}

interface Dashboard {
  batches: DashBatch[];
  todaysClasses: TodayClass[];
  submissionsToGrade: number;
  openAssignments: number;
}

export default function DashboardPage() {
  const { user } = useSession();
  const state = useAsync(() => api().trainer.dashboard() as Promise<Dashboard>, 'dashboard');

  return (
    <div className={s.stack}>
      <PageHeader eyebrow="Trainer portal" title={`Welcome, ${user.name.split(' ')[0]}`} description="Your assigned courses and batches, today's classes and work waiting for you." />
      <AsyncView state={state}>
        {(d) => {
          const byCourse = new Map<string, { title: string; batches: DashBatch[] }>();
          for (const b of d.batches) {
            const g = byCourse.get(b.course.id) ?? { title: b.course.title, batches: [] };
            g.batches.push(b);
            byCourse.set(b.course.id, g);
          }
          return (
            <>
              <StatGrid>
                <Stat label="Assigned courses" value={byCourse.size} />
                <Stat label="Assigned batches" value={d.batches.length} />
                <Stat label="Submissions to grade" value={d.submissionsToGrade} tone={d.submissionsToGrade ? 'warning' : undefined} />
                <Stat label="Open assignments" value={d.openAssignments} />
              </StatGrid>

              <Card title={`Today's classes (${DAY_NAMES[new Date().getDay()]})`}>
                {d.todaysClasses.length === 0 ? (
                  <p className={s.muted}>No classes scheduled for today.</p>
                ) : (
                  <ul className={s.list}>
                    {d.todaysClasses.map((c) => (
                      <li key={c.id} className={s.item}>
                        <div className={s.itemHead}>
                          <Link href={`/batches/${c.batchId}`} className={s.itemTitle}>
                            {c.course} — {c.batchName}
                          </Link>
                          <span className={s.muted}>
                            {formatTime(c.startTime)} – {formatTime(c.endTime)}
                          </span>
                        </div>
                        {(c.topic || c.location) && <p className={s.small}>{[c.topic, c.location].filter(Boolean).join(' · ')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Assigned courses and batches">
                {d.batches.length === 0 ? (
                  <EmptyState title="No batches assigned yet" description="When the training team assigns you to a batch it will appear here." />
                ) : (
                  <div className={s.stack}>
                    {[...byCourse.values()].map((g) => (
                      <section key={g.title} className={s.courseGroup} aria-label={g.title}>
                        <h3 className={s.courseTitle}>{g.title}</h3>
                        <div className={s.cards}>
                          {g.batches.map((b) => (
                            <Link key={b.id} href={`/batches/${b.id}`} className={s.batchCard}>
                              <div className={s.spread}>
                                <strong>{b.name}</strong>
                                <StatusBadge status={b.status} />
                              </div>
                              <span className={s.small}>
                                {formatDate(b.startDate)} – {formatDate(b.endDate)} · {b.mode.toLowerCase()}
                              </span>
                              <span className={s.small}>
                                {b.activeStudents} active student{b.activeStudents === 1 ? '' : 's'} · {b.role === 'LEAD' ? 'Lead trainer' : 'Assistant trainer'}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </Card>
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}
