import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { RegisterForm } from './RegisterForm';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Register');

export default function RegisterPage() {
  return (
    <div className={`container ${s.page}`}>
      <div className={s.authWrap}>
        <PageHeader eyebrow="Admissions" title="Create your student account" description="Register once, verify your email, then apply for any open batch." />
        <Suspense fallback={<LoadingState />}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
