'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, ErrorState, PageHeader, buttonClass, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { formatRemaining } from '@/components/exam-ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

type Row = Record<string, any>;

/**
 * Program lesson. Opening it records the first-open time on the server; "Mark complete" is accepted
 * by the server only after the lesson's minimum time has passed (the countdown uses the server clock).
 */
export default function LessonPage() {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();
  const toast = useToast();
  const state = useAsync(() => api().programStudent.lesson(id, lessonId), `program-lesson-${id}-${lessonId}`);
  const enrollment = useAsync(() => api().programStudent.enrollment(id), `program-enrollment-${id}`);
  usePageTitle(state.data?.lesson?.title ?? 'Lesson');
  const [remaining, setRemaining] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    const d = state.data;
    if (!d) return;
    setCompletedAt(d.completedAt ?? null);
    offset.current = Date.parse(d.serverNow) - Date.now();
    const target = Date.parse(d.canCompleteAt);
    const tick = () => setRemaining(Math.max(0, target - (Date.now() + offset.current)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.data]);

  if (state.status === 404) return <ErrorState title="Lesson not found" message="This lesson does not exist or is no longer available." />;
  if (state.status === 403) return <ErrorState title="Lesson locked" message={state.error ?? 'Complete the program fee payment to unlock the lessons.'} />;

  const complete = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await api().programStudent.completeLesson(id, lessonId);
      setCompletedAt(r.completedAt);
      toast('Lesson completed', 'success');
      enrollment.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const lessons: Row[] = enrollment.data?.program?.lessons ?? [];
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;

  return (
    <AsyncView state={state}>
      {(d: Row) => {
        const l = d.lesson;
        const video = typeof l.videoUrl === 'string' && l.videoUrl.startsWith('https://') ? l.videoUrl : null;
        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow={idx >= 0 ? `Lesson ${idx + 1} of ${lessons.length}` : 'Lesson'}
              title={l.title}
              actions={
                <Link href={`/program/${id}`} className={buttonClass('ghost', 'sm')}>
                  Back to program
                </Link>
              }
            />
            <Card>
              <div className={s.stackSm}>
                {String(l.body)
                  .split(/\n{2,}/)
                  .map((para: string, i: number) => (
                    <p key={i} className={s.body}>
                      {para}
                    </p>
                  ))}
                {video && (
                  <p>
                    <a href={video} target="_blank" rel="noopener noreferrer" className={s.link}>
                      <ExternalLink size={14} aria-hidden /> Watch the lesson video<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </p>
                )}
              </div>
            </Card>
            <Card>
              <div className={s.between}>
                {completedAt ? (
                  <span className={s.row}>
                    <CheckCircle2 size={18} aria-hidden color="var(--success, green)" /> Completed {formatDateTime(completedAt)}
                  </span>
                ) : (
                  <span className={s.muted} aria-live="polite">
                    {remaining > 0 ? `You can mark this lesson complete in ${formatRemaining(remaining)}.` : l.required ? 'Required lesson.' : 'Optional lesson.'}
                  </span>
                )}
                {!completedAt && (
                  <Button onClick={complete} loading={pending} disabled={remaining > 0}>
                    Mark complete
                  </Button>
                )}
              </div>
              {error && (
                <div style={{ marginTop: 12 }}>
                  <Alert tone="danger">{error}</Alert>
                </div>
              )}
            </Card>
            <nav className={s.between} aria-label="Lesson navigation">
              {prev ? (
                <Link href={`/program/${id}/lessons/${prev.id}`} className={buttonClass('outline', 'sm')}>
                  ← {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/program/${id}/lessons/${next.id}`} className={buttonClass('outline', 'sm')}>
                  {next.title} →
                </Link>
              ) : (
                <Link href={`/program/${id}`} className={buttonClass('outline', 'sm')}>
                  Back to program
                </Link>
              )}
            </nav>
          </div>
        );
      }}
    </AsyncView>
  );
}
