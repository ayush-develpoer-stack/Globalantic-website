import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { VerifyEmailPanel } from '@/components/AuthForms';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Verify your email');

export default function Page() {
  return (
    <div className={`container ${s.page}`}>
      <div className={s.authWrap}>
        <PageHeader title="Verify your email" description="Confirming your email address." />
        <Suspense fallback={<LoadingState rows={2} />}>
          <VerifyEmailPanel />
        </Suspense>
      </div>
    </div>
  );
}
