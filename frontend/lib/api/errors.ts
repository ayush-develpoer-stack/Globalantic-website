import type { FieldError } from '@/types';

/**
 * The single error type every service throws — mock or real API — so UI code
 * handles failures one way. `status` mirrors the HTTP status the backend would
 * return (0 = network failure).
 */
export class ServiceError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(message: string, status = 500, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ServiceError || err instanceof Error) return err.message || fallback;
  return fallback;
}
