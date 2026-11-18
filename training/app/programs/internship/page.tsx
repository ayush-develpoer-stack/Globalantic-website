import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { PageHeader } from '@globalantic/ui';
import { CourseListing } from '@/components/CourseListing';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Internship programmes',
  description: 'Supervised internship programmes at Globalantic: guided project work with a trainer, regular reviews and an internship completion certificate.',
  path: '/programs/internship',
});

export default async function InternshipProgramsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  return (
    <div className={`container ${s.page}`}>
      <PageHeader
        eyebrow="Programmes"
        title="Internship programmes"
        description="Guided project work under a trainer's supervision, with regular reviews and an internship completion certificate."
      />
      <CourseListing searchParams={searchParams} basePath="/programs/internship" fixedProgram="INTERNSHIP" />
    </div>
  );
}
