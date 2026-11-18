'use client';

import Link from 'next/link';
import { trackClick } from '@/lib/attribution';

/** Internal CTA link that counts clicks anonymously (label = which CTA). */
export function TrackedLink({ href, label, service, className, children, onClick }: { href: string; label: string; service?: string | null; className?: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackClick('cta_click', label, service);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
