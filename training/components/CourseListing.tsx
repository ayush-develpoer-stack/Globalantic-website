import type { ProgramType } from '@globalantic/types';
import { EmptyState, ErrorState } from '@globalantic/ui';
import { CourseCard } from './CourseCard';
import { FilterForm, type FilterDef } from './FilterForm';
import { PageLinks } from './PageLinks';
import { COURSE_LEVELS, DELIVERY_MODES, LEVEL_OPTIONS, MODE_OPTIONS, PROGRAM_OPTIONS, PROGRAM_TYPES, load, oneOf, pageParam, param } from '@/lib/server';
import s from '@/styles/site.module.css';

type SP = Record<string, string | string[] | undefined>;

/** Course catalogue with URL-driven search, filters and pagination (server-rendered). */
export async function CourseListing({ searchParams, basePath, fixedProgram }: { searchParams: SP; basePath: string; fixedProgram?: ProgramType }) {
  const values = {
    search: param(searchParams, 'search').trim(),
    category: param(searchParams, 'category'),
    mode: oneOf(param(searchParams, 'mode'), DELIVERY_MODES),
    level: oneOf(param(searchParams, 'level'), COURSE_LEVELS),
    programType: fixedProgram ?? oneOf(param(searchParams, 'programType'), PROGRAM_TYPES),
  };
  const page = pageParam(searchParams);
  const result = await load((a) =>
    a.catalog.courses({
      search: values.search || undefined,
      category: values.category || undefined,
      mode: values.mode || undefined,
      level: values.level || undefined,
      programType: values.programType || undefined,
      page,
      pageSize: 12,
    }),
  );

  const filters: FilterDef[] = [
    { name: 'category', label: 'Category', options: (result.data?.categories ?? []).map((c) => ({ value: c, label: c })) },
    { name: 'mode', label: 'Mode', options: MODE_OPTIONS },
    { name: 'level', label: 'Level', options: LEVEL_OPTIONS },
    ...(fixedProgram ? [] : [{ name: 'programType', label: 'Programme', options: PROGRAM_OPTIONS }]),
  ];
  const urlValues = Object.fromEntries(Object.entries(values).filter(([k, v]) => v && !(fixedProgram && k === 'programType'))) as Record<string, string>;
  const hasFilters = Object.keys(urlValues).length > 0;

  return (
    <>
      <FilterForm key={JSON.stringify(urlValues)} basePath={basePath} values={urlValues} filters={filters} searchLabel="Search courses" />
      {result.error ? (
        <ErrorState title="Courses could not be loaded" message={result.error} />
      ) : !result.data?.items.length ? (
        <EmptyState
          title={hasFilters ? 'No courses match your filters' : 'No courses are published yet'}
          description={hasFilters ? 'Try removing a filter or searching for something else.' : 'New courses will appear here as soon as they are announced.'}
        />
      ) : (
        <>
          <p className={s.resultCount} aria-live="polite">
            {result.data.total} course{result.data.total === 1 ? '' : 's'} found
          </p>
          <div className={s.grid3}>
            {result.data.items.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
          <PageLinks basePath={basePath} params={urlValues} page={result.data.page} totalPages={result.data.totalPages} />
        </>
      )}
    </>
  );
}
