import type {
  AdminSettings,
  BlogCategory,
  BlogPost,
  Faq,
  Industry,
  PortfolioProject,
  Service,
  Solution,
  Technology,
} from '@/types';
import { services as serviceSeeds } from './fixtures/content/services';
import { extraServices, serviceExtras } from './fixtures/content/services-extra';
import { solutions as solutionSeeds } from './fixtures/content/solutions';
import { serviceSeo } from './fixtures/content/seo';
import { industries as industrySeeds } from './fixtures/content/industries';
import { blogPosts as blogSeeds } from './fixtures/content/blog';
import { technologies as technologySeeds, faqs as faqSeeds, blogCategories as categorySeeds } from './fixtures/content/reference';

/**
 * Turns the seed fixtures into the exact record shapes the API returns
 * (ids, timestamps, SEO fields derived the same way prisma/seed.ts does).
 * Pure and deterministic — safe to call on the server and in the browser.
 */

const SEEDED_AT = '2026-09-21T04:33:21.000Z';

const pad = (n: number) => String(n).padStart(4, '0');

export function buildServices(): Service[] {
  return [...serviceSeeds, ...extraServices].map((s, i) => ({
    ...s,
    heroVariant: serviceExtras[s.slug]?.heroVariant ?? null,
    audience: serviceExtras[s.slug]?.audience ?? [],
    industries: serviceExtras[s.slug]?.industries ?? [],
    id: `service-${pad(i + 1)}`,
    seoTitle: serviceSeo[s.slug]?.title ?? `${s.title} Services | Globalantic`,
    seoDescription: serviceSeo[s.slug]?.description ?? s.shortDesc,
    published: true,
  }));
}

export function buildSolutions(): Solution[] {
  return solutionSeeds.map((s, i) => ({
    ...s,
    id: `solution-${pad(i + 1)}`,
    seoTitle: `${s.title} | Globalantic`,
    seoDescription: s.shortDesc,
    published: true,
  }));
}

export function buildIndustries(): Industry[] {
  return industrySeeds.map((s, i) => ({
    ...s,
    id: `industry-${pad(i + 1)}`,
    seoTitle: `${s.title} Software Solutions | Globalantic`,
    seoDescription: s.shortDesc,
    published: true,
  }));
}

/** No portfolio records exist yet — the site intentionally shows its empty state. */
export function buildPortfolio(): PortfolioProject[] {
  return [];
}

export function buildBlogCategories(): BlogCategory[] {
  return categorySeeds.map((c, i) => ({ id: `category-${pad(i + 1)}`, slug: c.slug, name: c.name }));
}

export function buildBlogPosts(): BlogPost[] {
  const categories = buildBlogCategories();
  return blogSeeds.map((p, i) => {
    const category = categories.find((c) => c.slug === p.categorySlug) ?? null;
    return {
      id: `post-${pad(i + 1)}`,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      content: p.content,
      author: 'Globalantic',
      tags: p.tags,
      readingTime: p.readingTime,
      seoTitle: `${p.title} | Globalantic Blog`,
      seoDescription: p.excerpt,
      published: true,
      publishedAt: SEEDED_AT,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      category,
    };
  });
}

export function buildTechnologies(): Technology[] {
  return technologySeeds.map((t, i) => ({ ...t, id: `technology-${pad(i + 1)}` }));
}

export function buildFaqs(): Faq[] {
  return faqSeeds.map((f, i) => ({ ...f, id: `faq-${pad(i + 1)}` }));
}

/** Mirrors the values written by seedSettings() in prisma/seed.ts. */
export function buildSettings(): AdminSettings {
  return {
    id: 'settings-0001',
    companyName: 'Globalantic',
    logoUrl: null,
    email: 'info@globalantic.com',
    secondaryEmail: 'info.globalantic@gmail.com',
    phone: '',
    whatsapp: '',
    address: 'Bhopal, India',
    facebookUrl: null,
    instagramUrl: null,
    linkedinUrl: null,
    twitterUrl: null,
    youtubeUrl: null,
    footerDescription:
      'Globalantic builds digital products, software and technology solutions that help businesses grow.',
    defaultSeoTitle: 'Globalantic — IT & Digital Solutions Company',
    defaultSeoDesc:
      'We build websites, software, mobile apps, AI solutions and business systems that move businesses forward.',
    ctaText: 'Get Free Consultation',
    // Not configured: the map stays hidden until an admin enters the verified office location.
    mapUrl: null,
    mapEmbedUrl: null,
    updatedAt: SEEDED_AT,
  };
}
