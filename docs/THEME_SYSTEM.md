# Theme system (frontend)

Applies to `frontend/` (the corporate website and the admin dashboard). It supports a light and a dark theme, with Globalantic purple as the brand colour in both.

## How it works

| Piece | File | Role |
|---|---|---|
| Tokens | `frontend/app/globals.css` | `:root` defines the light theme and `[data-theme='dark']` overrides it. Values are hand-tuned for each theme; dark mode is not an inversion. |
| Pre-paint script | `frontend/app/theme-script.ts`, inlined in `<head>` by `app/layout.tsx` | Runs before first paint and sets `data-theme` and `color-scheme` on `<html>`, so the wrong theme never flashes. |
| Provider | `frontend/components/theme/ThemeProvider.tsx` | Takes over after hydration. It stores explicit choices, follows OS changes while no choice has been made, and exposes `useTheme()`. |
| Toggle | `frontend/components/theme/ThemeToggle.tsx` | Light/dark button, placed in the site navbar, the mobile menu, the admin top bar and the admin login page. Both icons are rendered, and CSS shows the correct one from `data-theme`, so the icon is right before hydration. |
| Contrast check | `frontend/scripts/check-contrast.mjs` | Parses `globals.css` and verifies WCAG ratios for every foreground/background token pair in both themes. Run it with `npm --workspace frontend run check:contrast`. |

### Persistence and the first visit

1. **First visit**: nothing is stored, so the OS preference (`prefers-color-scheme`) decides the theme. While no choice is stored, the site follows OS changes live.
2. **Visitor clicks the toggle**: the choice (`light` or `dark`) is saved in `localStorage` under the key **`globalantic-theme`**. From then on it overrides the OS setting.
3. **Storage blocked** (private mode or browser policy): every read and write is wrapped in `try/catch`. The theme still applies for the current page view but isn't remembered.
4. **Hydration**:
   - `<html suppressHydrationWarning>` is used because the script changes `<html>` attributes before React hydrates.
   - The provider's first render uses fixed defaults and only reads the real theme in an effect.
   - Theme-dependent text, such as the toggle's label, is rendered only after `ready`.
   - Together these mean the server and client markup match.

## Semantic tokens

Components should use these names. Every text/background pair below is checked by `check:contrast`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` / `--foreground` | #ffffff / #14121f | #0b0a1a / #f5f4fb | Page background and body text |
| `--card` / `--card-foreground` | #ffffff / #14121f | #16132c / #f5f4fb | Cards, tables, panels |
| `--popover` / `--popover-foreground` | #ffffff / #14121f | #1b1736 / #f5f4fb | Modals, menus, toasts |
| `--muted` / `--muted-foreground` | #f7f5ff / #6b6880 | #12102a / #a19dba | Subtle surfaces and secondary or placeholder text |
| `--text-secondary` | #56546a | #b8b4cc | Paragraph and supporting text |
| `--border` / `--border-strong` | #eae7f2 / #d6d1e6 | #2a2448 / #3b3260 | Dividers |
| `--input` | #8f89a8 | #7a71a3 | Form control borders (≥3:1 against `--card`) |
| `--ring` | #8b5cf6 | #a78bfa | Focus outline (≥3:1) |
| `--primary` / `--primary-foreground` | #6d22e6 / #fff | #7c3aed / #fff | Brand fills (buttons, active navigation) |
| `--primary-hover` | #5a17c4 | #6d28d9 | Hover state of brand fills |
| `--primary-text` | #6d22e6 | #b794ff | **Purple text** on surfaces (links, eyebrows, icons). Use this rather than `--primary` for text. |
| `--secondary` / `--secondary-foreground` | #17132a / #fff | #2a2350 / #fff | Dark secondary buttons |
| `--accent` / `--accent-foreground` / `--accent-border` | #f4efff / #4b14a8 / #e9defd | #241c4a / #d9c8ff / #33296a | Lavender tint chips, pills, icon tiles |
| `--success` | #15803d | #4ade80 | Status text and icons (text-safe on cards) |
| `--warning` | #b45309 | #fbbf24 | Same |
| `--destructive` / `--destructive-foreground` | #dc2626 / #fff | #f87171 / #1a0606 | Errors and destructive actions |
| `--info` | #1d4ed8 | #93c5fd | Informational status |
| `--sidebar` / `--sidebar-foreground` / `--sidebar-border` / `--sidebar-accent` | white / #3c3a4f / … | #100e24 / #cfcbe3 / … | Admin sidebar |
| `--inverse` / `--inverse-foreground` / `--inverse-muted` / `--inverse-subtle` | #0b0a1a / #fff / #cfcadd / #a8a2bf | #060512 / #fff / #cfcadd / #a8a2bf | Always-dark brand bands: hero mock window, footer, CTA bands |
| `--overlay` | rgba(13,11,23,.55) | rgba(3,2,10,.7) | Modal and drawer backdrops |
| `--chart-1` … `--chart-5` | purple, teal, amber, pink, blue | lighter variants | Charts (the dashboard activity overview) |

**Legacy aliases** (`--text-primary`, `--text-muted`, `--surface`, `--surface-2`, `--background-soft`, `--danger`, `--primary-50`, `--primary-100`, `--primary-dark`, `--text-on-primary`, `--text-on-dark`, `--surface-elevated`, `--surface-dark`) are defined in terms of the semantic tokens. Existing CSS modules therefore switch themes without edits. Prefer the semantic names in new code.

### Contrast results (`npm --workspace frontend run check:contrast`, 2026-10-14)

All 28 pairs pass in both themes. The lowest ratios are:

| Pair | Light | Dark |
|---|---|---|
| `--input` on `--card` | 3.33:1 | 4.05:1 (required 3:1) |
| `--ring` on `--background` | 4.23:1 | 7.19:1 (required 3:1) |
| `--destructive` on `--card` | 4.83:1 | 6.52:1 |
| `--primary-foreground` on `--primary` | 6.95:1 | 5.70:1 |

## Rules for new UI

- Use semantic tokens. Don't use hex or rgba values in components, except decorative illustration (for example the code-editor mock in the hero) that sits on an always-dark surface.
- Purple **text** uses `--primary-text`. Purple **fills** use `--primary`, with `--primary-foreground` text.
- Status is never shown by colour alone. `StatusBadge` and toasts always include an icon and a text label.
- Tints use `color-mix(in srgb, var(--token) N%, transparent)`, so they follow the theme.
- After changing a token value, run `check:contrast`.

## Changes made in this pass

- Added the semantic token layer and a complete dark palette. The previous dark block had no brand, tint or status values and was never activated.
- Removed a stale `--ring` box-shadow definition that silently overrode the focus-ring colour. The contrast script caught it.
- Raised low-contrast values:
  - `--text-muted` went from #8a8a99 (3.4:1) to #6b6880 (5.4:1).
  - `--success` went from #16a34a (3.3:1) to #15803d (5.0:1).
  - `--warning` went from #f59e0b (2.1:1) to #b45309 (5.0:1).
  - The button gradient end went from #a66cff, where white text fell below 4.5:1, to #8440ee.
- Replaced hardcoded colours in CSS modules: `#fff` text became `--primary-foreground` or `--inverse-foreground`, footer greys became `--inverse-*`, and status tints, overlays and focus shadows became tokens.
- Form inputs now use `--input` borders (3.3:1) instead of the near-invisible `--border`.

## Portals (training, intern, admin, trainer) — added 2026-10-15
- The four portal apps share the main site's tokens through `@globalantic/ui/styles/globals.css`. It is a byte-identical copy of the token, reset and utility section of `frontend/app/globals.css`, so **edit both together**.
- `ThemeScript` (server-safe, `packages/ui/src/theme-script.tsx`) goes in each root layout's `<head>`. `ThemeProvider` / `ThemeToggle` / `useTheme` live in `packages/ui/src/theme.tsx`. The storage key is the same as the main site (`globalantic-theme`).
- Shared primitives (`packages/ui/src/ui.module.css`, `shell.module.css`) use semantic tokens only. Status colours use `color-mix()` over `--success`, `--warning`, `--destructive` and `--info`, so badges and alerts follow the theme.
- Verified with headless Edge in light and dark at 360 and 1280 px for all four apps (see TESTING.md §3).
