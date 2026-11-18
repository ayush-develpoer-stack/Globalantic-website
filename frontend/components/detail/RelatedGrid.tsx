import { ContentCard } from '@/components/ui/ContentCard';
import { SectionHeading } from '@/components/ui/SectionHeading';
import styles from './RelatedGrid.module.css';

interface RelatedItem {
  slug: string;
  title: string;
  shortDesc: string;
  icon?: string | null;
}

interface RelatedGridProps {
  heading: string;
  items: RelatedItem[];
  basePath: string;
}

/** Grid of related services/solutions/industries built on ContentCard. */
export function RelatedGrid({ heading, items, basePath }: RelatedGridProps) {
  if (!items || items.length === 0) return null;

  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  return (
    <div>
      <SectionHeading title={heading} align="center" />
      <div className={styles.grid}>
        {items.map((item) => (
          <ContentCard
            key={item.slug}
            href={`${base}/${item.slug}`}
            title={item.title}
            description={item.shortDesc}
            icon={item.icon}
          />
        ))}
      </div>
    </div>
  );
}
