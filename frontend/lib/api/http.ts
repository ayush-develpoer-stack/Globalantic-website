import { apiConfig } from './config';
import { ServiceError } from './errors';
import type { FieldError } from '@/types';

/**
 * Thin HTTP client for the Globalantic REST API. It is the ONLY place that
 * calls `fetch` against the backend; services build on top of it.
 *
 * The backend envelope is { success, message, data } / { success: false, message, errors }.
 * Non-success responses are converted to ServiceError.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const REQUEST_TIMEOUT_MS = 15_000;

interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: { field?: string; message: string }[];
}

interface RequestOptions {
  body?: unknown;
  /** Query string parameters; undefined/empty values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Next.js ISR window for server-side GETs. */
  revalidate?: number;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  if (!apiConfig.apiUrl) {
    // Production build without NEXT_PUBLIC_API_URL: fail clearly instead of calling localhost.
    console.error('[api] NEXT_PUBLIC_API_URL is not set for this build');
    throw new ServiceError('The site is not configured to reach the server (NEXT_PUBLIC_API_URL missing).', 0);
  }
  const url = `${apiConfig.apiUrl}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * `fetch` rejected without an HTTP response. The browser does not say why, but it
 * does know whether the device is offline. When it is online, the usual causes are
 * a blocked cross-origin (CORS) request or an unreachable API, so the message
 * should not blame the visitor's connection. The URL and page origin are logged
 * so the real cause can be seen in the console.
 */
function networkError(url: string, action: 'request' | 'upload'): ServiceError {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!offline) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'server';
    console.error(`[api] ${action} to ${url} failed before a response (page origin: ${origin})`);
  }
  if (offline) {
    return new ServiceError('You appear to be offline. Please check your connection and try again.', 0);
  }
  return new ServiceError(
    action === 'upload'
      ? 'We could not reach our server to upload the file. Please try again in a moment.'
      : 'We could not reach our server right now. Please try again in a moment.',
    0,
  );
}

function toFieldErrors(errors: Envelope<unknown>['errors']): FieldError[] {
  return (errors ?? [])
    .filter((e): e is { field: string; message: string } => typeof e?.field === 'string')
    .map((e) => ({ field: e.field, message: e.message }));
}

/** Performs a request and returns both `data` and the server `message`. */
export async function apiRequestWithMessage<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; message: string }> {
  const url = buildUrl(path, options.query);
  const attempt = async (): Promise<Response> => {
    // Abort after REQUEST_TIMEOUT_MS so a hung API never hangs a page.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        method,
        // Sends the httpOnly session cookie set by the API.
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        ...(options.revalidate !== undefined ? { next: { revalidate: options.revalidate } } : {}),
      });
    } catch {
      throw controller.signal.aborted
        ? new ServiceError('The server took too long to respond. Please try again.', 0)
        : networkError(url, 'request');
    } finally {
      clearTimeout(timer);
    }
  };

  // Safe retry: only idempotent GETs, once, after a network failure or a transient 502/503/504.
  // Form submissions and other writes are never retried automatically.
  let res: Response;
  if (method === 'GET') {
    try {
      res = await attempt();
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        await new Promise((r) => setTimeout(r, 600));
        res = await attempt();
      }
    } catch (err) {
      if (err instanceof ServiceError && /too long/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 600));
      res = await attempt();
    }
  } else {
    res = await attempt();
  }

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!json) throw new ServiceError('Unexpected server response.', res.status);
  if (!res.ok || !json.success) {
    throw new ServiceError(json.message || 'Request failed.', res.status, toFieldErrors(json.errors));
  }
  return { data: json.data as T, message: json.message ?? '' };
}

export async function apiRequest<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestWithMessage<T>(method, path, options)).data;
}

/** Purposes the CMS may upload (the API also has private purposes for other portals). */
export type UploadPurpose = 'CMS_IMAGE';

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Public URL (present for public image purposes such as CMS_IMAGE). */
  url?: string;
}

/**
 * Uploads a file as raw bytes to POST /files?purpose=… . The server detects the
 * real type from the content, enforces the size limit and returns the stored
 * file's metadata (and its public URL for images).
 */
export async function upload(file: Blob & { name?: string }, purpose: UploadPurpose): Promise<UploadedFile> {
  const url = buildUrl('/files', { purpose });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000); // uploads get a longer window; never retried
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name ?? 'image'),
      },
      body: file,
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? new ServiceError('The upload took too long. Please try again.', 0)
      : networkError(url, 'upload');
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as Envelope<UploadedFile> | null;
  if (!json || !res.ok || !json.success || !json.data) {
    const fallback = res.status === 413 ? 'The file is too large (max 5 MB).' : 'Upload failed.';
    throw new ServiceError(json?.message || fallback, res.status, toFieldErrors(json?.errors));
  }
  return json.data;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => apiRequest<T>('GET', path, options),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, { body }),
  /** POST that also returns the server confirmation message. */
  postWithMessage: <T>(path: string, body?: unknown) => apiRequestWithMessage<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, { body }),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
