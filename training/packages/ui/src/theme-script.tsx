/**
 * Server-safe (no "use client"): rendered in the root layout <head> so the
 * theme is applied before first paint.
 */
export const THEME_STORAGE_KEY = 'globalantic-theme';

export const themeScript = `(function () {
  var theme = 'light';
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (e) {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;

/** Inline <script> for the root layout <head>. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
