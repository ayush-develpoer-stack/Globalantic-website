'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <h1 style={{ marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ marginBottom: 28 }}>
          An unexpected error occurred. Please try again, or return to the homepage.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" href="/">
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
