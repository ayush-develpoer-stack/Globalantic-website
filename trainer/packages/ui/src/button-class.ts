/**
 * Server-safe (no "use client"): button class names usable from server
 * components, e.g. <Link className={buttonClass('outline')}>.
 */
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Class names for a button look — use on <Link> for navigation buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', full = false): string {
  return cx(s.btn, s[`btn_${variant}`], s[`btn_${size}`], full && s.full);
}
