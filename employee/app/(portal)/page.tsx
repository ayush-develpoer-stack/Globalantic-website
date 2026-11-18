'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, PageHeader, Stat, StatGrid, StatusBadge, formatDate, useAsync, useSession, useToast } from '@globalantic/ui';
import type { Dashboard } from '@/lib/types';
import { timeOf } from '@/lib/util';
import s from '@/lib/page.module.css';

export default function DashboardPage() {
  const { user } = useSession();
  const toast = useToast();
  const state = useAsync(() => api().employee.dashboard() as Promise<Dashboard>, 'dashboard');
  const [pending, setPending] = useState<'in-office' | 'in-wfh' | 'out' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: 'in-office' | 'in-wfh' | 'out') => {
    if (pending) return;
    setPending(kind);
    setError(null);
    try {
      if (kind === 'out') await api().employee.checkOut();
      else await api().employee.checkIn(kind === 'in-wfh' ? 'WORK_FROM_HOME' : 'PRESENT');
      toast(kind === 'out' ? 'Checked out. Have a good evening!' : 'Checked in for today.', 'success');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={s.stack}>
      <PageHeader eyebrow="Employee portal" title={`Welcome, ${user.name.split(' ')[0]}`} description="Your day at a glance: attendance, tasks, leave and announcements." />
      <AsyncView state={state}>
        {(d) => {
          const a = d.attendance;
          const checkedIn = Boolean(a?.checkInAt);
          const checkedOut = Boolean(a?.checkOutAt);
          return (
            <>
              <Card title={`Today · ${formatDate(d.today)}`}>
                <div className={s.stack}>
                  {d.onLeaveToday && <Alert tone="info" title="You are on approved leave today">Check-in is not needed.</Alert>}
                  {error && <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert>}
                  <div className={s.spread}>
                    <div>
                      {a ? (
                        <div className={s.row}>
                          <StatusBadge status={a.status} />
                          <span className={s.muted}>
                            In {timeOf(a.checkInAt)} · Out {timeOf(a.checkOutAt)}
                          </span>
                        </div>
                      ) : (
                        <p className={s.muted}>You have not checked in today.</p>
                      )}
                    </div>
                    {!d.onLeaveToday && (
                      <div className={s.row}>
                        {!checkedIn && (
                          <>
                            <Button onClick={() => void act('in-office')} loading={pending === 'in-office'} disabled={Boolean(pending)}>
                              Check in (office)
                            </Button>
                            <Button variant="outline" onClick={() => void act('in-wfh')} loading={pending === 'in-wfh'} disabled={Boolean(pending)}>
                              Work from home
                            </Button>
                          </>
                        )}
                        {checkedIn && !checkedOut && (
                          <Button variant="secondary" onClick={() => void act('out')} loading={pending === 'out'} disabled={Boolean(pending)}>
                            Check out
                          </Button>
                        )}
                        {checkedOut && <span className={s.muted}>Day complete.</span>}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <StatGrid>
                <Stat label="Open tasks" value={d.openTasks.length} />
                <Stat label="Pending leave requests" value={d.pendingLeaves} tone={d.pendingLeaves ? 'warning' : undefined} />
                <Stat label="Open HR requests" value={d.openRequests} />
              </StatGrid>

              <div className={s.grid2}>
                <Card title="My open tasks" actions={<Link href="/tasks" className={s.link}>All tasks</Link>}>
                  {d.openTasks.length === 0 ? (
                    <p className={s.muted}>No open tasks. Nice work!</p>
                  ) : (
                    <ul className={s.list}>
                      {d.openTasks.map((t) => (
                        <li key={t.id} className={s.item}>
                          <div className={s.itemHead}>
                            <span className={s.itemTitle}>{t.title}</span>
                            <StatusBadge status={t.status} />
                          </div>
                          <p className={s.small}>
                            {[t.project?.name, t.dueDate ? `Due ${formatDate(t.dueDate)}` : null, `${t.priority.toLowerCase()} priority`].filter(Boolean).join(' · ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                <Card title="Announcements" actions={<Link href="/announcements" className={s.link}>All</Link>}>
                  {d.announcements.length === 0 ? (
                    <p className={s.muted}>No announcements yet.</p>
                  ) : (
                    <ul className={s.list}>
                      {d.announcements.map((n) => (
                        <li key={n.id} className={s.item}>
                          <div className={s.itemHead}>
                            <span className={s.itemTitle}>{n.title}</span>
                            <span className={s.small}>{formatDate(n.createdAt)}</span>
                          </div>
                          <p className={s.body}>{n.body.length > 220 ? `${n.body.slice(0, 220)}…` : n.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}
