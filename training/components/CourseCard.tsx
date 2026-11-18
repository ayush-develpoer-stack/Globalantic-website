import Link from 'next/link';
import type { CourseSummary } from '@globalantic/types';
import { enumLabel } from '@globalantic/types';
import { Badge, formatINR } from '@globalantic/ui';
import { ButtonLink } from './ButtonLink';
import s from '@/styles/site.module.css';

export function Price({ fee }: { fee: CourseSummary['fee'] }) {
  if (fee.payablePaise === 0) return <span className={s.price}>Free</span>;
  return (
    <span className={s.price}>
      {formatINR(fee.payablePaise)}
      {fee.discountPaise > 0 && <span className={s.priceOld}>{formatINR(fee.feePaise)}</span>}
    </span>
  );
}

export function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <article className={s.courseCard}>
      {course.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={course.thumbnailUrl} alt="" className={s.thumb} loading="lazy" />
      )}
      <div className={s.cardMeta}>
        <Badge tone="primary">{enumLabel(course.programType)}</Badge>
        <Badge>{enumLabel(course.mode)}</Badge>
        <Badge>{enumLabel(course.level)}</Badge>
      </div>
      <h3>
        <Link href={`/courses/${course.slug}`}>{course.title}</Link>
      </h3>
      <p className={s.muted}>{course.shortDescription}</p>
      <p className={s.muted}>
        {course.category} · {course.durationLabel}
        {course.openBatchCount > 0 ? ` · ${course.openBatchCount} batch${course.openBatchCount > 1 ? 'es' : ''} open` : ''}
      </p>
      <div className={s.cardFoot}>
        <Price fee={course.fee} />
        <ButtonLink href={`/courses/${course.slug}`} variant="outline" size="sm" aria-label={`View details for ${course.title}`}>
          View details
        </ButtonLink>
      </div>
    </article>
  );
}
