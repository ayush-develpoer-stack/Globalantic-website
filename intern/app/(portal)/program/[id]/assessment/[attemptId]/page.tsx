'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, LoadingState, PageHeader, buttonClass, useAsync } from '@globalantic/ui';
import { formatRemaining } from '@/components/exam-ui';
import s from '@/components/page.module.css';
import e from '@/components/exam.module.css';
import { usePageTitle } from '@/components/usePageTitle';

type Row = Record<string, any>;
const storeKey = (id: string) => `globalantic.program-attempt.${id}`;

function readAnswers(id: string): Record<string, number> {
  try {
    return JSON.parse(window.sessionStorage.getItem(storeKey(id)) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function writeAnswers(id: string, a: Record<string, number> | null) {
  try {
    if (a) window.sessionStorage.setItem(storeKey(id), JSON.stringify(a));
    else window.sessionStorage.removeItem(storeKey(id));
  } catch {
    // storage blocked: answers stay in memory only
  }
}

/**
 * Final assessment attempt. The server owns the question set, the deadline and the scoring
 * (answer keys never reach the browser). Answers are kept in this tab's sessionStorage so a refresh
 * does not lose them; the attempt is submitted automatically when the time runs out.
 */
export default function ProgramAttemptPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  usePageTitle('Final assessment');
  const state = useAsync(() => api().programStudent.attempt(attemptId), `program-attempt-${attemptId}`);
  const enrollment = useAsync(() => api().programStudent.enrollment(id), `program-enrollment-${id}`);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Row | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitted = useRef(false);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api().programStudent.submitAttempt(attemptId, answersRef.current);
      writeAnswers(attemptId, null);
      setResult(r);
    } catch (err) {
      submitted.current = false;
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId]);

  useEffect(() => {
    const d = state.data;
    if (!d || d.submitted) return;
    setAnswers(readAnswers(attemptId));
    const offset = Date.parse(d.serverNow) - Date.now();
    const deadline = Date.parse(d.deadlineAt);
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemaining(Math.max(0, left));
      if (left <= 0) void submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.data, attemptId, submit]);

  if (state.status === 404) return <ErrorState title="Attempt not found" message="This attempt does not exist or belongs to another account." />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingState />;

  const passPercent = enrollment.data?.program?.passPercent;
  const shown: Row | null = result ?? (state.data.submitted ? state.data : null);
  if (shown) {
    return (
      <div className={s.stack}>
        <PageHeader title="Assessment result" />
        <Card>
          <div className={s.stackSm} aria-live="polite">
            <div className={s.row}>
              <span className={s.strong} style={{ fontSize: '1.6rem' }}>
                {shown.scorePercent}%
              </span>
              <Badge tone={shown.passed ? 'success' : 'danger'}>{shown.passed ? 'Passed' : 'Not passed'}</Badge>
            </div>
            <p className={s.muted}>
              {shown.correctCount} of {shown.total} correct{(shown.passPercent ?? passPercent) ? ` · pass mark ${shown.passPercent ?? passPercent}%` : ''}
            </p>
            {shown.late && <Alert tone="warning">The time limit had passed, so this attempt was not scored.</Alert>}
            {shown.certificate && (
              <Alert tone="success" title="Certificate issued">
                Certificate {shown.certificate.certificateNumber} has been issued. It is available on the program page and has been emailed to you.
              </Alert>
            )}
            {!shown.passed && <p className={s.small}>You can try again if you have attempts left.</p>}
            <div>
              <Link href={`/program/${id}`} className={buttonClass('primary', 'md')}>
                Back to the program
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const questions: { id: string; prompt: string; options: string[] }[] = state.data.questions;
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;
  const low = remaining !== null && remaining < 120_000;
  const choose = (qid: string, i: number) => {
    const next = { ...answersRef.current, [qid]: i };
    setAnswers(next);
    writeAnswers(attemptId, next);
  };

  return (
    <div className={s.stack}>
      <div className={e.bar} role="region" aria-label="Assessment status">
        <span className={e.barTitle}>Final assessment</span>
        <span className={s.small}>
          {answered} of {questions.length} answered
        </span>
        {remaining !== null && (
          <span className={`${e.timer} ${low ? e.timerLow : ''}`} role="timer" aria-label={`Time remaining ${formatRemaining(remaining)}`}>
            <Timer size={18} aria-hidden />
            {formatRemaining(remaining)}
          </span>
        )}
      </div>
      <ol className={s.list} style={{ listStyle: 'none' }}>
        {questions.map((q, n) => (
          <li key={q.id}>
            <Card>
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                <legend className={s.title}>
                  {n + 1}. {q.prompt}
                </legend>
                {q.options.map((opt, i) => (
                  <label key={i} className={s.row} style={{ cursor: 'pointer', minHeight: 32 }}>
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === i} onChange={() => choose(q.id, i)} disabled={submitting} />
                    <span>{opt}</span>
                  </label>
                ))}
              </fieldset>
            </Card>
          </li>
        ))}
      </ol>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.actions}>
        <Button onClick={() => setConfirmOpen(true)} loading={submitting}>
          Submit answers
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Submit your answers?"
        message={answered < questions.length ? `You have answered ${answered} of ${questions.length} questions. Unanswered questions count as wrong.` : 'You cannot change your answers after submitting.'}
        confirmLabel="Submit"
        onConfirm={async () => {
          setConfirmOpen(false);
          await submit();
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
