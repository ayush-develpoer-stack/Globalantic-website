/**
 * Search titles and meta descriptions per service page, written for the main search intent
 * of each page (see docs/KEYWORD_AND_PAGE_MAP.md). Capability statements only: no rankings,
 * results, prices or guarantees. The brand is appended by the site, so titles omit it.
 *
 * Used by the seeds and by prisma/seed-services.ts, which only fills pages whose SEO fields
 * are empty or still the old auto-generated default — anything edited in the CMS is kept.
 */
export interface SeoCopy {
  title: string;
  description: string;
}

export const serviceSeo: Record<string, SeoCopy> = {
  'web-development': {
    title: 'Website Development Services — Fast & SEO-Ready',
    description: 'Business websites that load fast, work on every device and are easy to update — built on modern frameworks with SEO basics included. Free consultation.',
  },
  'web-application-development': {
    title: 'Web Application Development — Portals & SaaS',
    description: 'Custom web applications for customers and teams: portals, dashboards, booking systems and SaaS products, built in iterations with regular demos.',
  },
  'software-development': {
    title: 'Custom Software Development for Business Workflows',
    description: 'Custom software designed around your workflows — internal tools, automation and business systems that replace spreadsheets and disconnected apps.',
  },
  'mobile-app-development': {
    title: 'Mobile App Development — Android & iOS Apps',
    description: 'Android and iOS apps from a single codebase: customer apps, staff and field apps, with an admin panel and API. Clear scope before work starts.',
  },
  'ai-solutions': {
    title: 'AI Development & Business Automation Services',
    description: 'Practical AI features and workflow automation: chat assistants, document processing, data extraction and automated follow-ups connected to your systems.',
  },
  'crm-development': {
    title: 'Custom CRM Development — Leads, Sales & Follow-ups',
    description: 'A CRM built around your sales process: lead capture, pipeline stages, follow-up reminders, roles and reports, integrated with your website and WhatsApp.',
  },
  'erp-development': {
    title: 'Custom ERP Development — Inventory, Finance & HR',
    description: 'Custom ERP software that connects inventory, purchasing, sales, finance and HR in one system, designed for how your business actually runs.',
  },
  'ecommerce-development': {
    title: 'E-commerce Website Development with Payments',
    description: 'Online stores with product catalogues, secure payments, order management and an easy admin — for brands, retailers and B2B sellers.',
  },
  'ui-ux-design': {
    title: 'UI/UX Design Services — Websites, Apps & Dashboards',
    description: 'User research, wireframes, interface design and design systems for websites, apps and dashboards, reviewed with you at each step.',
  },
  'api-integration': {
    title: 'API Development & Integration Services',
    description: 'REST APIs and integrations that connect your website, CRM, payment gateway and other tools so data moves without manual entry.',
  },
  'cloud-services': {
    title: 'Cloud Hosting, Deployment & DevOps Services',
    description: 'Cloud hosting, deployments, backups and monitoring for websites and applications, set up so releases are repeatable and your data is safe.',
  },
  'website-maintenance': {
    title: 'Website Maintenance & Support Services',
    description: 'Ongoing website care: updates, security fixes, backups, content changes, performance checks and bug fixes for sites without an in-house developer.',
  },
  seo: {
    title: 'SEO Services — Technical SEO, Content & Local Search',
    description: 'Technical SEO audits, on-page fixes, content planning and Search Console reporting. Honest priorities and reporting; no guaranteed-ranking promises.',
  },
  aeo: {
    title: 'AEO — Answer Engine Optimization Services',
    description: 'Make your content easy for search engines and answer engines to understand: clear answers, FAQs, structured data and well-organised pages.',
  },
  geo: {
    title: 'GEO — Generative Engine Optimization Services',
    description: 'Help AI assistants describe your business accurately: consistent entity information, authoritative service content and crawlable pages. No citation is guaranteed.',
  },
  'digital-marketing': {
    title: 'Digital Marketing Services for Lead Generation',
    description: 'Digital marketing planned around enquiries: search, social, ads and content, with tracking from first visit to enquiry and honest reporting.',
  },
  'social-media-marketing': {
    title: 'Social Media Marketing & Content Management',
    description: 'Social media content calendars, posts and campaigns for Instagram, Facebook and LinkedIn, planned around your audience and business goals.',
  },
  'google-meta-ads': {
    title: 'Google Ads & Meta Ads Management',
    description: 'Google Ads and Meta (Facebook and Instagram) ad campaigns with conversion tracking, landing pages and regular reporting on cost per enquiry.',
  },
  branding: {
    title: 'Branding — Logo Design, Identity & Brand Guidelines',
    description: 'Brand identity design: logo, colour palette, typography and brand guidelines for new businesses and companies refreshing an outdated identity.',
  },
};

/** The default the old seeds wrote; seed-services.ts treats it as "not edited". */
export const legacyServiceSeoTitle = (title: string) => `${title} Services | Globalantic`;
