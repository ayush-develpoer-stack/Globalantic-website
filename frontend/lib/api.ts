import { contentService } from '@/services/content.service';

/**
 * Public content accessors used by server components and the sitemap.
 * Kept as the stable import surface for pages; the implementation (mock
 * fixtures or the REST API) is chosen in services/content.service.ts.
 * Every function resolves to `null` on failure so pages render fallbacks.
 */

// ---- Services ----
export const getServices = contentService.getServices;
export const getService = contentService.getService;

// ---- Solutions ----
export const getSolutions = contentService.getSolutions;
export const getSolution = contentService.getSolution;

// ---- Industries ----
export const getIndustries = contentService.getIndustries;
export const getIndustry = contentService.getIndustry;

// ---- Portfolio ----
export const getPortfolio = contentService.getPortfolio;
export const getPortfolioProject = contentService.getPortfolioProject;

// ---- Blog ----
export const getBlogPosts = contentService.getBlogPosts;
export const getBlogPost = contentService.getBlogPost;
export const getBlogCategories = contentService.getBlogCategories;

// ---- Reference ----
export const getTechnologies = contentService.getTechnologies;
export const getFaqs = contentService.getFaqs;
export const getSettings = contentService.getSettings;
export const getLandingPage = contentService.getLandingPage;
