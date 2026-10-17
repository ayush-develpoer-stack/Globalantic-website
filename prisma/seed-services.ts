/**
 * Adds missing services (and fills empty hero/audience/industry fields, and SEO title/description
 * when still empty or the old auto-generated default) WITHOUT touching
 * anything else: no admin account, no overwriting of services edited in the CMS.
 * Safe to run against production (after the migration):
 *
 *   npx tsx ../prisma/seed-services.ts          (from backend/, uses DATABASE_URL)
 *   npx tsx ../prisma/seed-services.ts --dry    (prints what would change)
 */
import { PrismaClient } from '@prisma/client';
import '../backend/src/config/env';
import { services } from './data/services';
import { extraServices, serviceExtras } from './data/services-extra';
import { legacyServiceSeoTitle, serviceSeo } from './data/seo';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

async function main() {
  const all = [...services, ...extraServices];
  for (const s of all) {
    const extras = serviceExtras[s.slug];
    const existing = await prisma.service.findUnique({ where: { slug: s.slug } });
    if (existing) {
      const fill: Record<string, unknown> = {};
      if (extras && !existing.heroVariant) fill.heroVariant = extras.heroVariant;
      if (extras && Array.isArray(existing.audience) && existing.audience.length === 0) fill.audience = extras.audience;
      if (extras && Array.isArray(existing.industries) && existing.industries.length === 0) fill.industries = extras.industries;
      // Search copy: only replaces an empty or auto-generated default, never a CMS edit.
      const seo = serviceSeo[s.slug];
      if (seo && (!existing.seoTitle || existing.seoTitle === legacyServiceSeoTitle(existing.title))) fill.seoTitle = seo.title;
      if (seo && (!existing.seoDescription || existing.seoDescription === existing.shortDesc)) fill.seoDescription = seo.description;
      if (Object.keys(fill).length) {
        console.log(`${dry ? '[dry] ' : ''}fill ${s.slug}: ${Object.keys(fill).join(', ')}`);
        if (!dry) await prisma.service.update({ where: { slug: s.slug }, data: fill });
      }
      continue;
    }
    console.log(`${dry ? '[dry] ' : ''}create ${s.slug}`);
    if (dry) continue;
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
        seoTitle: serviceSeo[s.slug]?.title ?? legacyServiceSeoTitle(s.title),
        seoDescription: serviceSeo[s.slug]?.description ?? s.shortDesc,
        published: true,
        heroVariant: extras?.heroVariant ?? null,
        audience: extras?.audience ?? [],
        industries: extras?.industries ?? [],
      },
    });
  }
  console.log('done');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
