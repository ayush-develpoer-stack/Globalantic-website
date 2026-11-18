'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, DataTable, ErrorState, PageHeader, Stat, StatGrid, formatDateTime, useAsync } from '@globalantic/ui';
import { AttemptBadge, KIND_LABEL, TRACK_LABEL } from '@/lib/exams';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function StudentExamPerformancePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const router = useRouter();
  const state = useAsync(() => api().examAdmin.studentPerformance(studentId), `exam-perf-${studentId}`);
  if (state.status === 404) return <ErrorState title="Student not found" />;
  return (
    <AsyncView state={state} loadingRows={5}>
      {(d) => (
        <>
          <PageHeader eyebrow={<Link href="/exams" className={s.link}>← Exams</Link>} title={d.student.name} description={`${d.student.email}${d.student.institution ? ` · ${d.student.institution}` : ''} · exam performance`} />
          <div className={s.stack}>
            <StatGrid>
              <Stat label="Attempts" value={d.summary.attempts} />
              <Stat label="Evaluated" value={d.summary.evaluated} />
              <Stat label="Passed" value={d.summary.passed} tone="success" />
              <Stat label="Average" value={d.summary.averagePercent === null ? '—' : `${d.summary.averagePercent}%`} />
            </StatGrid>
            <DataTable<Row>
              caption="Exam attempts"
              rows={d.attempts}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/exams/attempts/${r.id}`)}
              columns={[
                { key: 'exam', header: 'Exam', render: (r) => (<><Link href={`/exams/${r.exam.id}`} className={s.link} onClick={(e) => e.stopPropagation()}>{r.exam.title}</Link><div className={s.small}><Badge tone="primary">{TRACK_LABEL[r.exam.track]}</Badge> {KIND_LABEL[r.exam.kind]}</div></>) },
                { key: 'no', header: '#', hideOnMobile: true, render: (r) => r.attemptNo },
                { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => formatDateTime(r.submittedAt ?? r.startedAt) },
                { key: 'score', header: 'Score', render: (r) => (r.score === null ? '—' : `${r.score} / ${r.maxScore}`) },
                { key: 'status', header: 'Result', render: (r) => <AttemptBadge r={r} /> },
              ]}
            />
            {d.attempts.length === 0 && <p className={s.muted}>No exam attempts yet.</p>}
          </div>
        </>
      )}
    </AsyncView>
  );
}
