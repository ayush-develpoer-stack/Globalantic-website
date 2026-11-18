import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getPortfolio } from '@/lib/api';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Button } from '@/components/ui/Button';
import styles from './PortfolioSection.module.css';

/** Selected work grid. Shows a tasteful empty state when no projects exist. */
export async function PortfolioSection() {
  const projects = (await getPortfolio()) ?? [];
  const featured = projects.filter((project) => project.featured);
  const selected = (featured.length ? featured : projects).slice(0, 3);

  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Selected work"
          title="Selected Work"
          description="A look at some of the products and platforms we have designed and built."
        />

        {selected.length ? (
          <>
            <div className={styles.grid}>
              {selected.map((project) => (
                <Link key={project.slug} href={`/portfolio/${project.slug}`} className={styles.card}>
                  <span className={styles.category}>{project.category}</span>
                  <h3 className={styles.title}>{project.title}</h3>
                  <p className={styles.desc}>{project.shortDescription}</p>
                  <span className={styles.cta}>
                    View project <ArrowRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
            <div className={styles.footer}>
              <Link href="/portfolio" className={styles.viewAll}>
                View all work <ArrowRight size={16} />
              </Link>
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <h3 className={styles.emptyTitle}>Your project could be the next one here.</h3>
            <p className={styles.emptyDesc}>
              We are ready to design and build your next website, app or platform. Tell us what you have in
              mind and we will map out how to get there.
            </p>
            <Button href="/contact" size="lg">
              Start a project <ArrowRight size={18} />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
