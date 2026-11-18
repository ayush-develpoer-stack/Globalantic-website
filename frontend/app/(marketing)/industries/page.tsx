import Link from 'next/link';
import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { ContentCard } from '@/components/ui/ContentCard';
import { CTASection } from '@/components/sections/CTASection';
import { getIndustries } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, itemListSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Industries We Build Software For',
  description:
    'Globalantic delivers tailored technology for industries including healthcare, retail, finance, education, logistics and more.',
  path: '/industries',
});

export default async function IndustriesPage() {
  const industries = (await getIndustries()) ?? [];

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Industries', path: '/industries' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema('Industries', industries.map((x) => ({ name: x.title, path: `/industries/${x.slug}` })))) }}
      />

      <PageHero
        eyebrow="Who we help"
        title="Industries We Serve"
        description="Domain-aware solutions built around the workflows, challenges and standards of your industry."
        visual="erp"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Industries', path: '/industries' }]}
        ctas={{ trackLabel: 'industries_hero' }}
      />

      <section className="section">
        <div className="container">
          {industries.length > 0 ? (
            <div className={styles.grid}>
              {industries.map((industry) => (
                <ContentCard
                  key={industry.slug}
                  href={`/industries/${industry.slug}`}
                  title={industry.title}
                  description={industry.shortDesc}
                  icon={industry.icon}
                />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>
              We tailor our work to the demands of each sector. Explore our{' '}
              <Link href="/services">services</Link> or <Link href="/contact">get in touch</Link> to discuss your
              industry.
            </p>
          )}
        </div>
      </section>

      <CTASection />
    </>
  );
}
