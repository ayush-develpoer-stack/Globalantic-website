'use client';

import { api } from '@globalantic/api-client';
import { DAY_NAMES, enumLabel } from '@globalantic/types';
import { AsyncView, Badge, PageHeader, formatDate, formatTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

/** Monday-first week order. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function TimetablePage() {
  usePageTitle('Timetable');
  const state = useAsync(() => api().student.timetable(), 'timetable');
  const today = new Date().getDay();
  return (
    <div className={s.stack}>
      <PageHeader title="Timetable" description="Your weekly classes across all active courses (times in IST)." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No classes scheduled', description: 'Your class schedule appears here once you are enrolled in an active batch.' }}>
        {(slots) => (
          <div className={s.days}>
            {ORDER.filter((d) => slots.some((x) => x.dayOfWeek === d)).map((d) => (
              <section key={d} className={s.day} aria-label={DAY_NAMES[d]}>
                <div className={s.between}>
                  <h2 className={s.dayName}>{DAY_NAMES[d]}</h2>
                  {d === today && <Badge tone="primary">Today</Badge>}
                </div>
                {slots
                  .filter((x) => x.dayOfWeek === d)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((x, i) => (
                    <div key={`${x.batchId}-${i}`} className={s.slot}>
                      <span className={s.strong}>
                        {formatTime(x.startTime)} – {formatTime(x.endTime)}
                      </span>
                      <span className={s.small}>
                        {x.course} · {x.batch}
                      </span>
                      <span className={s.small}>
                        {enumLabel(x.mode)}
                        {x.location ? ` · ${x.location}` : ''}
                        {x.topic ? ` · ${x.topic}` : ''}
                      </span>
                      <span className={s.small}>
                        {formatDate(x.from)} – {formatDate(x.to)}
                      </span>
                    </div>
                  ))}
              </section>
            ))}
          </div>
        )}
      </AsyncView>
    </div>
  );
}
