/** Display formatting shared by all portals (pure functions, server-safe). */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 250000 paise -> "₹2,500". Shows paise only when the amount is not whole rupees. */
export function formatINR(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  return paise % 100 === 0 ? inr.format(paise / 100) : inrExact.format(paise / 100);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

/** "14:30" -> "2:30 PM" */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Today's date in IST as YYYY-MM-DD (for date inputs / attendance). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Date input value (YYYY-MM-DD) from an ISO string. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Rupees typed in a form -> integer paise (the API's unit). */
export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === 'number' ? rupees : Number(String(rupees).replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}
