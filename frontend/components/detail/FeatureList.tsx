import { Check } from 'lucide-react';
import styles from './FeatureList.module.css';

interface FeatureListProps {
  title?: string;
  items: string[];
  columns?: number;
}

/** Checkmark list/grid used for features, deliverables, benefits, etc. */
export function FeatureList({ title, items, columns = 2 }: FeatureListProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <ul
        className={styles.list}
        style={{ '--fl-columns': columns } as React.CSSProperties}
      >
        {items.map((item, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.icon} aria-hidden>
              <Check size={16} strokeWidth={3} />
            </span>
            <span className={styles.text}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
