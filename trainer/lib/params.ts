'use client';

import { useParams } from 'next/navigation';

/** Reads a single dynamic route segment as a string. */
export function useParam(name: string): string {
  const params = useParams<Record<string, string | string[]>>();
  const v = params?.[name];
  return Array.isArray(v) ? v[0] : (v ?? '');
}
