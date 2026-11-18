import { z, type ZodTypeAny } from 'zod';
import {
  CAREER_STATUSES,
  CONTACT_STATUSES,
  SUBSCRIBER_STATUSES,
  TRAINING_STATUSES,
  type CmsResource,
  type FieldError,
} from '@/types';

/**
 * Admin schemas — mirror backend/src/validators/index.ts (CMS content,
 * settings, lead status). Used by the admin forms and by the mock services,
 * so mock mode rejects what the real API would reject.
 */

const opt = (max?: number) => {
  const base = max ? z.string().trim().max(max, `Must be ${max} characters or fewer`) : z.string();
  return base.optional().or(z.literal(''));
};
const required = (label: string, max?: number) => {
  const base = z.string().trim().min(1, `${label} is required`);
  return max ? base.max(max, `${label} must be ${max} characters or fewer`) : base;
};
const slug = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens (e.g. web-development)');
const list = z.array(z.any()).optional();
const order = z.coerce.number({ invalid_type_error: 'Order must be a number' }).int('Order must be a whole number').optional();
const seo = {
  seoTitle: z.string().max(200, 'SEO title must be 200 characters or fewer').optional().or(z.literal('')),
  seoDescription: z.string().max(400, 'SEO description must be 400 characters or fewer').optional().or(z.literal('')),
  ogImage: opt(),
};

export const serviceSchema = z.object({
  slug,
  title: required('Title', 200),
  tagline: opt(300),
  icon: opt(60),
  shortDesc: required('Short description', 500),
  overview: required('Overview'),
  problem: opt(),
  solution: opt(),
  features: list,
  deliverables: list,
  benefits: list,
  technologies: list,
  process: list,
  useCases: list,
  faqs: list,
  ...seo,
  order,
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
});

export const solutionSchema = z.object({
  slug,
  title: required('Title', 200),
  tagline: opt(300),
  icon: opt(60),
  shortDesc: required('Short description', 500),
  overview: required('Overview'),
  features: list,
  benefits: list,
  technologies: list,
  useCases: list,
  faqs: list,
  ...seo,
  order,
  published: z.boolean().optional(),
});

export const industrySchema = z.object({
  slug,
  title: required('Title', 200),
  tagline: opt(300),
  icon: opt(60),
  shortDesc: required('Short description', 500),
  overview: required('Overview'),
  challenges: list,
  solutions: list,
  relevantServices: list,
  features: list,
  technologies: list,
  useCases: list,
  faqs: list,
  ...seo,
  order,
  published: z.boolean().optional(),
});

export const portfolioSchema = z.object({
  slug,
  title: required('Title', 200),
  shortDescription: required('Short description', 500),
  description: required('Description'),
  category: required('Category', 120),
  industry: opt(120),
  client: opt(160),
  challenge: opt(),
  requirement: opt(),
  approach: opt(),
  solution: opt(),
  features: list,
  technologies: list,
  images: list,
  gallery: list,
  outcome: opt(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  order,
  ...seo,
});

export const blogSchema = z.object({
  slug,
  title: required('Title', 200),
  excerpt: required('Excerpt', 500),
  content: required('Content'),
  coverImage: opt(),
  author: z.string().trim().max(120).optional(),
  categoryId: opt(),
  tags: list,
  readingTime: z.coerce.number({ invalid_type_error: 'Reading time must be a number' }).int().min(1, 'Reading time must be at least 1 minute').optional(),
  ...seo,
  canonicalUrl: opt(),
  published: z.boolean().optional(),
});

export const cmsSchemas: Record<CmsResource, z.AnyZodObject> = {
  services: serviceSchema,
  solutions: solutionSchema,
  industries: industrySchema,
  portfolio: portfolioSchema,
  blog: blogSchema,
};

const optionalUrl = z.string().trim().url('Enter a full URL starting with https://').optional().or(z.literal(''));

export const settingsSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(160),
  logoUrl: optionalUrl,
  email: z.string().trim().email('Enter a valid email address'),
  phone: opt(40),
  whatsapp: opt(40),
  address: opt(300),
  facebookUrl: optionalUrl,
  instagramUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  twitterUrl: optionalUrl,
  youtubeUrl: optionalUrl,
  footerDescription: opt(600),
  defaultSeoTitle: z.string().trim().min(1, 'Default SEO title is required').max(200),
  defaultSeoDesc: opt(400),
  ctaText: z.string().trim().min(1, 'CTA text is required').max(80),
  // Same rules as the API: only official Google Maps URLs (keyless embed).
  mapUrl: z
    .string()
    .trim()
    .max(600)
    .refine((v) => v === '' || /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)\//.test(v), 'Use a Google Maps link (https://maps.app.goo.gl/… or https://www.google.com/maps/…)')
    .optional(),
  mapEmbedUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/www\.google\.com\/maps\/embed\?pb=[\w!.%:*-]+$/.test(v), 'Paste the src of the Google Maps embed code (https://www.google.com/maps/embed?pb=…)')
    .optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const statusSchemas = {
  contacts: z.object({ status: z.enum(CONTACT_STATUSES) }),
  training: z.object({ status: z.enum(TRAINING_STATUSES) }),
  careers: z.object({ status: z.enum(CAREER_STATUSES) }),
  newsletter: z.object({ status: z.enum(SUBSCRIBER_STATUSES) }),
} as const;

/** Converts a Zod failure into the FieldError[] shape the backend returns. */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));
}

/** Validates and returns parsed data, or the field errors. */
export function validate<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; errors: FieldError[] } {
  const result = schema.safeParse(data);
  return result.success ? { ok: true, data: result.data } : { ok: false, errors: toFieldErrors(result.error) };
}

/** CMS FAQ — mirrors backend faqSchema (backend/src/validators/index.ts). */
export const faqSchema = z.object({
  question: z.string().trim().min(5, 'Question must be at least 5 characters').max(300, 'Question must be 300 characters or fewer'),
  answer: z.string().trim().min(5, 'Answer must be at least 5 characters').max(4000, 'Answer must be 4000 characters or fewer'),
  category: z
    .string()
    .trim()
    .min(2, 'Category must be at least 2 characters')
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens (e.g. training)'),
  order: z.coerce.number({ invalid_type_error: 'Order must be a number' }).int('Order must be a whole number').min(0, 'Order cannot be negative').max(10_000),
});
export type FaqInput = z.infer<typeof faqSchema>;
