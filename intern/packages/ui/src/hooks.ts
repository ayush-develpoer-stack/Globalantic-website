'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  /** HTTP status of the last failure (0 = network), for 401/403/404 handling. */
  status: number | null;
  loading: boolean;
  reload: () => void;
  setData: (update: (current: T | null) => T | null) => void;
}

/**
 * Runs an async loader with loading / error / retry state. Responses from
 * superseded requests are ignored, so quick filter changes never show stale
 * data. `key` must change whenever the loader's inputs change.
 */
export function useAsync<T>(loader: () => Promise<T>, key: string): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const ref = useRef(loader);
  ref.current = loader;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setStatus(null);
    ref
      .current()
      .then((r) => {
        if (active) setData(r);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error && err.message ? err.message : 'Could not load data.');
        setStatus(typeof (err as { status?: number })?.status === 'number' ? (err as { status: number }).status : null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const update = useCallback((fn: (c: T | null) => T | null) => setData(fn), []);
  return { data, error, status, loading, reload, setData: update };
}

/** Debounced copy of a value (search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/**
 * Wraps a mutation: tracks pending state and the last error, and prevents
 * double submission while a request is in flight.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Something went wrong.');
        throw err;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, setError };
}
