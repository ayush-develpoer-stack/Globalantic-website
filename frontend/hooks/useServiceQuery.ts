'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api/errors';

export interface ServiceQueryState<T> {
  data: T | null;
  error: string | null;
  /** True for the first load and every reload. */
  loading: boolean;
  /** Re-runs the loader (retry button, after a mutation, …). */
  reload: () => void;
  /** Applies a confirmed change locally (e.g. after a successful status update). */
  setData: (update: (current: T | null) => T | null) => void;
}

/**
 * Runs an async service call with loading / error / retry handling.
 * Responses from superseded requests are ignored, so fast filter changes can
 * never render stale data. `key` must change whenever the loader's inputs do.
 */
export function useServiceQuery<T>(loader: () => Promise<T>, key: string): ServiceQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'Could not load data.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const update = useCallback((fn: (current: T | null) => T | null) => setData(fn), []);

  return { data, error, loading, reload, setData: update };
}
