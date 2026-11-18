import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { DetailHero } from '@/components/detail/DetailHero';
import { FeatureList } from '@/components/detail/FeatureList';
import { TechChips } from '@/components/detail/TechChips';
import { Accordion } from '@/components/detail/Accordion';
import { DetailCTA } from '@/components/detail/DetailCTA';
import { getIndustry, getIndustries } from '@/lib/api';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import styles from './page.module.css';
import type { HeroVariant } from '@/components/visuals/HeroVisual';
import { jsonLd } from '@/lib/json-ld';

const INDUSTRY_VISUAL: Record<string, HeroVariant> = { healthcare: 'mobile', education: 'webapp', 'real-estate': 'crm', ecommerce: 'commerce', finance: 'dashboard', 'travel-tourism': 'browser', hospitality: 'mobile', manufacturing: 'erp', logistics: 'workflow', automobile: 'crm' };

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Turns a service slug like "web-development" into "Web Development". */
function slugToLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function generateStaticParams() {
  const industries = (await getIndustries()) ?? [];
  return industries.map((industry) => ({ slug: industry.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const industry = await getIndustry(params.slug);
  if (!industry) {
    return buildMetadata({ title: 'Industry', path: `/industries/${params.slug}` });
  }
  return buildMetadata({
    title: industry.seoTitle ?? industry.title,
    description: industry.seoDescription ?? industry.shortDesc,
    path: `/industries/${params.slug}`,
    image: industry.ogImage,
  });
}

export default async function IndustryDetailPage(props: PageProps) {
  const params = await props.params;
  const industry = await getIndustry(params.slug);
  if (!industry) notFound();

  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Industries', path: '/industries' },
    { name: industry.title, path: `/industries/${industry.slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(breadcrumb)) }}
      />

      <DetailHero
        eyebrow="Industry"
        title={industry.title}
        tagline={industry.tagline}
        description={industry.shortDesc}
        icon={industry.icon}
        breadcrumb={breadcrumb}
        visual={INDUSTRY_VISUAL[industry.slug] ?? 'dashboard'}
        topic={industry.title}
        trackLabel="industry_hero"
      />

      {industry.overview && (
        <section className="section">
          <div className="container">
            <div className={styles.narrow}>
              <SectionHeading title="Overview" align="center" className={styles.headWrap} />
              <p className={styles.lead}>{industry.overview}</p>
            </div>
          </div>
        </section>
      )}

      {industry.challenges.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading
              eyebrow="What you're up against"
              title="Industry Challenges"
              align="center"
              className={styles.headWrap}
            />
            <div className={styles.challengeList}>
              {industry.challenges.map((challenge, i) => (
                <div key={i} className={styles.challenge}>
                  <AlertCircle size={20} color="var(--primary-text)" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                  <span className={styles.challengeText}>{challenge}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {industry.solutions.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading
              eyebrow="How we help"
              title="Digital Solutions"
              align="center"
              className={styles.headWrap}
            />
            <FeatureList items={industry.solutions} columns={2} />
          </div>
        </section>
      )}

      {industry.relevantServices.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading title="Relevant Services" align="center" className={styles.headWrap} />
            <div className={styles.linkGrid}>
              {industry.relevantServices.map((slug) => (
                <Link key={slug} href={`/services/${slug}`} className={styles.linkCard}>
                  <span>{slugToLabel(slug)}</span>
                  <ArrowRight size={16} className={styles.linkArrow} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {industry.features.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading title="Features" align="center" className={styles.headWrap} />
            <FeatureList items={industry.features} columns={2} />
          </div>
        </section>
      )}

      {industry.technologies.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading title="Technology" align="center" className={styles.headWrap} />
            <TechChips items={industry.technologies} />
          </div>
        </section>
      )}

      {industry.useCases.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading title="Use Cases" align="center" className={styles.headWrap} />
            <div className={styles.useCases}>
              {industry.useCases.map((useCase, i) => (
                <div key={i} className={styles.useCase}>
                  <span className={styles.useCaseDot} aria-hidden />
                  <span className={styles.useCaseText}>{useCase}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {industry.faqs.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading
              eyebrow="FAQ"
              title="Frequently asked questions"
              align="center"
              className={styles.headWrap}
            />
            <Accordion items={industry.faqs} />
          </div>
        </section>
      )}

      <DetailCTA topic={industry.title} />
    </>
  );
}
