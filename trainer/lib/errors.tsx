'use client';

import Link from 'next/link';
import { ErrorState, LoadingState, buttonClass } from '@globalantic/ui';

/** 404 from a batch-scoped API call means "not yours" as far as the trainer can tell. */
export function NotAssigned({ what = 'Batch' }: { what?: string }) {
  return (
    <div>
      <ErrorState title={`${what} not found or not assigned to you`} message="You can only open batches that the training team has assigned to you." />
      <p style={{ textAlign: 'center' }}>
        <Link href="/" className={buttonClass('outline', 'sm')}>
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}

/** Loading / not-found / error / content for a query that may 404. */
export function Guarded<T>({
  state,
  what,
  children,
}: {
  state: { data: T | null; error: string | null; status: number | null; loading: boolean; reload: () => void };
  what?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === 404) return <NotAssigned what={what} />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading && state.data === null) return <LoadingBlock />;
  if (state.data === null) return <LoadingBlock />;
  return <>{children(state.data)}</>;
}

function LoadingBlock() {
  return <LoadingState />;
}
