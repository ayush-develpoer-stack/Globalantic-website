'use client';

import { useId, useRef, type KeyboardEvent } from 'react';
import styles from './Tabs.module.css';

export interface TabDef {
  id: string;
  label: string;
  /** Optional marker, e.g. an error count, rendered after the label. */
  badge?: React.ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  children: React.ReactNode;
}

/**
 * WAI-ARIA tabs: roving tabindex, ←/→/Home/End move between tabs, and the
 * panel is labelled by its tab. Only the active panel is rendered.
 */
export function Tabs({ tabs, active, onChange, label, children }: TabsProps) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === active);
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div className={styles.list} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={[styles.tab, selected ? styles.active : ''].filter(Boolean).join(' ')}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
              {tab.badge}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className={styles.panel}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
