import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'div' | 'article' | 'li';
  id?: string;
}

export function Card({ children, className, hover = true, as = 'div', id }: CardProps) {
  const Tag = as;
  return (
    <Tag id={id} className={[styles.card, hover ? styles.hover : '', className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}
