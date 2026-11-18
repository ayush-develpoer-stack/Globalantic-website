import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getIndustries } from '@/lib/api';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ContentCard } from '@/components/ui/ContentCard';
import styles from './IndustriesSection.module.css';

/** Industries grid, sourced from the API. Omitted gracefully when empty. */
export async function IndustriesSection() {
  const industries = (await getIndustries()) ?? [];
  if (!industries.length) return null;

  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Industries"
          title="Experience across industries"
          description="We adapt our approach to the realities of your sector, building solutions that fit how your industry actually works."
        />

        <div className={styles.grid}>
          {industries.slice(0, 8).map((industry) => (
            <ContentCard
              key={industry.slug}
              href={`/industries/${industry.slug}`}
              title={industry.title}
              description={industry.shortDesc}
              icon={industry.icon ?? null}
              cta="Explore"
            />
          ))}
        </div>

        <div className={styles.footer}>
          <Link href="/industries" className={styles.viewAll}>
            View all industries <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
