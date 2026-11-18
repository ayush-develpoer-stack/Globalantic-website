'use client';

import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { humanizeStatus } from '@/components/ui/StatusBadge';
import styles from '@/app/admin/admin.module.css';

interface ListToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  status?: string;
  statuses?: readonly string[];
  statusLabel?: string;
  onStatus?: (value: string) => void;
  hasFilters: boolean;
  onReset: () => void;
  /** Extra controls on the right (e.g. a "New" button). */
  actions?: React.ReactNode;
}

const SEARCH_DEBOUNCE_MS = 300;

/** Search (debounced), status filter and "Reset filters" for admin lists. */
export function ListToolbar({
  search,
  onSearch,
  searchPlaceholder,
  status = 'ALL',
  statuses,
  statusLabel = 'Status',
  onStatus,
  hasFilters,
  onReset,
  actions,
}: ListToolbarProps) {
  const searchId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState(search);

  // Keep the input in sync when the URL changes (back button, reset).
  useEffect(() => {
    setDraft((current) => (current.trim() === search ? current : search));
  }, [search]);

  useEffect(() => {
    if (draft.trim() === search) return;
    const timer = window.setTimeout(() => onSearch(draft.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, search, onSearch]);

  return (
    <div className={styles.toolbar}>
      <form
        role="search"
        className={styles.searchBox}
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(draft.trim());
        }}
      >
        <label htmlFor={searchId} className="sr-only">
          Search
        </label>
        <Search size={16} className={styles.searchIcon} aria-hidden />
        <input
          id={searchId}
          type="search"
          className={styles.searchInput}
          placeholder={searchPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
        />
      </form>

      {statuses && onStatus && (
        <div className={styles.filterGroup}>
          <label htmlFor={statusId} className={styles.filterLabel}>
            {statusLabel}
          </label>
          <select id={statusId} className={styles.filterSelect} value={status} onChange={(e) => onStatus(e.target.value)}>
            <option value="ALL">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {humanizeStatus(s)}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasFilters && (
        <button type="button" className={styles.resetBtn} onClick={onReset}>
          <X size={14} aria-hidden /> Reset filters
        </button>
      )}

      {actions && <div className={styles.toolbarActions}>{actions}</div>}
    </div>
  );
}
