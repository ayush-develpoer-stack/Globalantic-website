import type { MetadataRoute } from 'next';

/**
 * Private portal. Crawling is not blocked on purpose: every response carries
 * `X-Robots-Tag: noindex, nofollow` (next.config.mjs) plus noindex metadata, and a crawler must be
 * able to fetch a page to see that. Blocking here could leave bare URLs listed in search results.
 * There is no sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' } };
}
