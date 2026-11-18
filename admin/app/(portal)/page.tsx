'use client';

import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { APPLICATION_STATUSES, BATCH_STATUSES, COURSE_STATUSES, PAYMENT_STATUSES, enumLabel } from '@globalantic/types';
import { AsyncView, Card, DataTable, PageHeader, Stat, StatGrid, buttonClass, formatDateTime, formatINR, useAsync, useSession } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function Breakdown({ title, statuses, counts }: { title: string; statuses: readonly string[]; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Card title={`${title} (${total})`}>
      <dl className={s.list}>
        {statuses.map((st) => (
          <div key={st} className={s.rowBetween}>
            <dt className={s.muted}>{enumLabel(st)}</dt>
            <dd className={s.strong}>{counts[st] ?? 0}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const QUICK_LINKS = [
  { href: '/leads?status=NEW', label: 'New sales leads', perm: 'leads.manage' },
  { href: '/leads?followUp=overdue', label: 'Overdue lead follow-ups', perm: 'leads.manage' },
  { href: '/applications?status=SUBMITTED', label: 'Review new applications', perm: 'training.admissions.read' },
  { href: '/courses/new', label: 'New course', perm: 'training.courses.manage' },
  { href: '/batches/new', label: 'New batch', perm: 'training.batches.manage' },
  { href: '/payments', label: 'Payments', perm: 'payments.read' },
  { href: '/referrals', label: 'Referral rewards', perm: 'referrals.read' },
  { href: '/support', label: 'Support inbox', perm: 'training.support.manage' },
  { href: '/employees', label: 'Employees', perm: 'employees.read' },
  { href: '/leave', label: 'Leave approvals', perm: 'leave.approve' },
  { href: '/hr-requests', label: 'HR requests', perm: 'hr.requests.manage' },
  { href: '/users', label: 'Users & roles', perm: 'users.manage' },
  { href: '/reports', label: 'Reports', perm: 'reports.read' },
] as const;

const STAFF_ROLES = ['ADMIN', 'FINANCE', 'HR', 'EDITOR', 'SALES'];

/**
 * Live overview from GET /api/platform/overview. The server only returns the
 * sections this account is allowed to see, so the UI simply renders what it gets.
 */
export default function DashboardPage() {
  const { user, can } = useSession();
  const state = useAsync(() => api().platform.overview(), 'platform-overview');
  const links = QUICK_LINKS.filter((l) => can(l.perm));

  return (
    <>
      <PageHeader eyebrow="Admin" title={`Welcome, ${user.name.split(' ')[0]}`} description="Live overview of the areas you have access to." />
      <AsyncView state={state}>
        {(d: Row) => {
          const users: Record<string, { active: number; suspended: number }> | undefined = d.users;
          const sum = (roles: string[]) => roles.reduce((n, r) => n + (users?.[r]?.active ?? 0), 0);
          const suspended = users ? Object.values(users).reduce((n, v) => n + v.suspended, 0) : 0;
          const known = Boolean(users || d.training || d.payments || d.referrals || d.leads || d.people || d.openSupport !== undefined || d.recentActivity);
          return (
            <div className={s.stack}>
              {links.length > 0 && (
                <Card title="Quick links">
                  <div className={s.actions}>
                    {links.map((l) => (
                      <Link key={l.href} className={buttonClass('outline', 'sm')} href={l.href}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </Card>
              )}

              {!known && <Card><p className={s.muted}>No admin sections are assigned to your account yet. Contact an administrator.</p></Card>}

              {users && (
                <section aria-label="Users" className={s.stackSm}>
                  <h2 className={s.strong}>Users</h2>
                  <StatGrid>
                    <Stat label="Students" value={sum(['STUDENT'])} hint="Active accounts" />
                    <Stat label="Employees" value={sum(['EMPLOYEE'])} hint="Active accounts" />
                    <Stat label="Trainers" value={sum(['TRAINER'])} hint="Active accounts" />
                    <Stat label="Staff" value={sum(STAFF_ROLES)} hint="Admin, finance, HR, editors" />
                    <Stat label="Suspended" value={suspended} tone={suspended ? 'warning' : undefined} hint="All roles" />
                  </StatGrid>
                </section>
              )}

              {(d.payments || d.referrals || d.openSupport !== undefined) && (
                <StatGrid>
                  {d.payments && (
                    <>
                      <Stat label="Revenue this month" value={formatINR(d.payments.thisMonth.amountPaise)} hint={`${d.payments.thisMonth.count} verified payments`} tone="success" />
                      <Stat label="Awaiting payment" value={d.payments.awaitingPayment} hint="Approved applications" tone="warning" />
                    </>
                  )}
                  {d.referrals && (
                    <>
                      <Stat label="Rewards to review" value={d.referrals.pendingReview} tone={d.referrals.pendingReview ? 'warning' : undefined} />
                      <Stat label="Approved, awaiting payout" value={d.referrals.approvedAwaitingPayout} />
                      <Stat label="Open fraud reviews" value={d.referrals.openFraudReviews} tone={d.referrals.openFraudReviews ? 'danger' : undefined} />
                    </>
                  )}
                  {d.openSupport !== undefined && <Stat label="Open support requests" value={d.openSupport} />}
                </StatGrid>
              )}

              {(d.leads || d.people) && (
                <StatGrid>
                  {d.leads && (
                    <>
                      <Stat label="New contact enquiries" value={d.leads.newContacts} />
                      <Stat label="New training leads" value={d.leads.newTrainingLeads} />
                      <Stat label="New career applications" value={d.leads.newCareerApplications} />
                    </>
                  )}
                  {d.people && (
                    <>
                      <Stat label="Employees" value={d.people.employees} hint="Current (no exit date)" />
                      <Stat label="Pending leave" value={d.people.pendingLeave} tone={d.people.pendingLeave ? 'warning' : undefined} />
                      <Stat label="Open HR requests" value={d.people.openHrRequests} />
                    </>
                  )}
                </StatGrid>
              )}

              {d.training && (
                <>
                  <StatGrid>
                    <Stat label="Active enrollments" value={d.training.activeEnrollments} tone="primary" />
                  </StatGrid>
                  <div className={s.grid2}>
                    <Breakdown title="Applications" statuses={APPLICATION_STATUSES} counts={d.training.applications} />
                    <Breakdown title="Batches" statuses={BATCH_STATUSES} counts={d.training.batches} />
                    <Breakdown title="Courses" statuses={COURSE_STATUSES} counts={d.training.courses} />
                    {d.payments && (
                      <Breakdown
                        title="Payments"
                        statuses={PAYMENT_STATUSES}
                        counts={Object.fromEntries(Object.entries(d.payments.byStatus as Record<string, { count: number }>).map(([k, v]) => [k, v.count]))}
                      />
                    )}
                  </div>
                </>
              )}

              {Array.isArray(d.recentActivity) && (
                <Card title="Recent activity" actions={can('audit.read') ? <Link className={s.link} href="/audit">Full audit log</Link> : undefined}>
                  {d.recentActivity.length ? (
                    <DataTable<Row>
                      caption="Recent activity"
                      rows={d.recentActivity}
                      rowKey={(r) => r.id}
                      columns={[
                        { key: 'a', header: 'Action', render: (r) => <span className={s.mono}>{r.action}</span> },
                        { key: 'e', header: 'Entity', hideOnMobile: true, render: (r) => <span className={s.small}>{r.entityType}</span> },
                        { key: 'by', header: 'By', render: (r) => r.actor?.name ?? enumLabel(r.actorRole ?? 'SYSTEM') },
                        { key: 't', header: 'When', render: (r) => formatDateTime(r.createdAt) },
                      ]}
                    />
                  ) : (
                    <p className={s.muted}>No activity recorded yet.</p>
                  )}
                </Card>
              )}
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
