import type { Metadata } from 'next';
import { getPortfolio } from '@/lib/api';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { PageHero } from '@/components/layout/PageContainer';
import { PortfolioGrid } from '@/components/portfolio/PortfolioGrid';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Portfolio — Projects by Globalantic',
  description:
    'A selection of the websites, software, apps and business systems we have designed and built.',
  path: '/portfolio',
});

export default async function PortfolioPage() {
  const projects = (await getPortfolio()) ?? [];

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Portfolio', path: '/portfolio' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />

      <PageHero
        eyebrow="Selected work"
        title="Portfolio"
        description="A look at projects we have designed and built across web, software, mobile and AI."
        visual="design"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Portfolio', path: '/portfolio' }]}
        ctas={{ trackLabel: 'portfolio_hero', label: 'Discuss Your Project' }}
      />

      <section className="section">
        <div className="container">
          {projects.length > 0 ? (
            <PortfolioGrid projects={projects} />
          ) : (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>Case studies are on the way</h2>
              <p className={styles.emptyText}>
                We&rsquo;re preparing case studies. Meanwhile, let&rsquo;s talk about your project.
              </p>
              <Button href="/get-a-quote" variant="primary" size="lg">
                Discuss Your Project
              </Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
