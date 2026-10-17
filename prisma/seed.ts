import { PrismaClient } from '@prisma/client';
// Resolved from backend/ (bcryptjs is a backend dependency; prisma/ has no node_modules of its own).
import { hashPassword } from '../backend/src/utils/password';
// Loads backend/.env via the backend's own config (dotenv is a backend dependency).
import '../backend/src/config/env';
import { services } from './data/services';
import { serviceSeo } from './data/seo';
import { extraServices, serviceExtras } from './data/services-extra';
import { solutions } from './data/solutions';
import { industries } from './data/industries';
import { technologies, faqs, blogCategories } from './data/reference';
import { blogPosts } from './data/blog';


const prisma = new PrismaClient();

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@globalantic.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME ?? 'Globalantic Admin';
  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash, role: 'ADMIN' },
  });
  console.log(`✓ Admin user ready: ${email}`);
}

async function seedServices() {
  // Existing rows keep whatever editors changed in the CMS: only empty new fields
  // (hero style, audience, industries) are filled in. Missing services are created.
  const all = [...services, ...extraServices];
  let created = 0;
  for (const s of all) {
    const extras = serviceExtras[s.slug];
    const existing = await prisma.service.findUnique({ where: { slug: s.slug } });
    if (existing) {
      const fill: Record<string, unknown> = {};
      if (extras && !existing.heroVariant) fill.heroVariant = extras.heroVariant;
      if (extras && Array.isArray(existing.audience) && existing.audience.length === 0) fill.audience = extras.audience;
      if (extras && Array.isArray(existing.industries) && existing.industries.length === 0) fill.industries = extras.industries;
      if (Object.keys(fill).length) await prisma.service.update({ where: { slug: s.slug }, data: fill });
      continue;
    }
    await prisma.service.create({
      data: {
        slug: s.slug,
        title: s.title,
        tagline: s.tagline,
        icon: s.icon,
        shortDesc: s.shortDesc,
        overview: s.overview,
        problem: s.problem,
        solution: s.solution,
        features: s.features,
        deliverables: s.deliverables,
        benefits: s.benefits,
        technologies: s.technologies,
        process: s.process as unknown as object[],
        useCases: s.useCases,
        faqs: s.faqs as unknown as object[],
        order: s.order,
        featured: s.featured,
        seoTitle: serviceSeo[s.slug]?.title ?? `${s.title} Services | Globalantic`,
        seoDescription: serviceSeo[s.slug]?.description ?? s.shortDesc,
        published: true,
        heroVariant: extras?.heroVariant ?? null,
        audience: extras?.audience ?? [],
        industries: extras?.industries ?? [],
      },
    });
    created += 1;
  }
  console.log(`✓ Services ready (${all.length} total, ${created} created)`);
}

async function seedSolutions() {
  for (const s of solutions) {
    await prisma.solution.upsert({
      where: { slug: s.slug },
      update: {
        title: s.title,
        tagline: s.tagline,
        icon: s.icon,
        shortDesc: s.shortDesc,
        overview: s.overview,
        features: s.features,
        benefits: s.benefits,
        technologies: s.technologies,
        useCases: s.useCases,
        faqs: s.faqs,
        order: s.order,
        seoTitle: `${s.title} | Globalantic`,
        seoDescription: s.shortDesc,
        published: true,
      },
      create: {
        slug: s.slug,
        title: s.title,
        tagline: s.tagline,
        icon: s.icon,
        shortDesc: s.shortDesc,
        overview: s.overview,
        features: s.features,
        benefits: s.benefits,
        technologies: s.technologies,
        useCases: s.useCases,
        faqs: s.faqs,
        order: s.order,
        seoTitle: `${s.title} | Globalantic`,
        seoDescription: s.shortDesc,
        published: true,
      },
    });
  }
  console.log(`✓ Seeded ${solutions.length} solutions`);
}

async function seedIndustries() {
  for (const i of industries) {
    await prisma.industry.upsert({
      where: { slug: i.slug },
      update: {
        title: i.title,
        tagline: i.tagline,
        icon: i.icon,
        shortDesc: i.shortDesc,
        overview: i.overview,
        challenges: i.challenges,
        solutions: i.solutions,
        relevantServices: i.relevantServices,
        features: i.features,
        technologies: i.technologies,
        useCases: i.useCases,
        faqs: i.faqs,
        order: i.order,
        seoTitle: `${i.title} Software Solutions | Globalantic`,
        seoDescription: i.shortDesc,
        published: true,
      },
      create: {
        slug: i.slug,
        title: i.title,
        tagline: i.tagline,
        icon: i.icon,
        shortDesc: i.shortDesc,
        overview: i.overview,
        challenges: i.challenges,
        solutions: i.solutions,
        relevantServices: i.relevantServices,
        features: i.features,
        technologies: i.technologies,
        useCases: i.useCases,
        faqs: i.faqs,
        order: i.order,
        seoTitle: `${i.title} Software Solutions | Globalantic`,
        seoDescription: i.shortDesc,
        published: true,
      },
    });
  }
  console.log(`✓ Seeded ${industries.length} industries`);
}

async function seedReference() {
  for (const t of technologies) {
    await prisma.technology.upsert({
      where: { name: t.name },
      update: { category: t.category, order: t.order },
      create: t,
    });
  }
  console.log(`✓ Seeded ${technologies.length} technologies`);

  // FAQs have no natural unique key; reset and insert.
  await prisma.fAQ.deleteMany({ where: { category: 'general' } });
  for (const f of faqs) {
    await prisma.fAQ.create({ data: f });
  }
  console.log(`✓ Seeded ${faqs.length} FAQs`);

  for (const c of blogCategories) {
    await prisma.blogCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: c,
    });
  }
  console.log(`✓ Seeded ${blogCategories.length} blog categories`);
}

async function seedBlog() {
  for (const p of blogPosts) {
    const category = await prisma.blogCategory.findUnique({ where: { slug: p.categorySlug } });
    await prisma.blogPost.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        tags: p.tags,
        readingTime: p.readingTime,
        categoryId: category?.id ?? null,
        seoTitle: `${p.title} | Globalantic Blog`,
        seoDescription: p.excerpt,
        published: true,
        publishedAt: new Date(),
      },
      create: {
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        content: p.content,
        tags: p.tags,
        readingTime: p.readingTime,
        author: 'Globalantic',
        categoryId: category?.id ?? null,
        seoTitle: `${p.title} | Globalantic Blog`,
        seoDescription: p.excerpt,
        published: true,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`✓ Seeded ${blogPosts.length} blog posts`);
}

async function seedSettings() {
  const existing = await prisma.siteSetting.findFirst();
  const data = {
    companyName: 'Globalantic',
    email: 'hello@globalantic.com',
    address: 'Bhopal, India',
    footerDescription:
      'Globalantic builds digital products, software and technology solutions that help businesses grow.',
    defaultSeoTitle: 'Globalantic — IT & Digital Solutions Company',
    defaultSeoDesc:
      'We build websites, software, mobile apps, AI solutions and business systems that move businesses forward.',
    ctaText: 'Get Free Consultation',
  };
  if (existing) {
    await prisma.siteSetting.update({ where: { id: existing.id }, data });
  } else {
    await prisma.siteSetting.create({ data });
  }
  console.log('✓ Site settings ready');
}

async function main() {
  console.log('Seeding database...');
  await seedAdmin();
  await seedServices();
  await seedSolutions();
  await seedIndustries();
  await seedReference();
  await seedBlog();
  await seedSettings();
  console.log('✓ Seeding complete');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
