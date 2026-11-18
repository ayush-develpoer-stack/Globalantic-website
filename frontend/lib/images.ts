import { apiConfig } from './api/config';

/**
 * The CMS accepts any https image URL, but next/image can only optimise hosts listed in
 * next.config.mjs (Cloudinary, Unsplash, the API's public file store). Other hosts are
 * rendered unoptimised instead of failing at runtime.
 */
const OPTIMISED = [/^https:\/\/res\.cloudinary\.com\//, /^https:\/\/images\.unsplash\.com\//, /\/files\/public\/[0-9a-f-]{36}$/];

/**
 * Uploaded CMS images may be stored as an API-relative path (/api/files/public/<id>).
 * Those live on the API origin, not on this site, so they are resolved against
 * NEXT_PUBLIC_API_URL. Absolute URLs pass through unchanged.
 */
export function mediaUrl(src: string, apiUrl: string = apiConfig.apiUrl): string {
  if (!src.startsWith('/api/files/public/') || !apiUrl) return src;
  try {
    return `${new URL(apiUrl).origin}${src}`;
  } catch {
    return src;
  }
}

export function imageProps(src: string): { src: string; unoptimized?: boolean } {
  const url = mediaUrl(src);
  return OPTIMISED.some((r) => r.test(url)) ? { src: url } : { src: url, unoptimized: true };
}

/** Absolute image URL for structured data / Open Graph (only when a real image exists). */
export function absoluteImage(src?: string | null): string | undefined {
  if (!src) return undefined;
  const url = mediaUrl(src);
  return /^https?:\/\//.test(url) ? url : undefined;
}
