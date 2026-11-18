import type { MetadataRoute } from 'next';
import type { CourseSummary } from '@globalantic/types';
import { load } from '@/lib/server';
import { SITE_URL } from '@/lib/seo';

/**
 * Canonical, indexable pages only: the public catalogue and information pages plus every
 * published course. Batches (short-lived, noindex), account/application pages and filtered
 * catalogue views are left out. If the API is unreachable the static pages are still listed.
 */
export const dynamic = 'force-dynamic';

const STATIC_PATHS = [
  '/',
  '/courses',
  '/batches',
  '/programs/training',
  '/programs/internship',
  '/programs/certificate',
  '/fees',
  '/learning-modes',
  '/faq',
  '/referral',
  '/certificates/verify',
  '/contact',
  '/privacy',
  '/terms',
];

async function allCourses(): Promise<CourseSummary[]> {
  const out: CourseSummary[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await load((a) => a.catalog.courses({ page, pageSize: 50 }, { revalidate: 3600 }));
    if (!data) break;
    out.push(...data.items);
    if (page >= data.totalPages) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const courses = await allCourses();
  return [
    ...STATIC_PATHS.map((path) => ({ url: `${SITE_URL}${path === '/' ? '' : path}` })),
    ...courses.map((c) => ({ url: `${SITE_URL}/courses/${c.slug}` })),
  ];
}
