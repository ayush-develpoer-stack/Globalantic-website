import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { pageParam } from '@/lib/server';
import { PageHeader } from '@globalantic/ui';
import { CourseListing } from '@/components/CourseListing';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await props.searchParams;
  const page = pageParam(sp);
  const filtered = Object.keys(sp).some((k) => k !== 'page');
  return pageMeta({
    title: page > 1 ? `All courses — page ${page}` : 'All courses',
    description: 'Browse Globalantic training courses and internships: syllabus, mode, level, fees and open batches.',
    path: page > 1 && !filtered ? `/courses?page=${page}` : '/courses',
    noindex: filtered,
  });
}

export default async function CoursesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  return (
    <div className={`container ${s.page}`}>
      <PageHeader eyebrow="Catalogue" title="All courses" description="Search and filter every published training course and internship." />
      <CourseListing searchParams={searchParams} basePath="/courses" />
    </div>
  );
}
