import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { ApplyFlow } from './ApplyFlow';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Apply');

export default function ApplyPage() {
  return (
    <div className={`container ${s.page}`}>
      <PageHeader eyebrow="Admissions" title="Apply for a batch" />
      <Suspense fallback={<LoadingState />}>
        <ApplyFlow />
      </Suspense>
    </div>
  );
}
