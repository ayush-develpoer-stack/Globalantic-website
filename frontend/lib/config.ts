export const siteConfig = {
  name: 'Globalantic',
  legalName: 'Globalantic',
  description:
    'Globalantic builds websites, software, mobile apps, AI solutions and business systems that move businesses forward.',
  tagline: 'IT & Digital Solutions',
  url: process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://globalantic.com' : 'http://localhost:3000'),
  /** Home page title: what the company does, in the words people search with. */
  homeTitle: 'Globalantic — Software, Web & App Development Company, Bhopal',
  /** Primary public contact email (verified). Admin site settings can override it. */
  email: 'info@globalantic.com',
  /** Second public contact email (verified), shown next to the primary one. */
  secondaryEmail: 'info.globalantic@gmail.com',
  /** Published location is the city only (no street address, map or local-business address). */
  location: 'Bhopal, India',
  city: 'Bhopal',
  region: 'Madhya Pradesh',
  /** Approved founder facts: name and title only, until verified biography/profile links are supplied. */
  founder: { name: 'Ayush Ahirwar', title: 'Founder' },
  /** Service lines (used as Organization.knowsAbout). */
  expertise: [
    'Website development',
    'Web application development',
    'Custom software development',
    'Mobile app development',
    'CRM development',
    'ERP development',
    'AI solutions and business automation',
    'E-commerce development',
    'UI/UX design',
    'API development and integration',
    'Cloud services',
    'Search engine optimization (SEO)',
    'Answer engine optimization (AEO)',
    'Generative engine optimization (GEO)',
    'Digital marketing',
  ],
  ogImage: '/og-image.png',
  // Optional contact channels. Set via env; when empty, dependent UI links fall
  // back to the contact page instead of rendering a dead link.
  /** Business phone (also WhatsApp). Override with NEXT_PUBLIC_PHONE. */
  phone: process.env.NEXT_PUBLIC_PHONE || '+91 76978 45157',
  /** Official business WhatsApp (international digits, India +91). Override with NEXT_PUBLIC_WHATSAPP. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || '917697845157',
  /** Optional consultation booking page (e.g. a Calendly link). Hidden when unset — never a dead link. */
  bookingUrl: process.env.NEXT_PUBLIC_BOOKING_URL ?? '',
  /** Training platform (courses, batches, fees, admissions). */
  trainingUrl: (process.env.NEXT_PUBLIC_TRAINING_URL || (process.env.NODE_ENV === 'production' ? 'https://training.globalantic.com' : 'http://localhost:3001')).replace(/\/+$/, ''),
};

/** Default WhatsApp greeting; service pages pass their service name. */
/** tel: link for a display phone number (digits and a leading +). */
export function telHref(phone: string = siteConfig.phone): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 8 ? `tel:${digits}` : null;
}

export function whatsappMessage(service?: string | null, reference?: string | null): string {
  const about = service ? `your ${service} services` : 'your website/software development services';
  const ref = reference ? ` (enquiry ${reference})` : '';
  return `Hello Globalantic, I am interested in ${about}${ref}. I would like to discuss my project.`;
}

/**
 * wa.me link to the business number with a pre-filled message (works on mobile and desktop).
 * It only opens a chat: messages are NOT synced to the CRM.
 */
export function whatsappUrl(message?: string): string | null {
  const digits = siteConfig.whatsapp.replace(/\D/g, '');
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}

export const mainNav = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Services', href: '/services' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Industries', href: '/industries' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Blog', href: '/blog' },
  { label: 'Careers', href: '/careers' },
  { label: 'Training', href: '/training' },
  { label: 'Contact', href: '/contact' },
];

/** Desktop header row: the logo links home and Careers lives in the footer/mobile menu, so the row fits at 1181px+. */
export const desktopNav = mainNav.filter((item) => item.href !== '/' && item.href !== '/careers');

export const footerNav = {
  company: [
    { label: 'About', href: '/about' },
    { label: 'Request a Quote', href: '/get-a-quote' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Training', href: '/training' },
    { label: 'Contact', href: '/contact' },
  ],
  services: [
    { label: 'Web Development', href: '/services/web-development' },
    { label: 'Web Application Development', href: '/services/web-application-development' },
    { label: 'Software Development', href: '/services/software-development' },
    { label: 'Mobile App Development', href: '/services/mobile-app-development' },
    { label: 'AI Solutions & Automation', href: '/services/ai-solutions' },
    { label: 'CRM Development', href: '/services/crm-development' },
    { label: 'ERP Development', href: '/services/erp-development' },
    { label: 'E-commerce Development', href: '/services/ecommerce-development' },
    { label: 'UI/UX Design', href: '/services/ui-ux-design' },
    { label: 'API Development & Integration', href: '/services/api-integration' },
    { label: 'Cloud Services', href: '/services/cloud-services' },
    { label: 'Website Maintenance & Support', href: '/services/website-maintenance' },
    { label: 'SEO', href: '/services/seo' },
    { label: 'AEO — Answer Engine Optimization', href: '/services/aeo' },
    { label: 'GEO — Generative Engine Optimization', href: '/services/geo' },
    { label: 'Digital Marketing', href: '/services/digital-marketing' },
    { label: 'Social Media Marketing', href: '/services/social-media-marketing' },
    { label: 'Google & Meta Ads', href: '/services/google-meta-ads' },
    { label: 'Branding', href: '/services/branding' },
  ],
  solutions: [
    { label: 'CRM', href: '/solutions/crm' },
    { label: 'ERP', href: '/solutions/erp' },
    { label: 'E-commerce', href: '/solutions/ecommerce' },
    { label: 'Custom SaaS', href: '/solutions/custom-saas' },
    { label: 'Business Dashboard', href: '/solutions/business-dashboard' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Refund Policy', href: '/refund-policy' },
  ],
};

/** Static list used for the Services mega-menu and homepage fallbacks. */
export const serviceLinks = [
  { label: 'Web Development', href: '/services/web-development', icon: 'Globe' },
  { label: 'Web Application Development', href: '/services/web-application-development', icon: 'AppWindow' },
  { label: 'Software Development', href: '/services/software-development', icon: 'Code2' },
  { label: 'Mobile App Development', href: '/services/mobile-app-development', icon: 'Smartphone' },
  { label: 'AI Solutions', href: '/services/ai-solutions', icon: 'Sparkles' },
  { label: 'CRM Development', href: '/services/crm-development', icon: 'Users' },
  { label: 'ERP Development', href: '/services/erp-development', icon: 'Building2' },
  { label: 'E-commerce Development', href: '/services/ecommerce-development', icon: 'ShoppingCart' },
  { label: 'UI/UX Design', href: '/services/ui-ux-design', icon: 'Palette' },
  { label: 'API Development & Integration', href: '/services/api-integration', icon: 'Plug' },
  { label: 'Cloud Services', href: '/services/cloud-services', icon: 'Cloud' },
  { label: 'Website Maintenance & Support', href: '/services/website-maintenance', icon: 'Wrench' },
  { label: 'Digital Marketing', href: '/services/digital-marketing', icon: 'TrendingUp' },
  { label: 'SEO', href: '/services/seo', icon: 'Search' },
  { label: 'AEO', href: '/services/aeo', icon: 'MessageSquareText' },
  { label: 'GEO', href: '/services/geo', icon: 'Sparkles' },
  { label: 'Social Media Marketing', href: '/services/social-media-marketing', icon: 'Share2' },
  { label: 'Google & Meta Ads', href: '/services/google-meta-ads', icon: 'Target' },
  { label: 'Branding', href: '/services/branding', icon: 'Feather' },
];

/** Services offered in enquiry forms (Globalantic's actual service lines). */
export const SERVICE_OPTIONS = [
  'Web Development',
  'Web Application Development',
  'Custom Software Development',
  'CRM Development',
  'ERP Development',
  'Mobile App Development',
  'AI Solutions & Automation',
  'E-commerce Development',
  'UI/UX Design',
  'SEO',
  'Digital Marketing',
  'Cloud Services',
  'API Integration',
  'IT Support',
  'Website Maintenance & Support',
  'Social Media Marketing',
  'AEO (Answer Engine Optimization)',
  'GEO (Generative Engine Optimization)',
  'Branding',
  'Other',
] as const;

/** Budget ranges (enquirer's estimate — not a price list). */
export const BUDGET_OPTIONS = ['< ₹50k', '₹50k–₹1L', '₹1L–₹5L', '₹5L+', 'Not sure yet'] as const;

export const TIMELINE_OPTIONS = ['As soon as possible', 'Within 1 month', '1–3 months', '3–6 months', 'Just exploring'] as const;
