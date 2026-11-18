'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './DropdownMenu.module.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

interface DropdownMenuProps {
  /** Content of the trigger button. */
  trigger: React.ReactNode;
  /** Accessible name for the trigger. */
  label: string;
  items: MenuItem[];
  /** Optional non-interactive header (e.g. signed-in user). */
  header?: React.ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
}

/**
 * Menu button (WAI-ARIA pattern): Enter/Space/↓ open and focus the first item,
 * ↑/↓/Home/End move, Escape closes and returns focus, clicks outside close.
 */
export function DropdownMenu({ trigger, label, items, header, align = 'end', triggerClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  function openMenu(focusIndex: number) {
    setOpen(true);
    // Wait for the menu to render before moving focus into it.
    requestAnimationFrame(() => focusItem(focusIndex));
  }

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(enabled[0] ?? 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(enabled[enabled.length - 1] ?? 0);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabled.indexOf(current);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(enabled[(pos + 1) % enabled.length]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(enabled[(pos - 1 + enabled.length) % enabled.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(enabled[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(enabled[enabled.length - 1]);
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName ?? styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : openMenu(enabled[0] ?? 0))}
        onKeyDown={onTriggerKey}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={[styles.menu, align === 'start' ? styles.alignStart : styles.alignEnd].join(' ')}
          onKeyDown={onMenuKey}
        >
          {header && (
            <div className={styles.header} role="presentation">
              {header}
            </div>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                className={[styles.item, item.tone === 'danger' ? styles.danger : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {Icon && <Icon size={16} aria-hidden />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
