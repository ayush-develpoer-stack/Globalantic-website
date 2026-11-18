'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  className?: string;
  /** Show a text label next to the icon (used in the mobile menu). */
  showLabel?: boolean;
}

/**
 * Light/dark switch. Both icons are rendered and CSS shows the right one from
 * <html data-theme>, so the icon is correct on first paint before hydration.
 */
export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, ready, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = ready ? (isDark ? 'Switch to light theme' : 'Switch to dark theme') : 'Toggle colour theme';

  return (
    <button
      type="button"
      className={[styles.toggle, showLabel ? styles.withLabel : '', className ?? ''].filter(Boolean).join(' ')}
      onClick={toggleTheme}
      aria-label={showLabel ? undefined : label}
      title={label}
    >
      <Sun size={18} className={styles.sun} aria-hidden />
      <Moon size={18} className={styles.moon} aria-hidden />
      {showLabel && <span>{label}</span>}
    </button>
  );
}
