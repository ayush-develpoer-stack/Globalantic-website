import type { MetadataRoute } from 'next';
import { SITE_URL, isIndexable } from '@/lib/seo';

/**
 * Public catalogue pages are crawlable. Account and application flows carry noindex metadata
 * (and are not disallowed here, so crawlers can see that noindex). Previews disallow everything.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
