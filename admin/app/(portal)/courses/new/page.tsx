'use client';

import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { PageHeader, useToast } from '@globalantic/ui';
import { CourseForm, toFormValues } from '../CourseForm';

export default function NewCoursePage() {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <PageHeader title="New course" description="Courses are created as drafts. Add a syllabus, then publish." />
      <CourseForm
        initial={toFormValues()}
        submitLabel="Create course"
        onSubmit={async (payload) => {
          const created = await api().admin.createCourse(payload);
          toast('Course created as a draft');
          router.push(`/courses/${created.id}`);
        }}
      />
    </>
  );
}
