'use client';

import Link from 'next/link';
import { buttonClass, type ButtonSize, type ButtonVariant } from '@globalantic/ui';

/**
 * A Next <Link> styled as a button. Exists because `buttonClass` lives in a
 * client module and cannot be called from server components directly.
 */
export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  external = false,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  external?: boolean;
  'aria-label'?: string;
}) {
  const className = buttonClass(variant, size, full);
  if (external) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
