'use client';

import type { ExamAttemptSummary, StudentExam } from '@globalantic/types';
import { Badge, type Tone } from '@globalantic/ui';

export const TRACK_LABEL: Record<string, string> = { MARKETING: 'Marketing', SALES: 'Sales' };
export const KIND_LABEL: Record<string, string> = { TEST: 'Online test', PRACTICAL: 'Practical assessment', INTERVIEW: 'Interview stage' };

const STATE: Record<StudentExam['state'], { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'success' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  NO_ATTEMPTS_LEFT: { label: 'Completed', tone: 'neutral' },
  INTERVIEW: { label: 'Interview', tone: 'info' },
};

export function ExamStateBadge({ state }: { state: StudentExam['state'] }) {
  const s = STATE[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Result badge for an attempt: score only when the server says it is visible. */
export function AttemptResultBadge({ a }: { a: ExamAttemptSummary }) {
  if (a.status === 'IN_PROGRESS') return <Badge tone="warning">In progress</Badge>;
  if (!a.resultVisible) return <Badge tone="info">{a.status === 'SUBMITTED' ? 'Being evaluated' : 'Result pending'}</Badge>;
  return (
    <Badge tone={a.passed ? 'success' : 'danger'}>
      {a.passed ? 'Passed' : 'Not passed'} · {a.percent}%
    </Badge>
  );
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
