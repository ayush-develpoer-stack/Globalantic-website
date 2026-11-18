'use client';

import Link from 'next/link';
import { buttonClass } from '@globalantic/ui';

export default function NotFound() {
  return (
    <main className="container section" style={{ textAlign: 'center', display: 'grid', gap: 16, justifyItems: 'center' }}>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist in the trainer portal.</p>
      <Link href="/" className={buttonClass('primary', 'md')}>
        Go to dashboard
      </Link>
    </main>
  );
}
