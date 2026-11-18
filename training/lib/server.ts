import { api, errorMessage, isApiError, type GlobalanticApi } from '@globalantic/api-client';
import { COURSE_LEVELS, DELIVERY_MODES, PROGRAM_TYPES, enumLabel } from '@globalantic/types';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  status: number | null;
}

/**
 * Runs an API call for a server component and never throws: pages render an
 * error state instead when the API is unreachable (and builds never need it).
 */
export async function load<T>(fn: (client: GlobalanticApi) => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await fn(api()), error: null, status: null };
  } catch (err) {
    return {
      data: null,
      error: isApiError(err) && err.status === 0 ? 'The training catalogue is temporarily unavailable. Please try again shortly.' : errorMessage(err),
      status: isApiError(err) ? err.status : null,
    };
  }
}

/** Reads one string value from Next searchParams (arrays and junk are ignored). */
export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === 'string' ? v.slice(0, 100) : '';
}

export function pageParam(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, 'page'));
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

/** Keeps only allowed enum values (bad URL input must not reach the API as a 400). */
export function oneOf<T extends string>(value: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: enumLabel(v) }));
export const MODE_OPTIONS = opts(DELIVERY_MODES);
export const LEVEL_OPTIONS = opts(COURSE_LEVELS);
export const PROGRAM_OPTIONS = PROGRAM_TYPES.map((v) => ({ value: v, label: v === 'TRAINING' ? 'Training' : 'Internship' }));
export { COURSE_LEVELS, DELIVERY_MODES, PROGRAM_TYPES };
