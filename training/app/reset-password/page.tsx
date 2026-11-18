import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { ResetPasswordPanel } from '@/components/AuthForms';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Choose a new password');

export default function Page() {
  return (
    <div className={`container ${s.page}`}>
      <div className={s.authWrap}>
        <PageHeader title="Choose a new password" description="Your new password replaces the old one and signs you out everywhere." />
        <Suspense fallback={<LoadingState rows={2} />}>
          <ResetPasswordPanel />
        </Suspense>
      </div>
    </div>
  );
}
