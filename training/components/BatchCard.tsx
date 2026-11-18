import Link from 'next/link';
import type { PublicBatch } from '@globalantic/types';
import { DAY_NAMES, enumLabel } from '@globalantic/types';
import { Badge, StatusBadge, formatDate, formatINR, formatTime } from '@globalantic/ui';
import { ButtonLink } from './ButtonLink';
import s from '@/styles/site.module.css';

export function Schedule({ schedules }: { schedules: PublicBatch['schedules'] }) {
  if (!schedules.length) return <p className={s.muted}>Class timings will be announced before the batch starts.</p>;
  return (
    <ul className={s.schedule} aria-label="Weekly class schedule">
      {schedules.map((sl) => (
        <li key={sl.id}>
          <strong>{DAY_NAMES[sl.dayOfWeek] ?? 'Day'}</strong> · {formatTime(sl.startTime)} – {formatTime(sl.endTime)}
          {sl.topic ? ` · ${sl.topic}` : ''}
          {sl.location ? ` · ${sl.location}` : ''}
        </li>
      ))}
    </ul>
  );
}

export function BatchCard({ batch, showCourse = false }: { batch: PublicBatch; showCourse?: boolean }) {
  return (
    <article className={s.batchCard} aria-labelledby={`batch-${batch.id}`}>
      <div className={s.batchHead}>
        <div>
          {showCourse && batch.course && (
            <p className={s.muted}>
              <Link href={`/courses/${batch.course.slug}`} className={s.inlineLink}>
                {batch.course.title}
              </Link>
            </p>
          )}
          <h3 id={`batch-${batch.id}`}>
            <Link href={`/batches/${batch.id}`}>{batch.name}</Link>
          </h3>
        </div>
        <div className={s.row}>
          <StatusBadge status={batch.status} />
          <Badge>{enumLabel(batch.mode)}</Badge>
        </div>
      </div>
      <dl className={s.facts}>
        <div className={s.fact}>
          <dt>Starts</dt>
          <dd>{formatDate(batch.startDate)}</dd>
        </div>
        <div className={s.fact}>
          <dt>Ends</dt>
          <dd>{formatDate(batch.endDate)}</dd>
        </div>
        <div className={s.fact}>
          <dt>Apply by</dt>
          <dd>{formatDate(batch.registrationDeadline)}</dd>
        </div>
        <div className={s.fact}>
          <dt>Seats left</dt>
          <dd>
            {batch.availableSeats} of {batch.capacity}
          </dd>
        </div>
        <div className={s.fact}>
          <dt>Fee</dt>
          <dd>{batch.fee.payablePaise === 0 ? 'Free' : formatINR(batch.fee.payablePaise)}</dd>
        </div>
        {batch.venue && (
          <div className={s.fact}>
            <dt>Venue</dt>
            <dd>{batch.venue}</dd>
          </div>
        )}
      </dl>
      <Schedule schedules={batch.schedules} />
      {batch.trainers.length > 0 && <p className={s.muted}>Trainer{batch.trainers.length > 1 ? 's' : ''}: {batch.trainers.map((t) => t.name).join(', ')}</p>}
      <div className={s.row}>
        {batch.admissionOpen ? (
          <ButtonLink href={`/apply?batch=${batch.id}`} aria-label={`Apply for ${batch.name}`}>
            Apply now
          </ButtonLink>
        ) : (
          <p className={s.blocked} role="note">
            {batch.admissionBlockedReason ?? 'Admissions are closed for this batch.'}
          </p>
        )}
      </div>
    </article>
  );
}
