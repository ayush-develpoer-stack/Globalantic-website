import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { PageHeader } from '@globalantic/ui';
import { CourseListing } from '@/components/CourseListing';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Training programmes',
  description: 'Structured, trainer-led training programmes at Globalantic.',
  path: '/programs/training',
});

export default async function TrainingProgramsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  return (
    <div className={`container ${s.page}`}>
      <PageHeader
        eyebrow="Programmes"
        title="Training programmes"
        description="Structured courses with a module-by-module syllabus, assignments, assessments and a certificate on successful completion."
      />
      <CourseListing searchParams={searchParams} basePath="/programs/training" fixedProgram="TRAINING" />
    </div>
  );
}
