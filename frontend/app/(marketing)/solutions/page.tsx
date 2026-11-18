import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { ContentCard } from '@/components/ui/ContentCard';
import { CTASection } from '@/components/sections/CTASection';
import { getSolutions } from '@/lib/api';
import { footerNav } from '@/lib/config';
import { buildMetadata, breadcrumbSchema, itemListSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Business Software — CRM, ERP, E-commerce & SaaS',
  description:
    'Ready-to-deploy business solutions from Globalantic — CRM, ERP, e-commerce, custom SaaS, dashboards and more.',
  path: '/solutions',
});

export default async function SolutionsPage() {
  const solutions = (await getSolutions()) ?? [];

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Solutions', path: '/solutions' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema('Business solutions', solutions.map((x) => ({ name: x.title, path: `/solutions/${x.slug}` })))) }}
      />

      <PageHero
        eyebrow="What we build"
        title="Business Solutions"
        description="Purpose-built platforms and systems that streamline operations and help your business scale."
        visual="dashboard"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Solutions', path: '/solutions' }]}
        ctas={{ trackLabel: 'solutions_hero' }}
      />

      <section className="section">
        <div className="container">
          {solutions.length > 0 ? (
            <div className={styles.grid}>
              {solutions.map((solution) => (
                <ContentCard
                  key={solution.slug}
                  href={`/solutions/${solution.slug}`}
                  title={solution.title}
                  description={solution.shortDesc}
                  icon={solution.icon}
                />
              ))}
            </div>
          ) : (
            <div className={styles.grid}>
              {footerNav.solutions.map((link) => (
                <ContentCard
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  description="Discover how this solution can support your business."
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <CTASection />
    </>
  );
}
