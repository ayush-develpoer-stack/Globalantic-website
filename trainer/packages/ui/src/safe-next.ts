/**
 * Only allows internal relative paths as post-login destinations (no open redirects).
 * The value is parsed the way the browser will parse it: URL parsing strips tab/CR/LF, so a
 * string check alone lets "/\t/evil.example" through and it becomes "//evil.example".
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/')) return fallback;
  const base = 'http://internal.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;
  return url.pathname + url.search + url.hash;
}
