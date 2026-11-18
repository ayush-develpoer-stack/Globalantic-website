'use client';

import { Suspense } from 'react';
import { LeadsManager } from '@/components/admin/LeadsManager';

export default function Page() {
  // Suspense is required because the list state lives in the URL (useSearchParams).
  return (
    <Suspense>
      <LeadsManager kind="training" />
    </Suspense>
  );
}
