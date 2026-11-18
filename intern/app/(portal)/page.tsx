'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import {
  Alert,
  AsyncView,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Stat,
  StatGrid,
  StatusBadge,
  buttonClass,
  formatDate,
  formatINR,
  percent,
  useAsync,
} from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const state = useAsync(() => api().student.dashboard(), 'dashboard');
  const [resend, setResend] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const resendVerification = async () => {
    setSending(true);
    try {
      const r = await api().auth.resendVerification();
      setResend({ tone: 'success', text: r.message });
    } catch (err) {
      setResend({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setSending(false);
    }
  };

  return (
    <AsyncView state={state} loadingRows={5}>
      {(d) => (
        <div className={s.stack}>
          <PageHeader eyebrow="Student portal" title={`Welcome, ${d.name.split(' ')[0]}`} description="Your courses, classes, applications and updates in one place." />

          {!d.emailVerified && (
            <Alert tone="warning" title="Please verify your email address">
              <p>You need a verified email to apply for courses. Check your inbox for the verification link.</p>
              <div className={s.row} style={{ marginTop: 8 }}>
                <Button size="sm" variant="outline" onClick={resendVerification} loading={sending}>
                  Resend verification email
                </Button>
              </div>
            </Alert>
          )}
          {resend && <Alert tone={resend.tone}>{resend.text}</Alert>}

          <StatGrid>
            <Stat label="Active courses" value={d.enrollments.filter((e) => e.status === 'ACTIVE').length} tone="primary" />
            <Stat label="Open applications" value={d.openApplications.length} />
            <Stat label="Assignments due" value={d.pendingAssignments.length} tone={d.pendingAssignments.length ? 'warning' : undefined} />
            <Stat label="Unread notifications" value={d.unreadNotifications} />
          </StatGrid>

          {d.openApplications.length > 0 && (
            <Card title="Applications in progress" actions={<Link href="/applications" className={s.link}>View all</Link>}>
              <ul className={s.list}>
                {d.openApplications.map((a) => (
                  <li key={a.id} className={s.item}>
                    <div className={s.between}>
                      <span className={s.title}>
                        {a.course.title} — {a.batch.name}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                    <span className={s.small}>Application {a.applicationNumber}</span>
                    <div className={s.row}>
                      {a.status === 'APPROVED' && a.payablePaise > 0 ? (
                        <Link href={`/applications/${a.id}`} className={buttonClass('primary', 'sm')}>
                          Pay {formatINR(a.payablePaise)} now
                        </Link>
                      ) : (
                        <Link href={`/applications/${a.id}`} className={buttonClass('outline', 'sm')}>
                          View status
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className={s.grid2}>
            <Card title="My courses" actions={<Link href="/enrollments" className={s.link}>All courses</Link>}>
              {d.enrollments.length === 0 ? (
                <EmptyState
                  title="No enrollments yet"
                  description="Once your admission payment is verified, your course appears here."
                  action={<Link href="/applications" className={buttonClass('outline', 'sm')}>My applications</Link>}
                />
              ) : (
                <ul className={s.list}>
                  {d.enrollments.map((e) => (
                    <li key={e.id}>
                      <Link href={`/enrollments/${e.id}`} className={`${s.item} ${s.itemLink}`}>
                        <div className={s.between}>
                          <span className={s.title}>{e.course.title}</span>
                          <StatusBadge status={e.status} />
                        </div>
                        <span className={s.small}>
                          {e.batch.name} · {formatDate(e.batch.startDate)} – {formatDate(e.batch.endDate)}
                        </span>
                        <div className={s.between}>
                          <span className={s.small}>Attendance</span>
                          <span className={s.small}>{percent(e.attendancePercent)}</span>
                        </div>
                        <ProgressBar value={e.attendancePercent} label={`Attendance for ${e.course.title}`} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Assignments due" actions={<Link href="/assignments" className={s.link}>All assignments</Link>}>
              {d.pendingAssignments.length === 0 ? (
                <EmptyState title="Nothing due" description="You have no pending assignments." />
              ) : (
                <ul className={s.list}>
                  {d.pendingAssignments.map((a) => (
                    <li key={a.id}>
                      <Link href={`/assignments/${a.id}`} className={`${s.item} ${s.itemLink}`}>
                        <span className={s.title}>{a.title}</span>
                        <span className={s.small}>Due {formatDate(a.dueAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Latest announcements" actions={<Link href="/announcements" className={s.link}>All announcements</Link>}>
            {d.announcements.length === 0 ? (
              <EmptyState title="No announcements" description="Announcements from your trainers and the training team appear here." />
            ) : (
              <ul className={s.list}>
                {d.announcements.map((a) => (
                  <li key={a.id} className={s.item}>
                    <div className={s.between}>
                      <span className={s.title}>{a.title}</span>
                      {a.batch ? <Badge tone="primary">{a.batch.name}</Badge> : <Badge>All students</Badge>}
                    </div>
                    <p className={s.body}>{a.body}</p>
                    <span className={s.small}>{formatDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AsyncView>
  );
}
