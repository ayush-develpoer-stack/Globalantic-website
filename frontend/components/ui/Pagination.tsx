'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '@/lib/query';
import type { PageMeta } from '@/types';
import styles from './Pagination.module.css';

interface PaginationProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Noun for the summary line, e.g. "leads". */
  itemLabel?: string;
}

/** Page numbers with ellipses: 1 … 4 5 6 … 12 */
function pageWindow(page: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | 'gap')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) pages.push('gap');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('gap');
  pages.push(total);
  return pages;
}

export function Pagination({ meta, onPageChange, onPageSizeChange, itemLabel = 'items' }: PaginationProps) {
  const { page, pageSize, total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={styles.bar}>
      <p className={styles.summary} aria-live="polite">
        {total === 0 ? `No ${itemLabel}` : `Showing ${from}–${to} of ${total} ${itemLabel}`}
      </p>

      <div className={styles.controls}>
        {onPageSizeChange && (
          <label className={styles.sizeLabel}>
            <span>Rows</span>
            <select
              className={styles.sizeSelect}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        {totalPages > 1 && (
          <nav aria-label="Pagination">
            <ul className={styles.pages}>
              <li>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>
              </li>
              {pageWindow(page, totalPages).map((p, i) =>
                p === 'gap' ? (
                  <li key={`gap-${i}`} className={styles.gap} aria-hidden>
                    …
                  </li>
                ) : (
                  <li key={p}>
                    <button
                      type="button"
                      className={[styles.pageBtn, p === page ? styles.current : ''].filter(Boolean).join(' ')}
                      onClick={() => onPageChange(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </button>
                  </li>
                ),
              )}
              <li>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
