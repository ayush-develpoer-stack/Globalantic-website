'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, ConfirmDialog, DescriptionList, ErrorState, PageHeader, formatDateTime, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { AttemptResultBadge, ExamStateBadge, KIND_LABEL, TRACK_LABEL } from '@/components/exam-ui';
import { usePageTitle } from '@/components/usePageTitle';

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  usePageTitle('Exam');
  const state = useAsync(() => api().exams.get(id), `exam-${id}`);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 404) return <ErrorState title="Exam not found" message="This exam is not assigned to you, or it is no longer available." />;

  const begin = async () => {
    setError(null);
    try {
      const r = await api().exams.start(id);
      router.push(`/exams/attempts/${r.attemptId}/take`);
    } catch (err) {
      setError(errorMessage(err));
      state.reload();
      throw err;
    }
  };

  return (
    <AsyncView state={state} loadingRows={5}>
      {(x) => (
        <div className={s.stack}>
          <PageHeader
            eyebrow={<Link href="/exams" className={s.link}>← Internship exams</Link>}
            title={x.title}
            description={x.description ?? undefined}
            actions={
              x.state === 'IN_PROGRESS' && x.activeAttemptId ? (
                <Button onClick={() => router.push(`/exams/attempts/${x.activeAttemptId}/take`)}>Resume exam</Button>
              ) : x.canStart ? (
                <Button onClick={() => setConfirm(true)}>Start exam</Button>
              ) : null
            }
          />
          {error && <Alert tone="danger">{error}</Alert>}
          {x.reason && x.state !== 'OPEN' && <Alert tone={x.state === 'INTERVIEW' ? 'info' : 'warning'}>{x.reason}</Alert>}

          <div className={s.grid2}>
            <Card title="About this exam">
              <DescriptionList
                items={[
                  { label: 'Status', value: <ExamStateBadge state={x.state} /> },
                  { label: 'Category', value: <Badge tone="primary">{TRACK_LABEL[x.track]}</Badge> },
                  { label: 'Type', value: KIND_LABEL[x.kind] },
                  ...(x.kind !== 'INTERVIEW'
                    ? [
                        { label: 'Time limit', value: `${x.durationMinutes} minutes` },
                        { label: 'Questions', value: String(x.questionCount) },
                        { label: 'Attempts', value: `${x.attemptsUsed} used of ${x.attemptsAllowed}` },
                      ]
                    : []),
                  { label: 'Pass mark', value: `${x.passPercent}%` },
                  ...(x.kind !== 'INTERVIEW'
                    ? [{ label: 'Negative marking', value: x.negativeMarkPercent > 0 ? `${x.negativeMarkPercent}% of a question's marks for a wrong answer (blank answers lose nothing)` : 'None' }]
                    : []),
                  { label: 'Opens', value: x.opensAt ? formatDateTime(x.opensAt) : 'Now' },
                  { label: 'Closes', value: x.closesAt ? formatDateTime(x.closesAt) : 'No closing time' },
                  { label: 'Results', value: x.resultVisibility === 'IMMEDIATE' ? 'Shown as soon as your answers are evaluated' : 'Published by the team after evaluation' },
                ]}
              />
            </Card>
            <Card title="Instructions">
              <div className={s.stackSm}>
                <p className={s.body}>{x.instructions}</p>
                {x.eligibilityNote && (
                  <>
                    <p className={s.strong}>Eligibility</p>
                    <p className={s.body}>{x.eligibilityNote}</p>
                  </>
                )}
                {x.kind !== 'INTERVIEW' && (
                  <>
                    <p className={s.strong}>How the online test works</p>
                    <ul className={s.body} style={{ paddingLeft: 18, listStyle: 'disc' }}>
                      <li>The timer starts when you press Start and is kept by our server. Closing the page does not pause it.</li>
                      <li>Your answers are saved automatically while you work. If the connection drops, they are kept on this device and saved when you are back online.</li>
                      <li>When time runs out, your saved answers are submitted automatically.</li>
                      <li>You can submit only once per attempt. Switching away from the exam tab is recorded.</li>
                    </ul>
                  </>
                )}
              </div>
            </Card>
          </div>

          {x.attempts.length > 0 && (
            <Card title="Your attempts">
              <ul className={s.list}>
                {x.attempts.map((a) => (
                  <li key={a.id}>
                    <Link href={a.status === 'IN_PROGRESS' ? `/exams/attempts/${a.id}/take` : `/exams/attempts/${a.id}`} className={`${s.item} ${s.itemLink}`}>
                      <div className={s.between}>
                        <span className={s.title}>Attempt {a.attemptNo}</span>
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
            </Card>
          )}

          <ConfirmDialog
            open={confirm}
            title="Start the exam now?"
            message={`You will have ${x.durationMinutes} minutes for ${x.questionCount} questions. The timer cannot be paused.`}
            confirmLabel="Start now"
            onClose={() => setConfirm(false)}
            onConfirm={begin}
          />
        </div>
      )}
    </AsyncView>
  );
}
