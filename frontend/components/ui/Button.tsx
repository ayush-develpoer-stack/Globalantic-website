import Link from 'next/link';
import { forwardRef } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface ButtonAsButton
  extends BaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> {
  href?: undefined;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
}

interface ButtonAsLink extends BaseProps {
  href: string;
  external?: boolean;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

/** Button classes for other link components (e.g. a tracked CTA link styled as a button). */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', fullWidth?: boolean, extra?: string) {
  return [styles.btn, styles[variant], styles[size], fullWidth ? styles.full : '', extra ?? '']
    .filter(Boolean)
    .join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { variant = 'primary', size = 'md', fullWidth, className, children } = props;
  const cls = buttonClass(variant, size, fullWidth, className);

  if ('href' in props && props.href !== undefined) {
    const { href, external } = props;
    if (external) {
      return (
        <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link className={cls} href={href}>
        {children}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    fullWidth: _f,
    className: _c,
    children: _ch,
    loading,
    disabled,
    type = 'button',
    ...rest
  } = props as ButtonAsButton;
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
});
