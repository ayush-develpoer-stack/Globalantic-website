import type { Metadata } from 'next';
import { siteConfig } from './config';

interface SeoParams {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  noindex?: boolean;
  /** Article pages (blog posts) get og:type=article with their dates. */
  article?: { publishedTime?: string; modifiedTime?: string; authors?: string[]; tags?: string[] };
}

/**
 * Only the production deployment may be indexed. Vercel preview/development deployments
 * (VERCEL_ENV) and non-production builds emit noindex and a disallow-all robots.txt, so a
 * staging copy can never compete with the live site. ALLOW_INDEXING=true|false overrides.
 */
export function isIndexable(): boolean {
  const override = process.env.ALLOW_INDEXING;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production' && (process.env.VERCEL_ENV ?? 'production') === 'production';
}

/** Absolute URL on the canonical site for a path (full http(s) URLs pass through). */
export function absoluteUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${siteConfig.url}${path}`;
}

/**
 * Page title with the brand exactly once. CMS SEO titles often already carry it
 * ("… | Globalantic", "… | Globalantic Blog"), so a title that mentions the brand is kept as-is.
 */
export function brandTitle(title?: string): string {
  const t = title?.trim();
  if (!t) return siteConfig.homeTitle;
  return t.toLowerCase().includes(siteConfig.name.toLowerCase()) ? t : `${t} | ${siteConfig.name}`;
}

/** Generated 1200×630 brand image (app/opengraph-image.tsx), resolved against metadataBase. */
export const DEFAULT_OG_IMAGE = '/opengraph-image';

/** Builds a consistent Metadata object with canonical URL and OpenGraph/Twitter. */
export function buildMetadata({
  title,
  description,
  path = '/',
  image,
  noindex,
  article,
}: SeoParams): Metadata {
  const fullTitle = brandTitle(title);
  const desc = description ?? siteConfig.description;
  // A full https URL (e.g. a blog post canonical set in the CMS) is used as-is.
  const url = absoluteUrl(path);
  const index = !noindex && isIndexable();
  // A page-level openGraph object replaces the root one in Next's metadata merge (including the
  // file-based app/opengraph-image), so the generated brand image is referenced explicitly.
  const images = [{ url: image || DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: title ?? siteConfig.homeTitle }];

  return {
    // absolute: the root layout template would append the brand a second time.
    title: { absolute: fullTitle },
    description: desc,
    alternates: { canonical: url },
    robots: index
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
      : { index: false, follow: !noindex },
    openGraph: {
      ...(article
        ? {
            type: 'article' as const,
            ...(article.publishedTime ? { publishedTime: article.publishedTime } : {}),
            ...(article.modifiedTime ? { modifiedTime: article.modifiedTime } : {}),
            ...(article.authors?.length ? { authors: article.authors } : {}),
            ...(article.tags?.length ? { tags: article.tags } : {}),
          }
        : { type: 'website' as const }),
      locale: 'en_IN',
      url,
      title: fullTitle,
      description: desc,
      siteName: siteConfig.name,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [images[0].url],
    },
  };
}

const ORG_ID = () => `${siteConfig.url}/#organization`;
/** The founder entity lives on the About page (name and title only — no unverified biography). */
export const FOUNDER_ID = () => `${siteConfig.url}/about#founder`;

/** Public settings fields used in structured data (only configured values are emitted). */
export interface OrgFacts {
  email?: string;
  phone?: string;
  socials?: (string | null | undefined)[];
}

/**
 * Organization (+ contact point). Only factual, configured details: phone and email from
 * site config/settings, social profiles only when set, and the city (no street address is published).
 */
export function organizationSchema(facts: OrgFacts = {}) {
  const phone = (facts.phone || siteConfig.phone || '').trim();
  const email = facts.email || siteConfig.email;
  const sameAs = (facts.socials ?? []).filter((u): u is string => Boolean(u && u.startsWith('https://')));
  const telephone = phone ? phone.replace(/\s+/g, '') : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID(),
    name: siteConfig.name,
    url: siteConfig.url,
    logo: { '@type': 'ImageObject', url: `${siteConfig.url}/logo.svg` },
    email,
    ...(telephone ? { telephone } : {}),
    description: siteConfig.description,
    address: { '@type': 'PostalAddress', addressLocality: siteConfig.city, addressRegion: siteConfig.region, addressCountry: 'IN' },
    founder: { '@type': 'Person', '@id': FOUNDER_ID(), name: siteConfig.founder.name },
    knowsAbout: siteConfig.expertise,
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email,
      ...(telephone ? { telephone } : {}),
      availableLanguage: ['English', 'Hindi'],
    },
  };
}

/** Founder (Person). Deliberately minimal: name, job title and employer until verified details exist. */
export function founderSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': FOUNDER_ID(),
    name: siteConfig.founder.name,
    jobTitle: siteConfig.founder.title,
    worksFor: { '@id': ORG_ID() },
    url: FOUNDER_ID(),
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteConfig.url}/#website`,
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: 'en-IN',
    publisher: { '@id': ORG_ID() },
  };
}

/** FAQPage — only for questions and answers that are visible on the same page. */
export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };
}

export function creativeWorkSchema(p: { title: string; description: string; path: string; image?: string; technologies?: string[]; datePublished?: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: p.title,
    description: p.description,
    url: `${siteConfig.url}${p.path}`,
    creator: { '@id': ORG_ID() },
    ...(p.image ? { image: p.image } : {}),
    ...(p.technologies?.length ? { keywords: p.technologies.join(', ') } : {}),
    ...(p.datePublished ? { datePublished: p.datePublished } : {}),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${siteConfig.url}${item.path}`,
    })),
  };
}

/** ItemList for an index page (services, solutions, industries) — the links visible on that page. */
export function itemListSchema(name: string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, url: `${siteConfig.url}${item.path}` })),
  };
}

export function serviceSchema(name: string, description: string, path: string, extra: { audience?: string[] } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    serviceType: name,
    description,
    provider: { '@type': 'Organization', '@id': ORG_ID(), name: siteConfig.name, url: siteConfig.url },
    url: `${siteConfig.url}${path}`,
    ...(extra.audience?.length ? { audience: extra.audience.map((a) => ({ '@type': 'Audience', audienceType: a })) } : {}),
  };
}

export function articleSchema(post: {
  title: string;
  description: string;
  path: string;
  publishedAt?: string;
  author: string;
  image?: string;
  updatedAt?: string;
  tags?: string[];
  section?: string;
}) {
  const founderAuthored = post.author?.trim().toLowerCase() === siteConfig.founder.name.toLowerCase();
  const author = founderAuthored
    ? { '@type': 'Person', '@id': FOUNDER_ID(), name: siteConfig.founder.name, url: FOUNDER_ID() }
    : post.author && post.author !== siteConfig.name
      ? { '@type': 'Person', name: post.author }
      : { '@id': ORG_ID(), '@type': 'Organization', name: siteConfig.name };
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author,
    publisher: { '@type': 'Organization', '@id': ORG_ID(), name: siteConfig.name, logo: { '@type': 'ImageObject', url: `${siteConfig.url}/logo.svg` } },
    datePublished: post.publishedAt,
    ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    mainEntityOfPage: `${siteConfig.url}${post.path}`,
    url: `${siteConfig.url}${post.path}`,
    inLanguage: 'en-IN',
    ...(post.image ? { image: post.image } : {}),
    ...(post.tags?.length ? { keywords: post.tags.join(', ') } : {}),
    ...(post.section ? { articleSection: post.section } : {}),
  };
}
