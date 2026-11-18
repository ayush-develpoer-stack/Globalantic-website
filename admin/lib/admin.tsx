'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@globalantic/api-client';
import { ConfirmDialog, useToast } from '@globalantic/ui';
import { enumLabel } from '@globalantic/types';
import s from './admin.module.css';

/** Options for <Select> from an enum list. */
export function enumOptions(values: readonly string[]) {
  return values.map((v) => ({ value: v, label: enumLabel(v) }));
}

/** Runs a mutation, toasts the outcome and returns the result (undefined on failure). */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success, 'success');
        return r;
      } catch (err) {
        toast(errorMessage(err), 'danger');
        return undefined;
      }
    },
    [toast],
  );
}

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  /** Throw to keep the dialog open and show the error inline. */
  onConfirm: (reason: string) => Promise<unknown>;
  success?: string;
}

/** One ConfirmDialog per page, opened imperatively with `ask(...)`. */
export function useConfirm() {
  const toast = useToast();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const ask = useCallback((o: ConfirmOptions) => setOpts(o), []);
  const dialog = (
    <ConfirmDialog
      open={opts !== null}
      title={opts?.title ?? ''}
      message={opts?.message}
      confirmLabel={opts?.confirmLabel}
      tone={opts?.tone}
      requireReason={opts?.requireReason}
      reasonLabel={opts?.reasonLabel}
      onClose={() => setOpts(null)}
      onConfirm={async (reason) => {
        if (!opts) return;
        await opts.onConfirm(reason);
        if (opts.success) toast(opts.success, 'success');
      }}
    />
  );
  return { ask, dialog };
}

/** Downloads rows as a CSV file (client-side, no server round-trip). */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Prevent spreadsheet formula injection (incl. leading tab/CR, as in trainer/lib/csv.ts) and quote properly.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Converts paise to a rupee string for editable inputs. */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  return String(paise / 100);
}

// ---------------------------------------------------------------------------
// Server-side sorting (`?sort=field:asc|desc`, whitelisted per list on the server)
// ---------------------------------------------------------------------------

export type SortDir = 'asc' | 'desc';

/** Holds the current `field:dir` sort value; `toggle(field)` flips asc/desc or switches field. */
export function useSort(initial?: string) {
  const [sort, setSort] = useState<string | undefined>(initial);
  const toggle = useCallback((field: string) => {
    setSort((cur) => {
      const [f, d] = (cur ?? '').split(':');
      if (f === field) return `${field}:${d === 'asc' ? 'desc' : 'asc'}`;
      return `${field}:asc`;
    });
  }, []);
  return { sort, toggle, setSort };
}

/**
 * Clickable, keyboard-accessible column header. It sets `aria-sort` on its
 * enclosing <th> (the shared DataTable renders the cell), so assistive tech
 * announces the current order.
 */
export function SortHeader({ label, field, sort, onSort }: { label: string; field: string; sort?: string; onSort: (field: string) => void }) {
  const [f, d] = (sort ?? '').split(':');
  const active = f === field;
  const dir: SortDir | null = active ? (d === 'asc' ? 'asc' : 'desc') : null;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const th = ref.current?.closest('th');
    if (th) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none');
  }, [dir]);
  return (
    <button ref={ref} type="button" className={s.sortBtn} onClick={() => onSort(field)} aria-label={`Sort by ${label}${dir ? `, currently ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}>
      <span>{label}</span>
      <span aria-hidden className={s.sortIcon}>{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}</span>
    </button>
  );
}
