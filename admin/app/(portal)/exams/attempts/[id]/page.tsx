'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DescriptionList, ErrorState, Input, PageHeader, Textarea, formatDateTime, useAsync, useSession, useToast } from '@globalantic/ui';
import { AttemptBadge, TRACK_LABEL, typeLabel } from '@/lib/exams';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;
interface Mark {
  marks: string;
  comment: string;
}

export default function EvaluateAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const toast = useToast();
  const state = useAsync(() => api().examAdmin.attempt(id), `exam-attempt-${id}`);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [feedback, setFeedback] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const a = state.data;
    if (!a) return;
    const m: Record<string, Mark> = {};
    for (const q of a.questions as Row[]) {
      if (q.type === 'DESCRIPTIVE' || q.manualMarks !== null) m[q.id] = { marks: q.manualMarks === null ? '' : String(q.manualMarks), comment: q.evaluatorComment ?? '' };
    }
    setMarks(m);
    setFeedback(a.feedback ?? '');
  }, [state.data]);

  if (state.status === 404) return <ErrorState title="Attempt not found" />;
  const canEvaluate = can('exams.evaluate');

  const save = async (a: Row) => {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const payload = Object.entries(marks)
        .filter(([, v]) => v.marks !== '')
        .map(([questionId, v]) => ({ questionId, marks: Number(v.marks), comment: v.comment || null }));
      await api().examAdmin.evaluate(a.id, { marks: payload, feedback: feedback || null });
      toast('Evaluation saved', 'success');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AsyncView state={state} loadingRows={6}>
      {(a) => {
        const editable = canEvaluate && a.status !== 'IN_PROGRESS' && a.exam.kind !== 'INTERVIEW';
        const unmarked = (a.questions as Row[]).filter((q) => q.type === 'DESCRIPTIVE' && (marks[q.id]?.marks ?? '') === '').length;
        return (
          <>
            <PageHeader
              eyebrow={<Link href={`/exams/${a.exam.id}`} className={s.link}>← {a.exam.title}</Link>}
              title={`${a.student.name} · attempt ${a.attemptNo}`}
              description={<span className={s.row}><Badge tone="primary">{TRACK_LABEL[a.exam.track]}</Badge><AttemptBadge r={a} /></span>}
            />
            <div className={s.stack}>
              {a.status === 'IN_PROGRESS' && <Alert tone="info">The candidate is still taking this exam (deadline {formatDateTime(a.deadlineAt)}). It can be evaluated after submission.</Alert>}
              {a.status === 'EVALUATED' && a.exam.resultVisibility === 'ON_RELEASE' && !a.exam.resultsReleasedAt && <Alert tone="info">Evaluated. The candidate will see the result after you release results for this exam.</Alert>}
              <Card title="Attempt">
                <DescriptionList
                  items={[
                    { label: 'Candidate', value: <Link href={`/exams/students/${a.student.id}`} className={s.link}>{a.student.name} · {a.student.email}</Link> },
                    { label: 'College', value: a.student.institution ?? '—' },
                    { label: 'Started', value: formatDateTime(a.startedAt) },
                    { label: 'Submitted', value: a.submittedAt ? `${formatDateTime(a.submittedAt)}${a.autoSubmitted ? ' (automatically, time up)' : ''}` : '—' },
                    { label: 'Score', value: a.score === null ? 'Not final yet' : `${a.score} / ${a.maxScore} (${a.percent}%)` },
                    { label: 'Pass mark', value: `${a.exam.passPercent}%` },
                    { label: 'Tab switches reported', value: String(a.focusLossCount) },
                  ]}
                />
              </Card>
              {error && <Alert tone="danger">{error}</Alert>}
              {(a.questions as Row[]).map((q) => {
                const objective = q.type !== 'DESCRIPTIVE';
                const m = marks[q.id];
                return (
                  <Card key={q.id} title={`Question ${q.number} · ${typeLabel(q.type)} · ${q.marks} mark${q.marks === 1 ? '' : 's'}`}>
                    <div className={s.stackSm}>
                      <p className={s.preWrap}>{q.prompt}</p>
                      <span className={s.small}>Topic: {q.topic}</span>
                      {objective ? (
                        <ul className={s.list}>
                          {(q.options as Row[]).map((o) => {
                            const chosen = q.selectedOptionIds.includes(o.id);
                            const correct = q.correctOptionIds.includes(o.id);
                            return (
                              <li key={o.id} className={s.row}>
                                <Badge tone={correct ? 'success' : chosen ? 'danger' : 'neutral'}>{correct ? 'Correct' : chosen ? 'Chosen' : 'Option'}</Badge>
                                <span>{o.text}{chosen && correct ? ' — chosen' : ''}</span>
                              </li>
                            );
                          })}
                          {q.selectedOptionIds.length === 0 && <li className={s.small}>No answer</li>}
                        </ul>
                      ) : (
                        <>
                          <div className={s.callout}>
                            <p className={s.preWrap}>{q.text?.trim() ? q.text : 'No answer'}</p>
                          </div>
                          {q.guidance && <p className={s.small}>Guidance: {q.guidance}</p>}
                        </>
                      )}
                      <p className={s.small}>
                        Auto-marked: {q.autoMarks === null ? (objective ? 'not answered' : 'needs manual marks') : `${q.autoMarks} / ${q.marks}`}
                        {q.manualMarks !== null && ` · manual: ${q.manualMarks}`}
                      </p>
                      {editable && (objective ? (
                        m ? (
                          <div className={s.formGrid}>
                            <Input label="Override marks" type="number" min={0} max={q.marks} step="0.5" value={m.marks} onChange={(e) => setMarks({ ...marks, [q.id]: { ...m, marks: e.target.value } })} />
                            <Input label="Comment" value={m.comment} maxLength={2000} onChange={(e) => setMarks({ ...marks, [q.id]: { ...m, comment: e.target.value } })} />
                          </div>
                        ) : (
                          <div>
                            <Button size="sm" variant="ghost" onClick={() => setMarks({ ...marks, [q.id]: { marks: String(q.autoMarks ?? 0), comment: '' } })}>Override auto-mark</Button>
                          </div>
                        )
                      ) : (
                        <div className={s.formGrid}>
                          <Input
                            label={`Marks (0–${q.marks})`}
                            type="number"
                            min={0}
                            max={q.marks}
                            step="0.5"
                            required
                            value={m?.marks ?? ''}
                            onChange={(e) => setMarks({ ...marks, [q.id]: { comment: m?.comment ?? '', marks: e.target.value } })}
                            error={errors[`marks.${q.id}`]}
                          />
                          <Input label="Comment for the candidate" value={m?.comment ?? ''} maxLength={2000} onChange={(e) => setMarks({ ...marks, [q.id]: { marks: m?.marks ?? '', comment: e.target.value } })} />
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
              {editable && (
                <Card title="Overall feedback">
                  <div className={s.stackSm}>
                    <Textarea label="Feedback shown with the result" rows={4} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                    <div className={s.rowBetween}>
                      <span className={s.small}>{unmarked ? `${unmarked} written answer(s) still need marks.` : 'All written answers are marked.'}</span>
                      <Button onClick={() => save(a)} loading={pending}>{a.status === 'EVALUATED' ? 'Update evaluation' : 'Save evaluation'}</Button>
                    </div>
                  </div>
                </Card>
              )}
              {!canEvaluate && <p className={s.small}>You can view this attempt; evaluating needs the exams.evaluate permission.</p>}
            </div>
          </>
        );
      }}
    </AsyncView>
  );
}
