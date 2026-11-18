import styles from './TechChips.module.css';

interface TechChipsProps {
  items: string[];
}

/** Pill chips for a technology stack list. */
export function TechChips({ items }: TechChipsProps) {
  if (!items || items.length === 0) return null;

  return (
    <ul className={styles.list}>
      {items.map((item, i) => (
        <li key={i} className={styles.chip}>
          {item}
        </li>
      ))}
    </ul>
  );
}
