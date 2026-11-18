import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, ErrorState } from '@globalantic/ui';
import { BatchCard } from '@/components/BatchCard';
import { load } from '@/lib/server';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getBatch(id: string) {
  if (!UUID.test(id)) return { data: null, error: null, status: 404 };
  return load((a) => a.catalog.batch(id));
}

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const { data } = await getBatch(params.id);
  // Batches are short-lived: the course page (with its Course schema) is the page to index.
  if (!data) return { title: 'Batch', robots: { index: false, follow: true } };
  return pageMeta({ title: `${data.name} — ${data.course?.title ?? 'Batch'}`, path: `/batches/${data.id}`, noindex: true });
}

export default async function BatchDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const result = await getBatch(params.id);
  if (result.status === 404) notFound();
  if (!result.data) {
    return (
      <div className={`container ${s.page}`}>
        <ErrorState title="This batch could not be loaded" message={result.error} />
      </div>
    );
  }
  const b = result.data;
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <nav className={s.breadcrumb} aria-label="Breadcrumb">
        <Link href="/batches">Batches</Link>
        {b.course && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/courses/${b.course.slug}`}>{b.course.title}</Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span aria-current="page">{b.name}</span>
      </nav>
      <h1 style={{ marginBottom: 16 }}>
        {b.course?.title ? `${b.course.title}: ` : ''}
        {b.name}
      </h1>
      <div className={s.stack}>
        <BatchCard batch={b} />
        {b.course?.eligibility && (
          <Card title="Eligibility">
            <p>{b.course.eligibility}</p>
          </Card>
        )}
        {b.course && (
          <p>
            <Link className={s.inlineLink} href={`/courses/${b.course.slug}`}>
              View the full course syllabus →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
