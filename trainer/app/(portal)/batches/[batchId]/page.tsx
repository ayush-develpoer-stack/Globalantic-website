'use client';

import { api } from '@globalantic/api-client';
import { DAY_NAMES } from '@globalantic/types';
import { Badge, Card, DescriptionList, Stat, StatGrid, formatDate, formatTime, useAsync } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface Module {
  id: string;
  title: string;
  description: string | null;
  topics: string[];
  durationHours: number | null;
}

export default function BatchOverviewPage() {
  const batchId = useParam('batchId');
  const state = useAsync(() => api().trainer.batch(batchId), `batch:${batchId}`);

  return (
    <Guarded state={state}>
      {(b) => (
        <div className={s.stack}>
          <StatGrid>
            <Stat label="Enrollments" value={b._count?.enrollments ?? 0} />
            <Stat label="Assignments" value={b._count?.assignments ?? 0} />
            <Stat label="Assessments" value={b._count?.assessments ?? 0} />
            <Stat label="Materials" value={b._count?.materials ?? 0} />
          </StatGrid>
          <div className={s.grid2}>
            <Card title="Batch details">
              <DescriptionList
                items={[
                  { label: 'Course', value: b.course?.title },
                  { label: 'Duration', value: b.course?.durationLabel },
                  { label: 'Dates', value: `${formatDate(b.startDate)} – ${formatDate(b.endDate)}` },
                  { label: 'Mode', value: String(b.mode).toLowerCase() },
                  { label: 'Venue', value: b.venue || '—' },
                  { label: 'Capacity', value: b.capacity },
                  { label: 'Min. attendance for certificate', value: `${b.course?.minAttendancePercent ?? 75}%` },
                ]}
              />
            </Card>
            <Card title="Trainers">
              <ul className={s.list}>
                {(b.trainers ?? []).map((t: { role: string; trainer: { id: string; name: string } }) => (
                  <li key={t.trainer.id} className={s.spread}>
                    <span>{t.trainer.name}</span>
                    <Badge tone={t.role === 'LEAD' ? 'primary' : 'neutral'}>{t.role === 'LEAD' ? 'Lead' : 'Assistant'}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title="Weekly schedule">
            {(b.schedules ?? []).length === 0 ? (
              <p className={s.muted}>No class schedule has been set for this batch yet.</p>
            ) : (
              <ul className={s.list}>
                {b.schedules.map((sc: { id: string; dayOfWeek: number; startTime: string; endTime: string; topic: string | null; location: string | null }) => (
                  <li key={sc.id} className={s.item}>
                    <div className={s.itemHead}>
                      <span className={s.itemTitle}>{DAY_NAMES[sc.dayOfWeek]}</span>
                      <span className={s.muted}>
                        {formatTime(sc.startTime)} – {formatTime(sc.endTime)}
                      </span>
                    </div>
                    {(sc.topic || sc.location) && <p className={s.small}>{[sc.topic, sc.location].filter(Boolean).join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Syllabus">
            {(b.course?.modules ?? []).length === 0 ? (
              <p className={s.muted}>No syllabus modules yet.</p>
            ) : (
              <ol className={s.list}>
                {(b.course.modules as Module[]).map((m, i) => (
                  <li key={m.id} className={s.item}>
                    <div className={s.itemHead}>
                      <span className={s.itemTitle}>
                        {i + 1}. {m.title}
                      </span>
                      {m.durationHours ? <span className={s.small}>{m.durationHours} h</span> : null}
                    </div>
                    {m.description && <p className={s.body}>{m.description}</p>}
                    {m.topics?.length > 0 && (
                      <div className={s.topics}>
                        {m.topics.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </Guarded>
  );
}
