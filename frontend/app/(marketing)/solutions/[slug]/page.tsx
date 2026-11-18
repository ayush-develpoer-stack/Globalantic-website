import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { DetailHero } from '@/components/detail/DetailHero';
import { FeatureList } from '@/components/detail/FeatureList';
import { TechChips } from '@/components/detail/TechChips';
import { Accordion } from '@/components/detail/Accordion';
import { DetailCTA } from '@/components/detail/DetailCTA';
import { getSolution, getSolutions } from '@/lib/api';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import styles from './page.module.css';
import type { HeroVariant } from '@/components/visuals/HeroVisual';
import { jsonLd } from '@/lib/json-ld';

const SOLUTION_VISUAL: Record<string, HeroVariant> = { crm: 'crm', erp: 'erp', 'business-management': 'erp', 'appointment-system': 'mobile', 'learning-platform': 'webapp', ecommerce: 'commerce', 'custom-saas': 'webapp', 'ai-automation': 'workflow', 'business-dashboard': 'dashboard', 'internal-tools': 'dashboard' };

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const solutions = (await getSolutions()) ?? [];
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const solution = await getSolution(params.slug);
  if (!solution) {
    return buildMetadata({ title: 'Solution', path: `/solutions/${params.slug}` });
  }
  return buildMetadata({
    title: solution.seoTitle ?? solution.title,
    description: solution.seoDescription ?? solution.shortDesc,
    path: `/solutions/${params.slug}`,
    image: solution.ogImage,
  });
}

export default async function SolutionDetailPage(props: PageProps) {
  const params = await props.params;
  const solution = await getSolution(params.slug);
  if (!solution) notFound();

  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Solutions', path: '/solutions' },
    { name: solution.title, path: `/solutions/${solution.slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(breadcrumb)) }}
      />

      <DetailHero
        eyebrow="Solution"
        title={solution.title}
        tagline={solution.tagline}
        description={solution.shortDesc}
        icon={solution.icon}
        breadcrumb={breadcrumb}
        visual={SOLUTION_VISUAL[solution.slug] ?? 'dashboard'}
        topic={solution.title}
        trackLabel="solution_hero"
      />

      {solution.overview && (
        <section className="section">
          <div className="container">
            <div className={styles.narrow}>
              <SectionHeading title="Overview" align="center" className={styles.headWrap} />
              <p className={styles.lead}>{solution.overview}</p>
            </div>
          </div>
        </section>
      )}

      {solution.features.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading
              eyebrow="Capabilities"
              title="Key features"
              align="center"
              className={styles.headWrap}
            />
            <FeatureList items={solution.features} columns={2} />
          </div>
        </section>
      )}

      {solution.benefits.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading title="Benefits" align="center" className={styles.headWrap} />
            <FeatureList items={solution.benefits} columns={2} />
          </div>
        </section>
      )}

      {solution.technologies.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading title="Technology" align="center" className={styles.headWrap} />
            <TechChips items={solution.technologies} />
          </div>
        </section>
      )}

      {solution.useCases.length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading title="Use Cases" align="center" className={styles.headWrap} />
            <div className={styles.useCases}>
              {solution.useCases.map((useCase, i) => (
                <div key={i} className={styles.useCase}>
                  <span className={styles.useCaseDot} aria-hidden />
                  <span className={styles.useCaseText}>{useCase}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {solution.faqs.length > 0 && (
        <section className={`section ${styles.alt}`}>
          <div className="container">
            <SectionHeading
              eyebrow="FAQ"
              title="Frequently asked questions"
              align="center"
              className={styles.headWrap}
            />
            <Accordion items={solution.faqs} />
          </div>
        </section>
      )}

      <DetailCTA topic={solution.title} />
    </>
  );
}
