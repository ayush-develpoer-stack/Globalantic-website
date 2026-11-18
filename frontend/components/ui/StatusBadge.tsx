import { Check, Circle, Clock, Minus, X, type LucideIcon } from 'lucide-react';
import styles from './StatusBadge.module.css';

export type StatusTone = 'new' | 'progress' | 'success' | 'danger' | 'neutral';

const ICONS: Record<StatusTone, LucideIcon> = {
  new: Circle,
  progress: Clock,
  success: Check,
  danger: X,
  neutral: Minus,
};

/** Turns 'IN_PROGRESS' into 'In progress'. */
export function humanizeStatus(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Status pill. Always shows an icon and the status text, so meaning never
 * depends on colour alone.
 */
export function StatusBadge({ status, tone }: { status: string; tone: StatusTone }) {
  const Icon = ICONS[tone];
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {humanizeStatus(status)}
    </span>
  );
}
