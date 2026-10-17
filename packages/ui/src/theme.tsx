'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import styles from './ThemeToggle.module.css';

/**
 * Light/dark theme for every portal (same behaviour as the main site):
 * - `themeScript` runs in <head> before first paint → no flash of the wrong theme
 * - first visit follows the OS setting; an explicit choice is persisted
 * - tokens switch via <html data-theme>, so components only use CSS variables
 */
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

import { THEME_STORAGE_KEY } from './theme-script';

export { THEME_STORAGE_KEY };

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  ready: boolean;
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStored(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemTheme = (): Theme => (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pref = readStored();
    const resolved = pref === 'system' ? systemTheme() : pref;
    setPref(pref);
    setTheme(resolved);
    applyTheme(resolved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next: Theme = media.matches ? 'dark' : 'light';
      setTheme(next);
      applyTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    const resolved = next === 'system' ? systemTheme() : next;
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage blocked: applies for this page view only
    }
    setPref(next);
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [setPreference, theme]);
  const value = useMemo(() => ({ theme, preference, ready, setPreference, toggleTheme }), [theme, preference, ready, setPreference, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** Both icons render; CSS shows the right one from <html data-theme>, so it is correct before hydration. */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, ready, toggleTheme } = useTheme();
  const label = ready ? (theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme') : 'Toggle colour theme';
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

