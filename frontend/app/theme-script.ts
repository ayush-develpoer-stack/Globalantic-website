import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Inline script rendered in <head> so the correct theme is applied before the
 * first paint (no flash of the wrong theme). It reads the stored preference,
 * falls back to the OS setting, and never throws — localStorage can be blocked
 * in private windows or by browser policy.
 */
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
