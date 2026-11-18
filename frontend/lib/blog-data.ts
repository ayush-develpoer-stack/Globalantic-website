import { getBlogCategories, getBlogPosts } from './api';
import { isPublicPost, sortPosts } from './blog';
import type { BlogCategory, BlogPost } from '@/types';

/** Public posts (newest first) and the categories that actually have posts. */
export async function loadPublicBlog(): Promise<{ posts: BlogPost[]; categories: BlogCategory[] }> {
  const [posts, categories] = await Promise.all([getBlogPosts(), getBlogCategories()]);
  const visible = sortPosts((posts ?? []).filter((p) => isPublicPost(p)));
  const used = new Set(visible.map((p) => p.category?.slug).filter(Boolean));
  return { posts: visible, categories: (categories ?? []).filter((c) => used.has(c.slug)) };
}

/** Listing metadata: search results are never indexed; page 2+ canonicalises to itself. */
export function listingSeo(basePath: string, q?: string, page?: string): { path: string; noindex: boolean } {
  const n = Number.parseInt(page ?? '1', 10);
  return { path: Number.isFinite(n) && n > 1 ? `${basePath}?page=${n}` : basePath, noindex: Boolean(q && q.trim()) };
}
