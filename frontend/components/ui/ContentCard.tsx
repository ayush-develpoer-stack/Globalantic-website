import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Icon } from './Icon';
import styles from './ContentCard.module.css';

interface ContentCardProps {
  href: string;
  title: string;
  description: string;
  icon?: string | null;
  tag?: string;
  cta?: string;
}

/** Reusable card for services, solutions and industries grids across the site. */
export function ContentCard({ href, title, description, icon, tag, cta = 'Learn more' }: ContentCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.iconWrap}>
        <Icon name={icon} size={24} />
      </span>
      {tag && <span className={styles.tag}>{tag}</span>}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.desc}>{description}</p>
      <span className={styles.cta}>
        {cta} <ArrowRight size={16} />
      </span>
    </Link>
  );
}
