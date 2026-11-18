'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DescriptionList, ErrorState, PageHeader, Stat, StatGrid, formatDateTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import e from '@/components/exam.module.css';
import { AttemptResultBadge, KIND_LABEL, TRACK_LABEL } from '@/components/exam-ui';
import { usePageTitle } from '@/components/usePageTitle';

const asText = (v: string[] | string | null | undefined) => (Array.isArray(v) ? (v.length ? v.join(', ') : 'No answer') : v?.trim() ? v : 'No answer');

export default function AttemptResultPage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle('Exam result');
  const state = useAsync(() => api().exams.result(id), `exam-result-${id}`);
  if (state.status === 404) return <ErrorState title="Attempt not found" message="This attempt does not exist or is not yours." />;

  return (
    <AsyncView state={state} loadingRows={5}>
      {(r) => (
        <div className={s.stack}>
          <PageHeader
            eyebrow={<Link href={`/exams/${r.exam.id}`} className={s.link}>← {r.exam.title}</Link>}
            title={`Attempt ${r.attemptNo}`}
            description={`${TRACK_LABEL[r.exam.track]} · ${KIND_LABEL[r.exam.kind]}`}
            actions={r.status === 'IN_PROGRESS' ? <Link href={`/exams/attempts/${r.id}/take`}><Button>Continue exam</Button></Link> : undefined}
          />

          {r.status !== 'IN_PROGRESS' && r.exam.kind !== 'INTERVIEW' && (
            <Alert tone="success" title="Your answers were submitted">
              {r.autoSubmitted ? 'Time ran out, so the answers saved up to that point were submitted automatically.' : 'Thank you. You can close this page.'}
            </Alert>
          )}
          {r.message && <Alert tone="info">{r.message}</Alert>}

          <Card title="Summary">
            <DescriptionList
              items={[
                { label: 'Status', value: <AttemptResultBadge a={r} /> },
                ...(r.exam.kind !== 'INTERVIEW'
                  ? [
                      { label: 'Started', value: formatDateTime(r.startedAt) },
                      { label: 'Submitted', value: r.submittedAt ? formatDateTime(r.submittedAt) : '—' },
                    ]
                  : [{ label: 'Recorded', value: r.submittedAt ? formatDateTime(r.submittedAt) : '—' }]),
                { label: 'Pass mark', value: `${r.exam.passPercent}%` },
              ]}
            />
          </Card>

          {r.resultVisible && (
            <>
              <StatGrid>
                <Stat label="Score" value={<span className={e.score}>{r.score} / {r.maxScore}</span>} />
                <Stat label="Percentage" value={`${r.percent}%`} />
                <Stat label="Result" value={r.passed ? 'Passed' : 'Not passed'} tone={r.passed ? 'success' : 'danger'} />
              </StatGrid>
              {r.feedback && (
                <Card title="Feedback from the team">
                  <p className={s.body}>{r.feedback}</p>
                </Card>
              )}
              {r.questions.length > 0 && (
                <Card title="Question by question">
                  <div>
                    {r.questions.map((q) => (
                      <div key={q.number} className={e.answerRow}>
                        <div className={s.between}>
                          <span className={e.qNumber}>Question {q.number}</span>
                          <Badge tone={q.awarded === q.marks ? 'success' : q.awarded > 0 ? 'warning' : 'neutral'}>
                            {q.awarded} / {q.marks}
                          </Badge>
                        </div>
                        <p className={e.prompt}>{q.prompt}</p>
                        <span className={e.answerLabel}>Your answer</span>
                        <p className={s.body}>{asText(q.yourAnswer)}</p>
                        {q.correctAnswer && q.correctAnswer.length > 0 && (
                          <>
                            <span className={e.answerLabel}>Correct answer</span>
                            <p className={s.body}>{q.correctAnswer.join(', ')}</p>
                          </>
                        )}
                        {q.explanation && <p className={s.muted}>{q.explanation}</p>}
                        {q.comment && (
                          <>
                            <span className={e.answerLabel}>Evaluator comment</span>
                            <p className={s.body}>{q.comment}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </AsyncView>
  );
}
