'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution } from '@/lib/attribution';

/** Records first-touch landing page / referrer / UTM for this browser session (see lib/attribution). */
export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureAttribution();
  }, [pathname]);
  return null;
}
