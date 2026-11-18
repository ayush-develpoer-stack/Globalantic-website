import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { ContentCard } from '@/components/ui/ContentCard';
import { CTASection } from '@/components/sections/CTASection';
import { getServices } from '@/lib/api';
import { serviceLinks } from '@/lib/config';
import { buildMetadata, breadcrumbSchema, itemListSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'IT Services — Web, Software, Apps, AI & Marketing',
  description:
    'Explore Globalantic services — web and software development, mobile apps, AI solutions, cloud, design and digital marketing.',
  path: '/services',
});

export default async function ServicesPage() {
  const services = (await getServices()) ?? [];

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Services', path: '/services' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListSchema('Services', services.map((x) => ({ name: x.title, path: `/services/${x.slug}` })))) }}
      />

      <PageHero
        eyebrow="What we do"
        title="Our Services"
        description="End-to-end technology services to design, build and grow your digital products and business systems."
        visual="browser"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }]}
        ctas={{ trackLabel: 'services_hero', secondary: { href: '/get-a-quote', label: 'Request a Quote' } }}
      />

      <section className="section">
        <div className="container">
          {services.length > 0 ? (
            <div className={styles.grid}>
              {services.map((service) => (
                <ContentCard
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  title={service.title}
                  description={service.shortDesc}
                  icon={service.icon}
                />
              ))}
            </div>
          ) : (
            <div className={styles.grid}>
              {serviceLinks.map((link) => (
                <ContentCard
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  description="Learn how this service can help your business grow."
                  icon={link.icon}
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
