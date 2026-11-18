'use client';

import { ErrorState } from '@globalantic/ui';
import s from '@/styles/site.module.css';

/** Route-level error boundary: never shows stack traces or internal details. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`container ${s.page}`}>
      <ErrorState title="Something went wrong" message="Please try again. If the problem continues, contact us." onRetry={reset} />
    </div>
  );
}
