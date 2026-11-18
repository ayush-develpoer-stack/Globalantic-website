import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/config';
import { getServices, getSolutions, getIndustries, getPortfolio, getBlogPosts, getBlogCategories } from '@/lib/api';
import { isPublicPost } from '@/lib/blog';

/**
 * Canonical, indexable URLs only. Excluded on purpose: /admin, campaign landing pages (/lp/*,
 * usually noindex and duplicating a service page), blog draft previews (/blog/preview/*), tag pages (noindex), query-string variants such as
 * /get-a-quote?service=…, and blog posts whose canonical URL points elsewhere.
 * lastModified comes from the content's real edit date; static pages carry none rather than a fake "now".
 */
export const revalidate = 3600;

const STATIC_PATHS = [
  '',
  '/about',
  '/services',
  '/solutions',
  '/industries',
  '/portfolio',
  '/blog',
  '/training',
  '/careers',
  '/contact',
  '/get-a-quote',
  '/privacy-policy',
  '/terms',
  '/refund-policy',
];

const lastMod = (value?: string) => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const [services, solutions, industries, portfolio, allPosts, categories] = await Promise.all([
    getServices(),
    getSolutions(),
    getIndustries(),
    getPortfolio(),
    getBlogPosts(),
    getBlogCategories(),
  ]);
  // Published, live content only: drafts, archived and scheduled items never appear.
  const posts = (allPosts ?? []).filter((p) => isPublicPost(p));
  const projects = (portfolio ?? []).filter((p) => p.published !== false && !(p as { archivedAt?: string | null }).archivedAt);
  const usedCategories = new Set(posts.map((p) => p.category?.slug).filter(Boolean));

  const entry = (path: string, updatedAt?: string): MetadataRoute.Sitemap[number] => {
    const lastModified = lastMod(updatedAt);
    return { url: `${base}${path}`, ...(lastModified ? { lastModified } : {}) };
  };

  return [
    ...STATIC_PATHS.map((path) => entry(path)),
    ...(services ?? []).map((s) => entry(`/services/${s.slug}`, s.updatedAt)),
    ...(solutions ?? []).map((s) => entry(`/solutions/${s.slug}`, s.updatedAt)),
    ...(industries ?? []).map((i) => entry(`/industries/${i.slug}`, i.updatedAt)),
    ...projects.map((p) => entry(`/portfolio/${p.slug}`, p.updatedAt)),
    ...(categories ?? []).filter((c) => usedCategories.has(c.slug)).map((c) => entry(`/blog/category/${c.slug}`)),
    ...posts
      .filter((p) => !p.canonicalUrl || p.canonicalUrl === `${base}/blog/${p.slug}`)
      .map((p) => entry(`/blog/${p.slug}`, p.updatedAt ?? p.publishedAt)),
  ];
}
