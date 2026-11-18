'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, isTheme, THEME_STORAGE_KEY, type Theme, type ThemePreference } from '@/lib/theme';

interface ThemeContextValue {
  /** The theme currently applied to the page. */
  theme: Theme;
  /** What the visitor chose; 'system' until they pick one explicitly. */
  preference: ThemePreference;
  /** True once the provider has read the real theme on the client. */
  ready: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Owns the theme state on the client. The initial paint is handled by the
 * inline script in <head>; this provider takes over after hydration, persists
 * explicit choices and follows OS changes while the preference is 'system'.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render agree on 'light'/'system'; the real
  // values are read in an effect, so there is no hydration mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pref = readStoredPreference();
    const resolved = pref === 'system' ? systemTheme() : pref;
    setPreferenceState(pref);
    setTheme(resolved);
    applyTheme(resolved);
    setReady(true);
  }, []);

  // Follow the OS setting only while the visitor has not chosen explicitly.
  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = media.matches ? 'dark' : 'light';
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
      // Storage unavailable (private mode / policy) — the theme still applies
      // for this page view, it just will not persist.
    }
    setPreferenceState(next);
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  const value = useMemo(
    () => ({ theme, preference, ready, setPreference, toggleTheme }),
    [theme, preference, ready, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
