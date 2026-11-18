'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/StateView';
import type { SortDirection } from '@/types';
import styles from '@/app/admin/admin.module.css';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  /** Enables a sort button in the header (the key is sent as `sort`). */
  sortable?: boolean;
  align?: 'start' | 'end';
  /** Visually hide the header text (still read by screen readers). */
  hideLabel?: boolean;
}

interface DataTableProps<T> {
  /** Table caption for screen readers, e.g. "Contact leads". */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  /** Rendered instead of the body when there are no rows (and not loading). */
  empty?: ReactNode;
  sort?: string;
  direction?: SortDirection;
  onSortChange?: (key: string, direction: SortDirection) => void;
  skeletonRows?: number;
}

/**
 * Typed, accessible table: captioned, sortable headers expose aria-sort, and
 * loading shows skeleton rows instead of a blank table.
 */
export function DataTable<T extends { id: string }>({
  caption,
  columns,
  rows,
  loading,
  empty,
  sort,
  direction,
  onSortChange,
  skeletonRows = 5,
}: DataTableProps<T>) {
  if (!loading && rows.length === 0 && empty) {
    return <div className={styles.tableWrap}>{empty}</div>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort === col.key;
              const ariaSort = active ? (direction === 'desc' ? 'descending' : 'ascending') : undefined;
              const SortIcon = active ? (direction === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (ariaSort ?? 'none') : undefined}
                  className={col.align === 'end' ? styles.alignEnd : undefined}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      className={[styles.sortBtn, active ? styles.sortActive : ''].filter(Boolean).join(' ')}
                      onClick={() => onSortChange(col.key, active && direction === 'asc' ? 'desc' : 'asc')}
                    >
                      {col.label}
                      <SortIcon size={13} aria-hidden />
                    </button>
                  ) : col.hideLabel ? (
                    <span className="sr-only">{col.label}</span>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, r) => (
                <tr key={`skeleton-${r}`} aria-hidden>
                  {columns.map((col, c) => (
                    <td key={col.key}>
                      <Skeleton width={c === 0 ? '70%' : col.align === 'end' ? 80 : '55%'} height={12} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((col) => (
                    <td key={col.key} className={col.align === 'end' ? styles.alignEnd : undefined}>
                      {col.render ? col.render(row) : defaultCell((row as Record<string, unknown>)[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function defaultCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
