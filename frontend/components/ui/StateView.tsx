import { AlertTriangle, Inbox, RotateCcw, type LucideIcon } from 'lucide-react';
import { Button } from './Button';
import styles from './StateView.module.css';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

/** Shown when a list or view has no data (or no results for the filters). */
export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>
        <Icon size={24} aria-hidden />
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/** Shown when loading failed; offers a retry. Announced to screen readers. */
export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className={[styles.wrap, styles.error].join(' ')} role="alert">
      <span className={styles.icon}>
        <AlertTriangle size={24} aria-hidden />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{message}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw size={15} aria-hidden /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** A shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 14, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden />;
}
