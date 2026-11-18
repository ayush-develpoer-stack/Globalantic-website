export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors: unknown[];
}

export interface ProcessStep {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Service {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  icon?: string;
  shortDesc: string;
  overview: string;
  problem?: string;
  solution?: string;
  features: string[];
  deliverables: string[];
  benefits: string[];
  technologies: string[];
  process: ProcessStep[];
  useCases: string[];
  faqs: FaqItem[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  /** Hero illustration style (browser, mobile, dashboard, ...); null = derived from the slug */
  heroVariant?: string | null;
  /** Who the service is for */
  audience?: string[];
  /** Industry slugs this service is relevant to */
  industries?: string[];
  order: number;
  featured: boolean;
  published: boolean;
  /** Last edit (from the API); used for sitemap lastmod */
  updatedAt?: string;
}

export interface Solution {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  icon?: string;
  shortDesc: string;
  overview: string;
  features: string[];
  benefits: string[];
  technologies: string[];
  useCases: string[];
  faqs: FaqItem[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  order: number;
  published: boolean;
  /** Last edit (from the API); used for sitemap lastmod */
  updatedAt?: string;
}

export interface Industry {
  id: string;
  slug: string;
  title: string;
  tagline?: string;
  icon?: string;
  shortDesc: string;
  overview: string;
  challenges: string[];
  solutions: string[];
  relevantServices: string[];
  features: string[];
  technologies: string[];
  useCases: string[];
  faqs: FaqItem[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  order: number;
  published: boolean;
  /** Last edit (from the API); used for sitemap lastmod */
  updatedAt?: string;
}

export interface PortfolioProject {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  industry?: string;
  client?: string | null;
  challenge?: string;
  requirement?: string;
  approach?: string;
  solution?: string;
  features: string[];
  technologies: string[];
  images: string[];
  gallery: string[];
  /** Dedicated cover (uploaded CMS image or https URL); a designed placeholder is shown when empty */
  coverImage?: string | null;
  coverImageAlt?: string | null;
  outcome?: string | null;
  /** Client name/outcome are only present when the client approved publishing them */
  clientApproved?: boolean;
  /** Service slugs delivered in the project */
  services?: string[];
  /** Approved external links (https only) */
  links?: { label: string; url: string }[];
  publishedAt?: string | null;
  featured: boolean;
  published: boolean;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlogCategory {
  id: string;
  slug: string;
  name: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  coverImageAlt?: string | null;
  author: string;
  tags: string[];
  readingTime: number;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  category?: BlogCategory | null;
}

export interface Technology {
  id: string;
  name: string;
  category: string;
  icon?: string;
  order: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
}

export interface SiteSettings {
  companyName: string;
  logoUrl?: string | null;
  email: string;
  /** Second public contact email (null when not configured) */
  secondaryEmail?: string | null;
  phone: string;
  whatsapp: string;
  address: string;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  youtubeUrl?: string | null;
  footerDescription: string;
  ctaText: string;
  /** Official Google Maps link (null until an admin configures the verified office) */
  mapUrl?: string | null;
  /** Google Maps embed src (keyless) */
  mapEmbedUrl?: string | null;
}

/** Campaign landing page (/lp/[slug]) with the service it promotes. */
export interface LandingPage {
  id: string;
  slug: string;
  serviceSlug: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  ctaLabel: string;
  priceNote: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  indexable: boolean;
  service: Service;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Lists, pagination and service errors (shared by mock + API implementations)
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

/** Query for any admin list. Every field is optional; services apply defaults. */
export interface ListQuery {
  search?: string;
  /** Status / published filter value; 'ALL' or undefined means no filter. */
  status?: string;
  sort?: string;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface FieldError {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Admin: leads
// ---------------------------------------------------------------------------

export const CONTACT_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const TRAINING_STATUSES = ['NEW', 'CONTACTED', 'SHORTLISTED', 'JOINED', 'REJECTED', 'COMPLETED'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const CAREER_STATUSES = ['NEW', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'HIRED', 'REJECTED'] as const;
export type CareerStatus = (typeof CAREER_STATUSES)[number];

export const SUBSCRIBER_STATUSES = ['SUBSCRIBED', 'UNSUBSCRIBED'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export type TrainingMode = 'OFFLINE' | 'ONLINE';

export interface ContactLead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service: string | null;
  budget: string | null;
  message: string;
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingApplication {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string;
  age: number | null;
  qualification: string;
  college: string | null;
  city: string | null;
  mode: TrainingMode;
  codingExperience: string | null;
  whyJoin: string | null;
  preferredContactTime: string | null;
  status: TrainingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CareerApplication {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string;
  resumeUrl: string | null;
  portfolioUrl: string | null;
  message: string | null;
  status: CareerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Admin: dashboard, settings, CMS
// ---------------------------------------------------------------------------

export interface DashboardStats {
  totalLeads: number;
  newLeads: number;
  trainingApplications: number;
  careerApplications: number;
  portfolioProjects: number;
  publishedPosts: number;
  subscribers: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentLeads: ContactLead[];
}

/** Full settings record as edited in the admin (public SiteSettings is a subset). */
export interface AdminSettings extends SiteSettings {
  id: string;
  defaultSeoTitle: string;
  defaultSeoDesc: string;
  updatedAt: string;
}

export type CmsResource = 'services' | 'solutions' | 'industries' | 'portfolio' | 'blog';

/** A CMS record as the admin table sees it: an id, a slug, a title and loose fields. */
export type CmsRecord = { id: string; slug: string; title: string; published: boolean } & Record<string, unknown>;
