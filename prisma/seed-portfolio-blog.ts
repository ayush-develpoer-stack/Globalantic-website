/**
 * Real portfolio projects, blog drafts, verified company contact details and notification
 * recipients (2026-10-17). CREATE-ONLY and idempotent:
 *  - projects / posts are created only when their slug does not exist (CMS edits are never overwritten);
 *  - blog posts are created as unpublished drafts;
 *  - site contact fields are filled only when empty or still the old default;
 *  - notification recipients are set only when the settings row does not exist yet.
 * Safe to run against production (after migration 20261022090000):
 *
 *   npx tsx ../prisma/seed-portfolio-blog.ts          (from backend/, uses DATABASE_URL)
 *   npx tsx ../prisma/seed-portfolio-blog.ts --dry    (prints what would change)
 */
import { PrismaClient } from '@prisma/client';
import '../backend/src/config/env';
import { realProjects } from './data/portfolio-real';
import { blogDrafts } from './data/blog-drafts';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');
const log = (msg: string) => console.log(`${dry ? '[dry] ' : ''}${msg}`);

export const COMPANY = {
  email: 'info@globalantic.com',
  secondaryEmail: 'info.globalantic@gmail.com',
  phone: '+91 76978 45157',
  whatsapp: '917697845157',
  notificationRecipients: ['info@globalantic.com', 'info.globalantic@gmail.com'],
};
const OLD_DEFAULT_EMAILS = ['', 'hello@globalantic.com'];

async function main() {
  // ---- Portfolio (published; image placeholders until real screenshots are uploaded) ----
  for (const p of realProjects) {
    if (await prisma.portfolioProject.findUnique({ where: { slug: p.slug }, select: { id: true } })) {
      log(`skip project ${p.slug} (exists)`);
      continue;
    }
    log(`create project ${p.slug}`);
    if (dry) continue;
    await prisma.portfolioProject.create({
      data: {
        slug: p.slug,
        title: p.title,
        category: p.category,
        industry: p.industry,
        client: p.client,
        clientApproved: false,
        shortDescription: p.shortDescription,
        description: p.description,
        requirement: p.requirement ?? null,
        solution: p.solution ?? null,
        features: p.features,
        technologies: p.technologies,
        services: p.services,
        links: p.links,
        images: [],
        gallery: [],
        coverImage: null,
        coverImageAlt: null,
        order: p.order,
        featured: p.featured ?? false,
        published: true,
        publishedAt: new Date(),
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      },
    });
  }

  // ---- Blog drafts (never published by this script) ----
  for (const d of blogDrafts) {
    if (await prisma.blogPost.findUnique({ where: { slug: d.slug }, select: { id: true } })) {
      log(`skip draft ${d.slug} (exists)`);
      continue;
    }
    const category = await prisma.blogCategory.findUnique({ where: { slug: d.categorySlug }, select: { id: true } });
    log(`create draft ${d.slug}${category ? '' : ` (category ${d.categorySlug} missing — left empty)`}`);
    if (dry) continue;
    await prisma.blogPost.create({
      data: {
        slug: d.slug,
        title: d.title,
        excerpt: d.excerpt,
        content: d.content,
        tags: d.tags,
        readingTime: d.readingTime,
        seoTitle: d.seoTitle,
        seoDescription: d.seoDescription,
        author: 'Globalantic',
        published: false,
        publishedAt: null,
        categoryId: category?.id ?? null,
      },
    });
  }

  // ---- Verified company contact details (fill-only) ----
  const s = await prisma.siteSetting.findFirst();
  const fill: Record<string, string> = {};
  if (!s || OLD_DEFAULT_EMAILS.includes(s.email)) fill.email = COMPANY.email;
  if (!s?.secondaryEmail) fill.secondaryEmail = COMPANY.secondaryEmail;
  if (!s?.phone) fill.phone = COMPANY.phone;
  if (!s?.whatsapp) fill.whatsapp = COMPANY.whatsapp;
  if (Object.keys(fill).length) {
    log(`site settings: set ${Object.keys(fill).join(', ')}`);
    if (!dry) {
      if (s) await prisma.siteSetting.update({ where: { id: s.id }, data: fill });
      else await prisma.siteSetting.create({ data: fill });
    }
  } else {
    log('site settings: contact details already set (unchanged)');
  }

  // ---- Notification recipients (only when never configured) ----
  if (!(await prisma.notificationSettings.findUnique({ where: { id: 'default' } }))) {
    log(`notification settings: recipients ${COMPANY.notificationRecipients.join(', ')}`);
    if (!dry) await prisma.notificationSettings.create({ data: { id: 'default', recipients: COMPANY.notificationRecipients } });
  } else {
    log('notification settings: already configured (unchanged)');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
