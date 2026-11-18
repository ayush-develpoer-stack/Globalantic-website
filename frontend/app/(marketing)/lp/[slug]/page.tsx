import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { PremiumHero } from '@/components/hero/PremiumHero';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/detail/Accordion';
import { ProcessSteps } from '@/components/detail/ProcessSteps';
import { TechStack } from '@/components/tech/TechStack';
import { ServiceCtaStrip } from '@/components/marketing/ServiceCtaStrip';
import { ServiceEnquiry } from '@/components/marketing/ServiceEnquiry';
import { accentFor, resolveVariant } from '@/components/visuals/HeroVisual';
import { getLandingPage } from '@/lib/api';
import { buildMetadata, faqSchema, serviceSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

/**
 * Campaign landing page (CMS-managed). A focused version of a service page for ad traffic:
 * headline, benefits and CTA from the landing page; content, FAQs and the enquiry form from
 * the real service. Pricing appears only when an approved price line was entered.
 */
interface PageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const lp = await getLandingPage(params.slug);
  if (!lp) return buildMetadata({ title: 'Page not found', path: `/lp/${params.slug}`, noindex: true });
  return buildMetadata({
    title: lp.seoTitle || lp.headline,
    description: lp.seoDescription || lp.subheadline,
    path: `/lp/${lp.slug}`,
    noindex: !lp.indexable,
  });
}

export default async function LandingPage(props: PageProps) {
  const params = await props.params;
  const lp = await getLandingPage(params.slug);
  if (!lp) notFound();
  const service = lp.service;
  const variant = resolveVariant(service.heroVariant, service.slug);

  return (
    <div style={{ ['--va' as string]: accentFor(variant) } as React.CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceSchema(service.title, service.shortDesc, `/services/${service.slug}`)) }} />
      {service.faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(service.faqs)) }} />}

      <PremiumHero
        eyebrow={service.title}
        title={lp.headline}
        description={lp.subheadline}
        visual={variant}
        ctas={{ href: '#enquiry', label: lp.ctaLabel || 'Get a Free Consultation', service: service.title, trackLabel: `landing:${lp.slug}` }}
        points={lp.benefits.slice(0, 3)}
      />
      {lp.priceNote && (
        <div className="container">
          <p className={styles.price}>{lp.priceNote}</p>
        </div>
      )}

      <ServiceEnquiry service={service.title} source={`landing_page:${lp.slug}`} title="Tell us about your project" />

      {lp.benefits.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading eyebrow="Why Globalantic" title={`What you get with our ${service.title.toLowerCase()} service`} align="center" className={styles.head} />
            <ul className={styles.benefits}>
              {lp.benefits.map((b) => (
                <li key={b}>
                  <Check size={18} strokeWidth={3} aria-hidden /> {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {service.deliverables.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading eyebrow="Deliverables" title="What you receive" align="center" className={styles.head} />
            <ul className={styles.benefits}>
              {service.deliverables.map((d) => (
                <li key={d}>
                  <Check size={18} strokeWidth={3} aria-hidden /> {d}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {service.process.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading eyebrow="Process" title="How it works" align="center" className={styles.head} />
            <ProcessSteps steps={service.process} />
          </div>
        </section>
      )}

      {service.technologies.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading eyebrow="Technology" title="Tools we use" align="center" className={styles.head} />
            <TechStack items={service.technologies} compact />
          </div>
        </section>
      )}

      {service.faqs.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading eyebrow="FAQ" title="Questions before you enquire" align="center" className={styles.head} />
            <Accordion items={service.faqs} />
          </div>
        </section>
      )}

      <ServiceCtaStrip service={service.title} quoteHref="#enquiry" />
    </div>
  );
}
