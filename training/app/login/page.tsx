import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { LoginPanel } from '@/components/AuthForms';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Sign in');

export default function Page() {
  return (
    <div className={`container ${s.page}`}>
      <div className={s.authWrap}>
        <PageHeader title="Sign in" description="Students, trainers and staff sign in here." />
        <Suspense fallback={<LoadingState rows={2} />}>
          <LoginPanel />
        </Suspense>
      </div>
    </div>
  );
}
