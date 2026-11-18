'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { AsyncView, LoadingState, PageHeader, useAsync, useToast } from '@globalantic/ui';
import { BatchForm } from '../BatchForm';

function NewBatch() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const courses = useAsync(() => api().admin.courses({ pageSize: 100 }), 'courses-for-batch');
  return (
    <>
      <PageHeader title="New batch" description="Batches start as Upcoming. Open admissions when the course is published." />
      <AsyncView state={courses} isEmpty={(d) => d.items.length === 0} empty={{ title: 'Create a course first', description: 'A batch always belongs to a course.' }}>
        {(d) => (
          <BatchForm
            courses={d.items.filter((c) => c.status !== 'ARCHIVED').map((c) => ({ value: c.id, label: c.title }))}
            defaultCourseId={params.get('courseId') ?? undefined}
            submitLabel="Create batch"
            onSubmit={async (payload) => {
              const b = await api().admin.createBatch(payload);
              toast('Batch created');
              router.push(`/batches/${b.id}`);
            }}
          />
        )}
      </AsyncView>
    </>
  );
}

export default function NewBatchPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <NewBatch />
    </Suspense>
  );
}
