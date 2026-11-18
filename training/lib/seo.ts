import type { Metadata } from 'next';
import type { CourseDetail, DeliveryMode } from '@globalantic/types';
import { siteUrls } from './config';

/**
 * SEO helpers for training.globalantic.com. Public catalogue pages are indexable; account,
 * application and payment pages are not. Structured data uses only published catalogue data.
 */

const isProd = process.env.NODE_ENV === 'production';
export const SITE_URL = (process.env.NEXT_PUBLIC_TRAINING_URL || (isProd ? 'https://training.globalantic.com' : 'http://localhost:3001')).replace(/\/+$/, '');
export const SITE_NAME = 'Globalantic Training';

/** Only the production deployment is indexed (Vercel previews and local builds are not). ALLOW_INDEXING overrides. */
export function isIndexable(): boolean {
  const override = process.env.ALLOW_INDEXING;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return isProd && (process.env.VERCEL_ENV ?? 'production') === 'production';
}

interface PageMeta {
  title: string;
  description?: string;
  /** Canonical path on this site, e.g. "/courses". */
  path: string;
  noindex?: boolean;
  image?: string | null;
  /** Use the title as-is (the layout's "| Globalantic Training" template does not apply to the home page). */
  absolute?: boolean;
}

/** Per-page metadata with a self-referencing canonical and matching Open Graph tags. */
export function pageMeta({ title, description, path, noindex, image, absolute }: PageMeta): Metadata {
  const url = `${SITE_URL}${path}`;
  const index = !noindex && isIndexable();
  const full = absolute ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absolute ? { absolute: title } : title,
    ...(description ? { description } : {}),
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } } : { index: false, follow: true },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: SITE_NAME,
      url,
      title: full,
      ...(description ? { description } : {}),
      // A page-level openGraph replaces the file-based app/opengraph-image, so reference it explicitly.
      images: [image || '/opengraph-image'],
    },
    twitter: { card: 'summary_large_image', title: full, ...(description ? { description } : {}), images: [image || '/opengraph-image'] },
  };
}

/** Private pages (sign-in, applications, password flows): never indexed, links not followed. */
export const privateMeta = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });

const MAIN_ORG_ID = `${siteUrls.mainSite}/#organization`;

/** The training site is part of the Globalantic organisation (same entity as globalantic.com). */
export function trainingOrgSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${siteUrls.mainSite}/logo.svg`,
    parentOrganization: { '@type': 'Organization', '@id': MAIN_ORG_ID, name: 'Globalantic', url: siteUrls.mainSite },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE_URL}${item.path}` })),
  };
}

export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

const COURSE_MODE: Record<DeliveryMode, string> = { ONLINE: 'Online', OFFLINE: 'Onsite', HYBRID: 'Blended' };
const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * Course (+ offer and course instances) from the published course and its scheduled batches.
 * Nothing is added that the course page does not show.
 */
export function courseSchema(c: CourseDetail) {
  const url = `${SITE_URL}/courses/${c.slug}`;
  const instances = c.batches.map((b) => ({
    '@type': 'CourseInstance',
    name: b.name,
    courseMode: COURSE_MODE[b.mode] ?? b.mode,
    startDate: b.startDate,
    endDate: b.endDate,
    ...(b.mode !== 'ONLINE' && b.venue ? { location: { '@type': 'Place', name: b.venue } } : {}),
    ...(b.trainers.length ? { instructor: b.trainers.map((t) => ({ '@type': 'Person', name: t.name })) } : {}),
  }));
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': `${url}#course`,
    name: c.title,
    description: c.seoDescription || c.shortDescription,
    url,
    provider: { '@type': 'Organization', '@id': MAIN_ORG_ID, name: 'Globalantic', url: siteUrls.mainSite },
    ...(c.skills.length ? { teaches: c.skills } : {}),
    educationalLevel: c.level.charAt(0) + c.level.slice(1).toLowerCase(),
    ...(c.eligibility ? { coursePrerequisites: c.eligibility } : {}),
    inLanguage: 'en',
    ...(c.bannerUrl ? { image: c.bannerUrl } : {}),
    ...(c.fee.payablePaise > 0
      ? { offers: { '@type': 'Offer', category: 'Paid', price: rupees(c.fee.payablePaise), priceCurrency: 'INR', url } }
      : {}),
    ...(c.modules.length ? { syllabusSections: c.modules.map((m) => ({ '@type': 'Syllabus', name: m.title, ...(m.description ? { description: m.description } : {}) })) } : {}),
    ...(instances.length ? { hasCourseInstance: instances } : {}),
  };
}
