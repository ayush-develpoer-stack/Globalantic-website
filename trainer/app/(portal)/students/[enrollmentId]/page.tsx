'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { enumLabel, type Progress } from '@globalantic/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  PageHeader,
  ProgressBar,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  Textarea,
  formatDateTime,
  percent,
  useAsync,
  useToast,
} from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface ProgressData {
  student: { id: string; name: string; email: string };
  status: string;
  progress: Progress;
  feedback: { id: string; content: string; rating: number | null; createdAt: string }[];
}

export default function StudentProgressPage() {
  const enrollmentId = useParam('enrollmentId');
  const toast = useToast();
  const state = useAsync(() => api().trainer.progress(enrollmentId) as Promise<ProgressData>, `progress:${enrollmentId}`);
  const [content, setContent] = useState('');
  const [rating, setRating] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 3) {
      setFieldErr('Write at least a short note (3+ characters).');
      return;
    }
    setPending(true);
    setError(null);
    setFieldErr(undefined);
    try {
      await api().trainer.feedback(enrollmentId, { content: content.trim(), ...(rating ? { rating: Number(rating) } : {}) });
      setContent('');
      setRating('');
      toast('Feedback sent to the student.');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setFieldErr(fieldErrorMap(err).content);
    } finally {
      setPending(false);
    }
  };

  return (
    <Guarded state={state} what="Student">
      {(d) => {
        const p = d.progress;
        return (
          <div className={s.stack}>
            <PageHeader title={d.student.name} description={<span className={s.row}><StatusBadge status={d.status} /> {d.student.email}</span>} />
            <StatGrid>
              <Stat label="Attendance" value={percent(p.attendancePercent)} hint={`${p.sessionsRecorded} sessions recorded`} />
              <Stat label="Assignments submitted" value={`${p.assignmentsSubmitted}/${p.assignmentsTotal}`} />
              <Stat label="Assignments graded" value={p.assignmentsGraded} />
              <Stat label="Assignment average" value={percent(p.assignmentAveragePercent)} />
            </StatGrid>
            <Card title="Attendance">
              <ProgressBar value={p.attendancePercent} label="Attendance percentage" />
            </Card>
            <Card title="Assessment results">
              {p.results.length === 0 ? (
                <p className={s.muted}>No results recorded yet.</p>
              ) : (
                <DataTable
                  caption="Assessment results"
                  rows={p.results}
                  rowKey={(r) => r.assessment}
                  columns={[
                    { key: 'a', header: 'Assessment', render: (r) => r.assessment },
                    { key: 't', header: 'Type', render: (r) => enumLabel(r.type), hideOnMobile: true },
                    { key: 'm', header: 'Marks', render: (r) => `${r.marks}/${r.maxMarks}` },
                    { key: 'p', header: 'Result', render: (r) => <Badge tone={r.passed ? 'success' : 'danger'}>{r.passed ? 'Pass' : 'Below pass'}</Badge> },
                    { key: 'v', header: 'Visible to student', render: (r) => (r.published ? 'Yes' : 'No'), hideOnMobile: true },
                  ]}
                />
              )}
            </Card>
            <div className={s.grid2}>
              <Card title="Give feedback">
                <form onSubmit={send} noValidate className={s.formGrid}>
                  {error && (
                    <div className={s.full}>
                      <Alert tone="danger">{error}</Alert>
                    </div>
                  )}
                  <Textarea containerClassName={s.full} label="Feedback" required rows={4} maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} error={fieldErr} />
                  <Select
                    label="Rating"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    placeholder="No rating"
                    options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))}
                  />
                  <div className={`${s.actions} ${s.full}`}>
                    <Button type="submit" loading={pending}>Send feedback</Button>
                  </div>
                </form>
              </Card>
              <Card title="Feedback history">
                {d.feedback.length === 0 ? (
                  <p className={s.muted}>No feedback given yet.</p>
                ) : (
                  <ul className={s.list}>
                    {d.feedback.map((f) => (
                      <li key={f.id} className={s.item}>
                        <div className={s.itemHead}>
                          <span className={s.small}>{formatDateTime(f.createdAt)}</span>
                          {f.rating ? <Badge tone="primary">{f.rating}/5</Badge> : null}
                        </div>
                        <p className={s.body}>{f.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </Guarded>
  );
}
