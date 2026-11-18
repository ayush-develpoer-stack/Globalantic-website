import type { BlogPost } from '@/types';

export const BLOG_PAGE_SIZE = 9;

/** URL slug for a free-text tag ("AI Automation" -> "ai-automation"). */
export function tagSlug(tag: string): string {
  return tag.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Published, not archived, not scheduled for later: the only posts a public page may show. */
export function isPublicPost(p: BlogPost & { archivedAt?: string | null }, now = Date.now()): boolean {
  if (p.published === false || p.archivedAt) return false;
  if (p.publishedAt && new Date(p.publishedAt).getTime() > now) return false;
  return true;
}

/** Newest first by publication date. */
export function sortPosts(posts: BlogPost[]): BlogPost[] {
  const t = (p: BlogPost) => new Date(p.publishedAt ?? p.createdAt).getTime() || 0;
  return [...posts].sort((a, b) => t(b) - t(a));
}

/** All words must appear in the title, excerpt, category or tags (case-insensitive). */
export function searchPosts(posts: BlogPost[], query?: string | null): BlogPost[] {
  const words = (query ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return posts;
  return posts.filter((p) => {
    const hay = [p.title, p.excerpt, p.category?.name ?? '', ...(p.tags ?? [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function postsInCategory(posts: BlogPost[], slug: string): BlogPost[] {
  return posts.filter((p) => p.category?.slug === slug);
}

export function postsWithTag(posts: BlogPost[], slug: string): { tag: string | null; posts: BlogPost[] } {
  const matching = posts.filter((p) => (p.tags ?? []).some((t) => tagSlug(t) === slug));
  const tag = matching[0]?.tags.find((t) => tagSlug(t) === slug) ?? null;
  return { tag, posts: matching };
}

/** Clamps the requested page; returns the slice plus navigation facts. */
export function paginate<T>(items: T[], rawPage?: string | number | null, pageSize = BLOG_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const n = typeof rawPage === 'number' ? rawPage : Number.parseInt(String(rawPage ?? '1'), 10);
  const page = Number.isFinite(n) ? Math.min(Math.max(1, n), totalPages) : 1;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, totalPages, total: items.length };
}

/** Related: same category first, then posts sharing a tag, never the post itself. */
export function relatedPosts(all: BlogPost[], current: BlogPost, limit = 3): BlogPost[] {
  const others = all.filter((p) => p.slug !== current.slug);
  const sameCategory = current.category?.slug ? others.filter((p) => p.category?.slug === current.category?.slug) : [];
  const tags = new Set((current.tags ?? []).map(tagSlug));
  const sharedTag = others.filter((p) => !sameCategory.includes(p) && (p.tags ?? []).some((t) => tags.has(tagSlug(t))));
  return [...sameCategory, ...sharedTag].slice(0, limit);
}

/** Query string for a listing URL, dropping defaults (page 1, empty search). */
export function listingHref(base: string, opts: { q?: string; page?: number }): string {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
