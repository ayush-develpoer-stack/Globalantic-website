import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getSolutions } from '@/lib/api';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ContentCard } from '@/components/ui/ContentCard';
import styles from './SolutionsSection.module.css';

/** Business solutions grid, sourced from the API. Omitted gracefully when empty. */
export async function SolutionsSection() {
  const solutions = (await getSolutions()) ?? [];
  if (!solutions.length) return null;

  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Business solutions"
          title="Business Solutions"
          description="Ready-to-shape platforms that solve common business challenges — configured and extended to fit the way you work."
        />

        <div className={styles.grid}>
          {solutions.slice(0, 6).map((solution) => (
            <ContentCard
              key={solution.slug}
              href={`/solutions/${solution.slug}`}
              title={solution.title}
              description={solution.shortDesc}
              icon={solution.icon ?? null}
            />
          ))}
        </div>

        <div className={styles.footer}>
          <Link href="/solutions" className={styles.viewAll}>
            View all solutions <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
