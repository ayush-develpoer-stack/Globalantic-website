import { enumLabel } from '@globalantic/types';

/** Select options from an enum value list. */
export const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: enumLabel(v) }));

/** YYYY-MM-DD for "today minus n days" in IST. */
export function istDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - offsetDays * 86_400_000));
}

/** Current month as YYYY-MM in IST. */
export const istMonth = () => istDate().slice(0, 7);

/** Clock time (IST) of an ISO timestamp. */
export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
