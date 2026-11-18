import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/config';
import { isIndexable } from '@/lib/seo';

/**
 * Production: everything public is crawlable (search and AI crawlers alike); the embedded admin
 * is excluded. Preview/staging deployments disallow everything (see isIndexable).
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Draft previews are staff-only and noindex; keep crawlers out entirely.
      disallow: ['/admin', '/admin/', '/blog/preview'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
