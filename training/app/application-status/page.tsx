import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { PageHeader } from '@globalantic/ui';
import { StatusList } from './StatusList';
import s from '@/styles/site.module.css';

export const metadata: Metadata = privateMeta('Application status');

export default function ApplicationStatusPage() {
  return (
    <div className={`container ${s.page}`}>
      <PageHeader eyebrow="Admissions" title="Application status" description="Track every application you have submitted." />
      <StatusList />
    </div>
  );
}
