import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { EmptyState, ErrorState, PageHeader } from '@globalantic/ui';
import { BatchCard } from '@/components/BatchCard';
import { FilterForm } from '@/components/FilterForm';
import { PageLinks } from '@/components/PageLinks';
import { DELIVERY_MODES, MODE_OPTIONS, load, oneOf, pageParam, param } from '@/lib/server';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Upcoming batches',
  description: 'Upcoming and open Globalantic training batches with dates, timings, seats and fees.',
  path: '/batches',
});

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open for admission' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'FULL', label: 'Full' },
  { value: 'IN_PROGRESS', label: 'In progress' },
];
const STATUSES = ['OPEN', 'UPCOMING', 'FULL', 'IN_PROGRESS'] as const;

export default async function BatchesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const values = { mode: oneOf(param(searchParams, 'mode'), DELIVERY_MODES), status: oneOf(param(searchParams, 'status'), STATUSES) };
  const page = pageParam(searchParams);
  const result = await load((a) => a.catalog.batches({ mode: values.mode || undefined, status: values.status || undefined, page, pageSize: 12 }));
  const urlValues = Object.fromEntries(Object.entries(values).filter(([, v]) => v)) as Record<string, string>;

  return (
    <div className={`container ${s.page}`}>
      <PageHeader eyebrow="Schedule" title="Upcoming batches" description="Choose a batch whose dates, timings and learning mode suit you, then apply." />
      <FilterForm
        key={JSON.stringify(urlValues)}
        basePath="/batches"
        values={urlValues}
        filters={[
          { name: 'status', label: 'Status', options: STATUS_OPTIONS },
          { name: 'mode', label: 'Mode', options: MODE_OPTIONS },
        ]}
      />
      {result.error ? (
        <ErrorState title="Batches could not be loaded" message={result.error} />
      ) : !result.data?.items.length ? (
        <EmptyState title="No batches found" description={Object.keys(urlValues).length ? 'Try removing a filter.' : 'New batches will be announced here.'} />
      ) : (
        <>
          <div className={s.grid2}>
            {result.data.items.map((b) => (
              <BatchCard key={b.id} batch={b} showCourse />
            ))}
          </div>
          <PageLinks basePath="/batches" params={urlValues} page={result.data.page} totalPages={result.data.totalPages} />
        </>
      )}
    </div>
  );
}
