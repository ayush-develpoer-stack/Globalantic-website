'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { DAY_NAMES, enumLabel, type BatchSchedule, type CourseModule, type Progress } from '@globalantic/types';
import {
  AsyncView,
  Badge,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Stat,
  StatGrid,
  StatusBadge,
  formatDate,
  formatTime,
  percent,
  useAsync,
} from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

function ProgressCard({ p }: { p: Progress }) {
  return (
    <Card title="Progress">
      <StatGrid>
        <Stat label="Attendance" value={percent(p.attendancePercent)} hint={`${p.sessionsRecorded} sessions recorded`} />
        <Stat label="Assignments" value={`${p.assignmentsSubmitted}/${p.assignmentsTotal}`} hint="submitted" />
        <Stat label="Average score" value={percent(p.assignmentAveragePercent)} hint={`${p.assignmentsGraded} graded`} />
      </StatGrid>
      <div style={{ marginTop: 16 }} className={s.stackSm}>
        <div className={s.between}>
          <span className={s.small}>Attendance</span>
          <span className={s.small}>{percent(p.attendancePercent)}</span>
        </div>
        <ProgressBar value={p.attendancePercent} label="Attendance" />
      </div>
      {p.results.filter((r) => r.published).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <DataTable
            caption="Assessment results"
            rows={p.results.filter((r) => r.published)}
            rowKey={(r) => r.assessment}
            columns={[
              { key: 'a', header: 'Assessment', render: (r) => r.assessment },
              { key: 'm', header: 'Marks', render: (r) => `${r.marks}/${r.maxMarks}` },
              { key: 'r', header: 'Result', render: (r) => <Badge tone={r.passed ? 'success' : 'danger'}>{r.passed ? 'Passed' : 'Not passed'}</Badge> },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

export default function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle('Course');
  const state = useAsync(() => api().student.enrollment(id), `enrollment-${id}`);
  if (state.status === 404) return <ErrorState title="Course not found" message="This enrollment does not exist or belongs to another account." />;

  return (
    <AsyncView state={state} loadingRows={5}>
      {(e) => {
        const schedules = (e.batch.schedules ?? []) as BatchSchedule[];
        const modules = (e.course.modules ?? []) as CourseModule[];
        const trainers = (e.batch.trainers ?? []) as { role: string; trainer: { name: string } }[];
        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow={e.application?.applicationNumber}
              title={e.course.title}
              description={`${e.batch.name} · ${formatDate(e.batch.startDate)} – ${formatDate(e.batch.endDate)}`}
              actions={<StatusBadge status={e.status} />}
            />
            <ProgressCard p={e.progress} />
            <div className={s.grid2}>
              <Card title="Batch">
                <DescriptionList
                  items={[
                    { label: 'Mode', value: enumLabel(e.batch.mode) },
                    { label: 'Venue', value: e.batch.venue },
                    { label: 'Duration', value: e.course.durationLabel },
                    { label: 'Level', value: enumLabel(e.course.level) },
                    { label: 'Trainers', value: trainers.length ? trainers.map((t) => `${t.trainer.name} (${enumLabel(t.role)})`).join(', ') : 'To be announced' },
                    { label: 'Enrolled on', value: formatDate(e.enrolledAt) },
                    { label: 'Minimum attendance', value: `${e.course.minAttendancePercent}% for the certificate` },
                  ]}
                />
              </Card>
              <Card title="Class schedule" actions={<Link href="/timetable" className={s.link}>Timetable</Link>}>
                {schedules.length === 0 ? (
                  <EmptyState title="Schedule not published yet" />
                ) : (
                  <ul className={s.list}>
                    {schedules.map((sl) => (
                      <li key={sl.id} className={s.slot}>
                        <span className={s.strong}>{DAY_NAMES[sl.dayOfWeek]}</span>
                        <span className={s.small}>
                          {formatTime(sl.startTime)} – {formatTime(sl.endTime)}
                          {sl.topic ? ` · ${sl.topic}` : ''}
                          {sl.location ? ` · ${sl.location}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <Card title="Syllabus">
              {modules.length === 0 ? (
                <EmptyState title="Syllabus not available" />
              ) : (
                <ol className={s.list}>
                  {modules.map((m, i) => (
                    <li key={m.id} className={s.item}>
                      <div className={s.between}>
                        <span className={s.title}>
                          {i + 1}. {m.title}
                        </span>
                        {m.durationHours ? <Badge>{m.durationHours} h</Badge> : null}
                      </div>
                      {m.description && <p className={s.body}>{m.description}</p>}
                      {m.topics.length > 0 && <p className={s.small}>{m.topics.join(' · ')}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        );
      }}
    </AsyncView>
  );
}
