/**
 * Theme constants shared by the inline pre-paint script (app/theme-script.ts)
 * and the client ThemeProvider. Kept dependency-free so both can import it.
 */
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

/** localStorage key holding the visitor's explicit choice ('light' | 'dark'). */
export const THEME_STORAGE_KEY = 'globalantic-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Applies a resolved theme to <html> so CSS tokens switch immediately. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
