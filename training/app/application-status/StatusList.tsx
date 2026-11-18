'use client';

import { api } from '@globalantic/api-client';
import { Card, DataTable, EmptyState, ErrorState, LoadingState, StatusBadge, formatDate, formatINR, useAsync } from '@globalantic/ui';
import type { StudentApplication } from '@globalantic/types';
import { ButtonLink } from '@/components/ButtonLink';
import { siteUrls } from '@/lib/config';
import s from '@/styles/site.module.css';

const NEXT_STEP: Record<string, string> = {
  SUBMITTED: 'Waiting for review',
  UNDER_REVIEW: 'Being reviewed by admissions',
  APPROVED: 'Approved — pay the fee in the portal to confirm your seat',
  REJECTED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
  ENROLLED: 'Enrolled — see you in class',
};

export function StatusList() {
  const state = useAsync(async () => {
    const user = await api().auth.me();
    if (!user) return { user: null, apps: [] as StudentApplication[] };
    if (user.role !== 'STUDENT') return { user, apps: [] as StudentApplication[] };
    return { user, apps: await api().student.applications() };
  }, 'status');

  if (state.loading && !state.data) return <LoadingState />;
  if (state.error || !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  const { user, apps } = state.data;

  if (!user) {
    return (
      <Card title="Sign in to see your applications">
        <p>Your application status is available after you sign in.</p>
        <div className={s.row} style={{ marginTop: 16 }}>
          <ButtonLink href="/login?next=/application-status">Sign in</ButtonLink>
          <ButtonLink href="/register" variant="outline">
            Create an account
          </ButtonLink>
        </div>
      </Card>
    );
  }
  if (user.role !== 'STUDENT') return <EmptyState title="No student applications" description="Application tracking is available to student accounts." />;
  if (!apps.length) {
    return <EmptyState title="You have not applied yet" description="Choose a course and an open batch to apply." action={<ButtonLink href="/courses">Browse courses</ButtonLink>} />;
  }

  return (
    <div className={s.stack}>
      <DataTable
        caption="Your applications"
        rows={apps}
        rowKey={(a) => a.id}
        columns={[
          { key: 'no', header: 'Application', render: (a) => <strong>{a.applicationNumber}</strong> },
          { key: 'course', header: 'Course / batch', render: (a) => `${a.course.title} — ${a.batch.name}` },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          { key: 'next', header: 'Next step', hideOnMobile: true, render: (a) => (a.status === 'REJECTED' && a.rejectionReason ? `Not approved: ${a.rejectionReason}` : NEXT_STEP[a.status]) },
          { key: 'fee', header: 'Fee', hideOnMobile: true, render: (a) => (a.payablePaise === 0 ? 'Free' : formatINR(a.payablePaise)) },
          { key: 'date', header: 'Applied', hideOnMobile: true, render: (a) => formatDate(a.createdAt) },
        ]}
      />
      <div>
        <ButtonLink href={`${siteUrls.internPortal}/applications`} external variant="outline">
          Manage in the student portal
        </ButtonLink>
      </div>
    </div>
  );
}
