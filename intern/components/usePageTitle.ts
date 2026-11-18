'use client';

import { useEffect } from 'react';

/** Sets the browser tab title for client-rendered portal pages. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} | Globalantic Student Portal`;
  }, [title]);
}
