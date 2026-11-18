import { z } from 'zod';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().email('A valid email is required'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  company: z.string().trim().max(160).optional().or(z.literal('')),
  service: z.string().trim().max(120).optional().or(z.literal('')),
  budget: z.string().trim().max(80).optional().or(z.literal('')),
  message: z.string().trim().min(10, 'Please provide a few more details').max(4000),
  // ---- Sales-engine fields (all optional, so older clients keep working) ----
  timeline: z.string().trim().max(80).optional().or(z.literal('')),
  contactPreference: z.enum(['email', 'phone', 'whatsapp']).optional().or(z.literal('')),
  marketingConsent: z.boolean().optional(),
  /** Which form/page sent it, e.g. contact_page, quote_page, service_page:<slug> */
  source: z.string().trim().max(80).regex(/^[a-z0-9_:.-]*$/i, 'Invalid source').optional().or(z.literal('')),
  landingPage: z.string().trim().max(300).optional().or(z.literal('')),
  referrer: z.string().trim().max(300).optional().or(z.literal('')),
  utmSource: z.string().trim().max(100).optional().or(z.literal('')),
  utmMedium: z.string().trim().max(100).optional().or(z.literal('')),
  utmCampaign: z.string().trim().max(150).optional().or(z.literal('')),
  utmTerm: z.string().trim().max(150).optional().or(z.literal('')),
  utmContent: z.string().trim().max(150).optional().or(z.literal('')),
  /** Honeypot: hidden from people; bots fill it. */
  website: z.string().max(200).optional(),
  /** ms since the form was shown (spam check: humans take more than a couple of seconds). */
  elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
});

/** Anonymous CTA / WhatsApp click (no personal data accepted). */
export const trackEventSchema = z.object({
  type: z.enum(['cta_click', 'whatsapp_click']),
  label: z.string().trim().max(80).optional(),
  page: z.string().trim().max(200).optional(),
  service: z.string().trim().max(120).optional(),
  utmSource: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(150).optional(),
});

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const trainingSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  phone: z.string().trim().min(6, 'A valid phone number is required').max(30),
  whatsapp: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('A valid email is required'),
  age: z.coerce.number().int().min(15).max(80).optional(),
  qualification: z.string().trim().min(2, 'Qualification is required').max(120),
  college: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  mode: z.enum(['OFFLINE', 'ONLINE']),
  codingExperience: z.string().trim().max(120).optional().or(z.literal('')),
  whyJoin: z.string().trim().max(2000).optional().or(z.literal('')),
  preferredContactTime: z.string().trim().max(120).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------

export const careerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().email('A valid email is required'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  position: z.string().trim().min(2, 'Position is required').max(160),
  resumeUrl: z.string().trim().url('A valid URL is required').optional().or(z.literal('')),
  portfolioUrl: z.string().trim().url('A valid URL is required').optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

export const newsletterSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
});

// ---------------------------------------------------------------------------
// Status updates (admin)
// ---------------------------------------------------------------------------

const contactStatus = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'IN_PROGRESS', 'CONVERTED', 'CLOSED']);
const trainingStatus = z.enum(['NEW', 'CONTACTED', 'SHORTLISTED', 'JOINED', 'REJECTED', 'COMPLETED']);
const careerStatus = z.enum(['NEW', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED']);

export const contactStatusSchema = z.object({ status: contactStatus });
export const trainingStatusSchema = z.object({ status: trainingStatus });
export const careerStatusSchema = z.object({ status: careerStatus });

// ---------------------------------------------------------------------------
// Lead list filters (admin query string)
// Unvalidated values used to reach Prisma and fail with a 500; an empty
// `?status=` keeps meaning "no filter". Repeated params (arrays) are rejected.
// ---------------------------------------------------------------------------

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

function leadListQuerySchema<T extends [string, ...string[]]>(status: z.ZodEnum<T>) {
  return z.object({
    status: z.preprocess(emptyToUndefined, status.optional()),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  });
}

export const contactListQuerySchema = leadListQuerySchema(contactStatus);
export const trainingListQuerySchema = leadListQuerySchema(trainingStatus);
export const careerListQuerySchema = leadListQuerySchema(careerStatus);

/** Public FAQ filter: a single short category string (repeated params are rejected). */
export const faqListQuerySchema = z.object({
  category: z.preprocess(emptyToUndefined, z.string().trim().max(60).optional()),
});

// ---------------------------------------------------------------------------
// CMS content (admin) — kept permissive; JSON fields validated as arrays.
// ---------------------------------------------------------------------------

const jsonArray = z.array(z.any()).optional();
const slugField = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');
/** Images: https URLs or files uploaded to this API (/api/files/public/...). */
const imageRef = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^https:\/\//.test(v) || /^\/api\/files\/public\/[0-9a-f-]{36}$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(v), 'Use an https:// image URL or upload the image')
  .optional();
/** Public content titles: a pasted link or upload URL is a form mistake, not a title. */
const contentTitle = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/^(https?:\/\/|\/api\/files\/)/i.test(v), 'The title looks like a link. Put links and images in their own fields.');
const stringList = (max: number, len = 200) => z.array(z.string().trim().min(1).max(len)).max(max).optional();
const isoDateTime = z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).optional();
export const HERO_VARIANTS = ['browser', 'webapp', 'mobile', 'dashboard', 'workflow', 'crm', 'erp', 'commerce', 'design', 'api', 'cloud', 'maintenance', 'search', 'answers', 'generative', 'marketing', 'social', 'ads', 'brand'] as const;

export const serviceSchema = z.object({
  slug: slugField,
  title: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(300).optional().or(z.literal('')),
  icon: z.string().trim().max(60).optional().or(z.literal('')),
  shortDesc: z.string().trim().min(1).max(500),
  overview: z.string().trim().min(1),
  problem: z.string().optional().or(z.literal('')),
  solution: z.string().optional().or(z.literal('')),
  features: jsonArray,
  deliverables: jsonArray,
  benefits: jsonArray,
  technologies: jsonArray,
  process: jsonArray,
  useCases: jsonArray,
  faqs: jsonArray,
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  ogImage: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int().optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  heroVariant: z.enum(HERO_VARIANTS).optional().nullable().or(z.literal('')),
  audience: stringList(10, 80),
  industries: z.array(slugField).max(20).optional(),
});

export const solutionSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(300).optional().or(z.literal('')),
  icon: z.string().trim().max(60).optional().or(z.literal('')),
  shortDesc: z.string().trim().min(1).max(500),
  overview: z.string().trim().min(1),
  features: jsonArray,
  benefits: jsonArray,
  technologies: jsonArray,
  useCases: jsonArray,
  faqs: jsonArray,
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  ogImage: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int().optional(),
  published: z.boolean().optional(),
});

export const industrySchema = z.object({
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  tagline: z.string().trim().max(300).optional().or(z.literal('')),
  icon: z.string().trim().max(60).optional().or(z.literal('')),
  shortDesc: z.string().trim().min(1).max(500),
  overview: z.string().trim().min(1),
  challenges: jsonArray,
  solutions: jsonArray,
  relevantServices: jsonArray,
  features: jsonArray,
  technologies: jsonArray,
  useCases: jsonArray,
  faqs: jsonArray,
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  ogImage: z.string().optional().or(z.literal('')),
  order: z.coerce.number().int().optional(),
  published: z.boolean().optional(),
});

/** updatedAt the editor loaded; a save on top of a newer change returns 409. */
const expectedUpdatedAt = z.string().datetime({ offset: true }).optional();

export const portfolioSchema = z.object({
  slug: slugField,
  title: contentTitle,
  shortDescription: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1).max(120),
  industry: z.string().trim().max(120).optional().or(z.literal('')),
  client: z.string().trim().max(160).optional().or(z.literal('')),
  challenge: z.string().optional().or(z.literal('')),
  requirement: z.string().optional().or(z.literal('')),
  approach: z.string().optional().or(z.literal('')),
  solution: z.string().optional().or(z.literal('')),
  features: jsonArray,
  technologies: jsonArray,
  images: z.array(imageRef.unwrap()).max(10).optional(),
  gallery: z.array(imageRef.unwrap()).max(30).optional(),
  coverImage: imageRef,
  coverImageAlt: z.string().trim().max(200).optional().or(z.literal('')),
  expectedUpdatedAt,
  outcome: z.string().optional().or(z.literal('')),
  /** Staff confirm the client approved publishing their name / outcome. */
  clientApproved: z.boolean().optional(),
  services: z.array(slugField).max(20).optional(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.string().trim().url().refine((u) => u.startsWith('https://'), 'Only https:// links') })).max(10).optional(),
  publishedAt: isoDateTime,
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  order: z.coerce.number().int().optional(),
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  ogImage: imageRef,
});

export const blogSchema = z.object({
  slug: slugField,
  title: contentTitle,
  excerpt: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(200_000),
  coverImage: imageRef,
  coverImageAlt: z.string().trim().max(200).optional().or(z.literal('')),
  expectedUpdatedAt,
  author: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  tags: stringList(20, 40),
  readingTime: z.coerce.number().int().min(1).max(240).optional(),
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  ogImage: imageRef,
  canonicalUrl: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\//.test(v), 'Use an https:// URL').optional(),
  publishedAt: isoDateTime,
  published: z.boolean().optional(),
});

export const blogCategorySchema = z.object({ name: z.string().trim().min(2).max(80), slug: slugField });

export const landingPageSchema = z.object({
  slug: slugField,
  serviceSlug: slugField,
  headline: z.string().trim().min(5).max(160),
  subheadline: z.string().trim().min(10).max(400),
  benefits: stringList(8, 160),
  ctaLabel: z.string().trim().min(3).max(60).optional(),
  /** Only an approved price line; leave empty to show none */
  priceNote: z.string().trim().max(160).optional().or(z.literal('')),
  seoTitle: z.string().max(200).optional().or(z.literal('')),
  seoDescription: z.string().max(400).optional().or(z.literal('')),
  indexable: z.boolean().optional(),
  published: z.boolean().optional(),
});

export const settingsSchema = z.object({
  companyName: z.string().trim().max(160).optional(),
  logoUrl: z.string().optional().or(z.literal('')),
  email: z.string().email().optional(),
  secondaryEmail: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  whatsapp: z.string().max(40).optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  facebookUrl: z.string().optional().or(z.literal('')),
  instagramUrl: z.string().optional().or(z.literal('')),
  linkedinUrl: z.string().optional().or(z.literal('')),
  twitterUrl: z.string().optional().or(z.literal('')),
  youtubeUrl: z.string().optional().or(z.literal('')),
  footerDescription: z.string().max(600).optional().or(z.literal('')),
  defaultSeoTitle: z.string().max(200).optional(),
  defaultSeoDesc: z.string().max(400).optional().or(z.literal('')),
  ctaText: z.string().max(80).optional(),
  /** Official Google Maps link for the verified office */
  mapUrl: z
    .string()
    .trim()
    .max(600)
    .refine((v) => v === '' || /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)\//.test(v), 'Use a Google Maps link (https://maps.app.goo.gl/… or https://www.google.com/maps/…)')
    .optional()
    .nullable(),
  /** Google Maps embed src (Share → Embed a map → the src URL). Keyless. */
  mapEmbedUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/www\.google\.com\/maps\/embed\?pb=[\w!.%:*-]+$/.test(v), 'Paste the src of the Google Maps embed code (https://www.google.com/maps/embed?pb=…)')
    .optional()
    .nullable(),
});

// ---------------------------------------------------------------------------
// CMS FAQs (admin)
// ---------------------------------------------------------------------------
const faqBase = {
  question: z.string().trim().min(5, 'Question is required').max(300),
  answer: z.string().trim().min(5, 'Answer is required').max(4000),
  category: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens').default('general'),
  order: z.coerce.number().int().min(0).max(10_000).default(0),
};
export const faqSchema = z.object(faqBase);
export const faqUpdateSchema = z.object(faqBase).partial();
export const faqIdParam = z.object({ id: z.string().uuid('Invalid id') });
