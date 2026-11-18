import styles from './SectionHeading.module.css';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  /** id on the heading (for aria-labelledby or in-page links) */
  id?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  as = 'h2',
  className,
  id,
}: SectionHeadingProps) {
  const Tag = as;
  return (
    <div className={[styles.wrap, align === 'center' ? styles.center : '', className ?? ''].filter(Boolean).join(' ')}>
      {eyebrow && <span className="eyebrow-pill">{eyebrow}</span>}
      <Tag className={styles.title} id={id}>{title}</Tag>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
