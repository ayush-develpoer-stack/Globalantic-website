'use client';

import { useId, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { PortfolioProject } from '@/types';
import { filterProjects } from '@/lib/portfolio';
import { PortfolioCard } from './PortfolioCard';
import styles from './PortfolioGrid.module.css';

interface PortfolioGridProps {
  projects: PortfolioProject[];
}

/**
 * Responsive portfolio grid with a category filter and text search. The full list is
 * server-rendered (every card is in the HTML for crawlers); filtering only hides cards.
 */
export function PortfolioGrid({ projects }: PortfolioGridProps) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchId = useId();

  const categories = useMemo(
    () => Array.from(new Set(projects.map((p) => p.category).filter((c): c is string => Boolean(c)))),
    [projects]
  );
  const filtered = useMemo(() => filterProjects(projects, { category: active, query }), [projects, active, query]);
  const filtering = Boolean(active || query.trim());

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {categories.length > 1 && (
          <div className={styles.filters} role="group" aria-label="Filter projects by category">
            {[null, ...categories].map((category) => {
              const isActive = category === active;
              return (
                <button
                  key={category ?? 'all'}
                  type="button"
                  className={[styles.filter, isActive ? styles.filterActive : ''].filter(Boolean).join(' ')}
                  aria-pressed={isActive}
                  onClick={() => setActive(category)}
                >
                  {category ?? 'All'}
                </button>
              );
            })}
          </div>
        )}
        {projects.length > 3 && (
          <div className={styles.search}>
            <label htmlFor={searchId} className="sr-only">
              Search projects
            </label>
            <Search size={16} className={styles.searchIcon} aria-hidden />
            <input
              id={searchId}
              type="search"
              className={styles.searchInput}
              placeholder="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
            />
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {filtering ? `${filtered.length} of ${projects.length} projects shown` : ''}
      </p>

      {filtered.length > 0 ? (
        <div className={styles.grid}>
          {filtered.map((project) => (
            <PortfolioCard key={project.slug} project={project} />
          ))}
        </div>
      ) : (
        <div className={styles.none}>
          <p>No projects match {query.trim() ? <>&ldquo;{query.trim()}&rdquo;</> : 'this filter'}.</p>
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setActive(null);
              setQuery('');
            }}
          >
            <X size={14} aria-hidden /> Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
