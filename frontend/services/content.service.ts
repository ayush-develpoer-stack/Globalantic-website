import { isMockMode } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { ServiceError } from '@/lib/api/errors';
import {
  buildBlogCategories,
  buildBlogPosts,
  buildFaqs,
  buildIndustries,
  buildPortfolio,
  buildServices,
  buildSettings,
  buildSolutions,
  buildTechnologies,
} from '@/lib/mock/content';
import type {
  BlogCategory,
  BlogPost,
  Faq,
  Industry,
  LandingPage,
  PortfolioProject,
  Service,
  SiteSettings,
  Solution,
  Technology,
} from '@/types';

/**
 * Public website content (read-only). Used by server components through
 * lib/api.ts. List functions resolve to `null` on failure so pages can render
 * their graceful fallback instead of crashing. Single-item lookups resolve to
 * `null` only for a genuine 404 and rethrow other failures (see `found`).
 */

const REVALIDATE_SECONDS = 300;

/**
 * Public pages degrade gracefully (empty section / 404) instead of crashing, but
 * failures other than 404 are logged on the server so outages are not hidden.
 */
async function safe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (!(err instanceof ServiceError && err.status === 404)) {
      console.error('[content] request failed:', err instanceof Error ? err.message : 'unknown error');
    }
    return null;
  }
}

/**
 * Single-item lookups for detail pages: `null` only when the item really does not exist (404).
 * Any other failure (API down, 503, timeout) is rethrown, so the page errors instead of
 * calling notFound(): Next.js keeps serving the last good version rather than caching a 404.
 */
async function found<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ServiceError && err.status === 404) return null;
    console.error('[content] request failed:', err instanceof Error ? err.message : 'unknown error');
    throw err;
  }
}

const published = <T extends { published?: boolean }>(items: T[]) => items.filter((i) => i.published !== false);
const bySlug = <T extends { slug: string; published?: boolean }>(items: T[], slug: string) =>
  published(items).find((i) => i.slug === slug) ?? null;

// MOCK MODE: reads the seed fixtures directly (always the published set).
const mock = {
  services: async () => published(buildServices()).sort((a, b) => a.order - b.order),
  service: async (slug: string) => bySlug(buildServices(), slug),
  solutions: async () => published(buildSolutions()).sort((a, b) => a.order - b.order),
  solution: async (slug: string) => bySlug(buildSolutions(), slug),
  industries: async () => published(buildIndustries()).sort((a, b) => a.order - b.order),
  industry: async (slug: string) => bySlug(buildIndustries(), slug),
  portfolio: async (service?: string) => published(buildPortfolio()).filter((p) => !service || (p.services ?? []).includes(service)),
  portfolioProject: async (slug: string) => bySlug(buildPortfolio(), slug),
  blogPosts: async () => published(buildBlogPosts()),
  blogPost: async (slug: string) => bySlug(buildBlogPosts(), slug),
  blogCategories: async () => buildBlogCategories(),
  technologies: async () => buildTechnologies(),
  faqs: async (category?: string) => buildFaqs().filter((f) => !category || f.category === category),
  // Landing pages exist only in the CMS (no mock fixtures).
  landingPage: async (_slug: string): Promise<LandingPage> => {
    throw new ServiceError('Not found', 404);
  },
  settings: async (): Promise<SiteSettings> => {
    const { id: _id, defaultSeoTitle: _t, defaultSeoDesc: _d, updatedAt: _u, ...publicFields } = buildSettings();
    return publicFields;
  },
};

const get = <T>(path: string, query?: Record<string, string | undefined>) =>
  http.get<T>(path, { revalidate: REVALIDATE_SECONDS, query });

const api = {
  services: () => get<Service[]>('/services'),
  service: (slug: string) => get<Service>(`/services/${encodeURIComponent(slug)}`),
  solutions: () => get<Solution[]>('/solutions'),
  solution: (slug: string) => get<Solution>(`/solutions/${encodeURIComponent(slug)}`),
  industries: () => get<Industry[]>('/industries'),
  industry: (slug: string) => get<Industry>(`/industries/${encodeURIComponent(slug)}`),
  portfolio: (service?: string) => get<PortfolioProject[]>('/portfolio', { service }),
  portfolioProject: (slug: string) => get<PortfolioProject>(`/portfolio/${encodeURIComponent(slug)}`),
  blogPosts: () => get<BlogPost[]>('/blog'),
  blogPost: (slug: string) => get<BlogPost>(`/blog/${encodeURIComponent(slug)}`),
  blogCategories: () => get<BlogCategory[]>('/blog-categories'),
  technologies: () => get<Technology[]>('/technologies'),
  faqs: (category?: string) => get<Faq[]>('/faqs', { category }),
  settings: () => get<SiteSettings>('/settings'),
  landingPage: (slug: string) => get<LandingPage>(`/landing-pages/${encodeURIComponent(slug)}`),
};

const impl: typeof api = isMockMode ? (mock as typeof api) : api;

export const contentService = {
  getServices: () => safe(() => impl.services()),
  getService: (slug: string) => found(() => impl.service(slug)),
  getSolutions: () => safe(() => impl.solutions()),
  getSolution: (slug: string) => found(() => impl.solution(slug)),
  getIndustries: () => safe(() => impl.industries()),
  getIndustry: (slug: string) => found(() => impl.industry(slug)),
  /** Published projects; optionally only those that delivered a given service slug. */
  getPortfolio: (service?: string) => safe(() => impl.portfolio(service)),
  getPortfolioProject: (slug: string) => found(() => impl.portfolioProject(slug)),
  getBlogPosts: () => safe(() => impl.blogPosts()),
  getBlogPost: (slug: string) => found(() => impl.blogPost(slug)),
  getBlogCategories: () => safe(() => impl.blogCategories()),
  getTechnologies: () => safe(() => impl.technologies()),
  getFaqs: (category?: string) => safe(() => impl.faqs(category)),
  getSettings: () => safe(() => impl.settings()),
  getLandingPage: (slug: string) => found(() => impl.landingPage(slug)),
};
