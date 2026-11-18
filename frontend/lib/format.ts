/**
 * Display formatters. A fixed locale + time zone keeps server and client
 * output identical (no hydration mismatches from the visitor's locale).
 */
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | null | undefined): string {
  const d = parse(value);
  return d ? DATE.format(d) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parse(value);
  return d ? `${DATE_TIME.format(d)} IST` : '—';
}

/** Renders null/empty values as an em dash. */
export function orDash(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}
