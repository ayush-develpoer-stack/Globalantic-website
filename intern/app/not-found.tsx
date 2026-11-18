'use client';

import Link from 'next/link';
import { EmptyState, buttonClass } from '@globalantic/ui';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist or you do not have access to it."
        action={<Link href="/" className={buttonClass('primary', 'sm')}>Go to dashboard</Link>}
      />
    </main>
  );
}
