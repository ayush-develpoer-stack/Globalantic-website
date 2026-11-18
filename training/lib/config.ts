/**
 * Public configuration only (NEXT_PUBLIC_*). Never reference server secrets here:
 * this module ships to the browser.
 */
const isProd = process.env.NODE_ENV === 'production';
/** Explicit value, else the local dev port in development, else the documented production subdomain. */
const clean = (v: string | undefined, dev: string, prod: string) => (v || (isProd ? prod : dev)).replace(/\/+$/, '');

export const siteUrls = {
  internPortal: clean(process.env.NEXT_PUBLIC_INTERN_PORTAL_URL, 'http://localhost:3002', 'https://intern.globalantic.com'),
  admin: clean(process.env.NEXT_PUBLIC_ADMIN_URL, 'http://localhost:3004', 'https://admin.globalantic.com'),
  trainer: clean(process.env.NEXT_PUBLIC_TRAINER_URL, 'http://localhost:3005', 'https://trainer.globalantic.com'),
  mainSite: clean(process.env.NEXT_PUBLIC_MAIN_SITE_URL, 'http://localhost:3000', 'https://globalantic.com'),
};

/**
 * Only internal relative paths are accepted as redirect targets (no open redirects).
 * Parsed like the browser does: URL parsing strips tab/CR/LF, so "/\t/evil.example" would
 * otherwise pass a string check and become "//evil.example".
 */
export function safeInternalPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null;
  const base = 'http://internal.invalid';
  try {
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export const REF_STORAGE_KEY = 'globalantic.ref';

/** Remembers a referral code for the apply form (per-browser convenience only; the server validates). */
export function rememberRef(code: string): void {
  try {
    window.localStorage.setItem(REF_STORAGE_KEY, code);
  } catch {
    // storage blocked: the code simply is not prefilled later
  }
}

export function recallRef(): string {
  try {
    return window.localStorage.getItem(REF_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
