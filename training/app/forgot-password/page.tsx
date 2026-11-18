import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { ForgotPasswordPanel } from '@/components/AuthForms';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Forgot your password?');

export default function Page() {
  return (
    <div className={`container ${s.page}`}>
      <div className={s.authWrap}>
        <PageHeader title="Forgot your password?" description="Enter your email and we will send you a reset link if an account exists." />
        <Suspense fallback={<LoadingState rows={2} />}>
          <ForgotPasswordPanel />
        </Suspense>
      </div>
    </div>
  );
}
