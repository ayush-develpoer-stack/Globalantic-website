import styles from './Badge.module.css';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'soft' | 'outline' | 'success' | 'warning';
  className?: string;
}

export function Badge({ children, variant = 'soft', className }: BadgeProps) {
  return <span className={[styles.badge, styles[variant], className ?? ''].filter(Boolean).join(' ')}>{children}</span>;
}
