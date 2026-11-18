// Copied verbatim from prisma/data/reference.ts — the seed data is the source of truth.
// Re-copy when the seed changes. Used only in mock mode (lib/mock).

export interface TechnologySeed {
  name: string;
  category: string;
  order: number;
}

export const technologies: TechnologySeed[] = [
  // Frontend
  { name: 'React', category: 'Frontend', order: 1 },
  { name: 'Next.js', category: 'Frontend', order: 2 },
  { name: 'TypeScript', category: 'Frontend', order: 3 },
  { name: 'JavaScript', category: 'Frontend', order: 4 },
  { name: 'HTML', category: 'Frontend', order: 5 },
  { name: 'CSS', category: 'Frontend', order: 6 },
  // Backend
  { name: 'Node.js', category: 'Backend', order: 1 },
  { name: 'Express.js', category: 'Backend', order: 2 },
  { name: 'PHP', category: 'Backend', order: 3 },
  { name: 'Laravel', category: 'Backend', order: 4 },
  // Database
  { name: 'PostgreSQL', category: 'Database', order: 1 },
  { name: 'MySQL', category: 'Database', order: 2 },
  { name: 'MongoDB', category: 'Database', order: 3 },
  // Mobile
  { name: 'React Native', category: 'Mobile', order: 1 },
  // CMS
  { name: 'WordPress', category: 'CMS', order: 1 },
  { name: 'Strapi', category: 'CMS', order: 2 },
  // Cloud
  { name: 'Vercel', category: 'Cloud', order: 1 },
  { name: 'Render', category: 'Cloud', order: 2 },
  { name: 'Supabase', category: 'Cloud', order: 3 },
  { name: 'Cloudinary', category: 'Cloud', order: 4 },
  // AI
  { name: 'OpenAI', category: 'AI', order: 1 },
  { name: 'Gemini', category: 'AI', order: 2 },
  { name: 'OpenRouter', category: 'AI', order: 3 },
];

export interface FaqSeed {
  question: string;
  answer: string;
  category: string;
  order: number;
}

export const faqs: FaqSeed[] = [
  {
    question: 'What services does Globalantic offer?',
    answer:
      'We offer web development, software development, mobile apps, AI solutions, CRM and ERP development, e-commerce, UI/UX design, cloud services and digital marketing including SEO and paid ads.',
    category: 'general',
    order: 1,
  },
  {
    question: 'How do I get started with a project?',
    answer:
      'Reach out through our contact form for a free consultation. We will discuss your goals, understand your requirements and propose a clear plan and timeline.',
    category: 'general',
    order: 2,
  },
  {
    question: 'Do you work with businesses outside Bhopal?',
    answer:
      'Yes. We work with clients across India and beyond, collaborating remotely with regular communication and clear checkpoints.',
    category: 'general',
    order: 3,
  },
  {
    question: 'Do we own the code and content you build?',
    answer:
      'Yes. On project completion, you receive full ownership of the source code, assets and documentation.',
    category: 'general',
    order: 4,
  },
  {
    question: 'Do you provide ongoing support after launch?',
    answer:
      'Yes. We offer maintenance and support plans to keep your product secure, updated and improving over time.',
    category: 'general',
    order: 5,
  },
];

export interface BlogCategorySeed {
  slug: string;
  name: string;
}

export const blogCategories: BlogCategorySeed[] = [
  { slug: 'web-development', name: 'Web Development' },
  { slug: 'software-development', name: 'Software Development' },
  { slug: 'ai', name: 'AI' },
  { slug: 'digital-marketing', name: 'Digital Marketing' },
  { slug: 'seo', name: 'SEO' },
  { slug: 'business-technology', name: 'Business Technology' },
  { slug: 'cybersecurity', name: 'Cybersecurity' },
  { slug: 'cloud', name: 'Cloud' },
  { slug: 'ecommerce', name: 'E-commerce' },
  { slug: 'startup-technology', name: 'Startup Technology' },
];
