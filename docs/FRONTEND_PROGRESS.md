# Frontend progress — mock mode + light/dark theme

**Date:** 2026-10-14
**Scope:** `frontend/` only, covering the corporate website and the admin dashboard at `/admin`. No backend, database, env-secret or other-app changes were made.
**Related docs:** [THEME_SYSTEM.md](THEME_SYSTEM.md) · [MOCK_API_MODE.md](MOCK_API_MODE.md)

## 1. What was completed

### Screen completed: admin dashboard (`/admin/*`)
This was the only multi-screen UI with a sidebar, tables, filters and CRUD, and it couldn't work at all without the API. It now runs entirely in mock mode and is unchanged in behaviour against the real API.

| Area | Delivered |
|---|---|
| Shell | Persistent dashboard layout: the session is checked once, not on every page. The sidebar is grouped into Overview, Website content, Leads & applications and System. Breadcrumbs, a theme toggle and an account dropdown (with Settings and Sign out) sit in the top bar, plus a skip link. On mobile the sidebar becomes a drawer with Escape and focus handling. |
| Auth UX | Login with zod field errors, generic credential errors, spinner and disabled submit, and a `?next=` return that accepts only same-app `/admin/…` paths (no open redirect). The demo-account hint is shown only in mock mode. Sign-out confirms the action. |
| Dashboard | Seven stat cards, each linking to its filtered list, with skeletons while loading. A recent-leads table, an "Activity overview" bar chart using the chart tokens with numeric labels, and error and retry states. |
| Contacts, Training applications, Career applications, Newsletter | One config-driven `LeadsManager` handles all four: debounced search, status filter, sortable columns (`aria-sort`), pagination with a rows-per-page setting, all state kept in the URL (survives refresh, shareable), inline status change confirmed in place, a details dialog, delete through a confirmation dialog, toasts, and separate empty states for "no data" and "no results". |
| Services, Solutions, Industries, Portfolio, Blog (CMS) | The rebuilt `CmsManager` adds: search, a visibility filter (Published/Draft), sorting, pagination, a create/edit dialog with field-level zod errors, slug suggestion from the title, JSON-field parse errors, server errors such as a duplicate slug mapped onto the right field, an "Unsaved changes" indicator, double-submit prevention, publish/unpublish confirmed in place, confirmed delete, and toasts. |
| Settings | Tabs (General · Contact & social · SEO) with arrow-key navigation, per-field validation (email, URLs, required fields), error counts on tab labels, a jump to the first invalid tab, Save disabled until something changes, Discard changes, and toasts. |

### Website (`frontend/app/(marketing)`)
- Every page renders from the mock content layer, so the site works with no backend. A mock production build prerenders all **69** routes, including 14 service, 10 solution, 12 industry and 2 blog detail pages.
- The four public forms (contact, training, careers, newsletter) use shared schemas that mirror the backend. Field errors and server errors are handled, entered values are kept on failure, and success states are shown. The training form's minimum age is fixed (the client used to allow 10 while the server required ≥ 15).
- A theme toggle is in the navbar and the mobile menu. The mobile menu gained Escape-to-close, focus moving into the menu, `aria-expanded`/`aria-controls` and a dialog role.

### Theme system
Light and dark themes with semantic tokens, a no-flash pre-paint script, persistence, and the system preference on first visit. See THEME_SYSTEM.md.

### Bugs found and fixed during verification
| Bug | Found by | Fix |
|---|---|---|
| A stale `--ring` box-shadow token overrode the focus-ring colour | `check:contrast` script | Removed it |
| Low-contrast text: muted text 3.4:1, success 3.3:1, warning 2.1:1, white on the gradient end below 4.5:1 | `check:contrast` | Retuned the token values |
| The navbar CTA was clipped at 1081–1366 px after adding the toggle; 10 links and the actions don't fit below about 1180 px | Headless browser measurement | Tightened spacing up to 1480 px; burger breakpoint moved from 1080 to 1180 px |
| **The mobile menu never displayed its links.** The header's `backdrop-filter` made the 72 px header the containing block for the fixed menu. This existed before this work. | Screenshot review | Menu rendered through a portal on `<body>` |
| The off-canvas menu panel widened the page's scrollable area | Browser overflow trace | `overflow: hidden` on the menu overlay |
| Admin pages were 864 px wide on phones: `.sr-only` text inside table rows escaped the scroll wrapper | Browser overflow trace | `.tableWrap { position: relative }`, plus `min-width: 0` on the content column |
| The dashboard's recent-leads table hid a column at 1280 px | Screenshot review | The dashboard grid stacks below 1320 px |
| The backslash check in the redirect guard was a syntax error (`'\'`) | Unit tests | Fixed to `'\\'` |
| The search box could strip a trailing space while typing | Code review | Comparisons use the trimmed value |
| The mobile menu's Escape listener re-attached and stole focus on every parent re-render | Code review | Handler held in a ref |

## 2. Files

**New**
- `lib/api/config.ts`, `lib/api/errors.ts`, `lib/api/http.ts`: data-source configuration, `ServiceError`, and the only HTTP client.
- `lib/mock/content.ts`, `lib/mock/runtime.ts`, `lib/mock/store.ts`, and `lib/mock/fixtures/{leads,users}.ts`. `lib/mock/fixtures/content/*` are copies of `prisma/data`.
- `lib/query.ts`, `lib/format.ts`, `lib/theme.ts`, `lib/auth/redirect.ts`, `lib/validation/{forms,admin}.ts`.
- `services/{content,forms,auth}.service.ts` and `services/admin/{cms,leads,dashboard,settings}.service.ts`.
- `hooks/useServiceQuery.ts`, `hooks/useListParams.ts`.
- `app/theme-script.ts`, `app/admin/dashboard/layout.tsx`.
- `components/theme/ThemeProvider.tsx`, `ThemeToggle.tsx` and its CSS.
- `components/ui/{Toast,ConfirmDialog,Pagination,StateView,Tabs,DropdownMenu,StatusBadge}.tsx` and their CSS.
- `components/admin/{AdminSession,ListToolbar,LeadsManager,leadConfigs}.tsx`.
- `scripts/check-contrast.mjs`, `tests/register.mjs`, and `tests/{query,validation,mock-services,scenarios,platform}.test.ts`.
- `docs/THEME_SYSTEM.md`, `docs/MOCK_API_MODE.md`, `docs/FRONTEND_PROGRESS.md`.

**Modified**
- `app/globals.css` (token layer), `app/layout.tsx` (script and provider), `app/admin/layout.tsx` (toasts), `app/admin/admin.module.css` (rewritten).
- `app/admin/login/page.tsx`, `app/admin/dashboard/page.tsx` and all 10 admin sub-pages.
- `components/admin/{AdminShell,DataTable,CmsManager}.tsx`.
- `components/ui/{Modal,Button}.tsx` and `{Modal,Button,Input,Badge}.module.css`.
- The four public form components and three of their CSS modules.
- `components/layout/{Navbar,MobileMenu}.tsx` and their CSS.
- Colour-token replacements across about 36 CSS modules: purple text now uses `--primary-text`, white text uses `--primary-foreground` or `--inverse-*`.
- `lib/api.ts` (now a facade with the same exports, so the 15 public pages are unchanged), `lib/config.ts` (removed the duplicate `apiUrl`), `types/index.ts` (list and admin types), `package.json` (`test` and `check:contrast` scripts), `.env.example` (public placeholders only), `app/not-found.tsx`, `app/(marketing)/industries/[slug]/page.tsx`.

**Removed** (every import moved first)
- `lib/client-api.ts`, replaced by `lib/api/http.ts` and the services.
- `components/admin/useAuthGuard.ts`, replaced by `AdminSession`.

## 3. Verification: commands and exact results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm --workspace frontend run typecheck` | **PASS** (exit 0) |
| ESLint | `npm --workspace frontend run lint` | **PASS**: "No ESLint warnings or errors" |
| Unit tests | `npm --workspace frontend test` | **PASS**: 40 tests, 40 pass, 0 fail |
| Contrast | `npm --workspace frontend run check:contrast` | **PASS**: all 28 pairs in both themes |
| Production build, mock mode | `NEXT_PUBLIC_DATA_SOURCE=mock next build` (scratch copy of `frontend/`, see the note below) | **PASS**: exit 0, 69/69 pages |
| Production build, API mode (production default) | `next build` with `NEXT_PUBLIC_DATA_SOURCE` unset | **PASS**: exit 0, 69/69 pages, prerendered from the live local backend (see §4) |
| Browser QA: theme | Headless Microsoft Edge driven over CDP (scratchpad script), against the mock production build | **16/16 PASS** |
| Browser QA: app | Same harness | **66/66 PASS** on the final build |
| Console errors / uncaught exceptions / hydration errors | Collected on every page load in both suites | **None** |
| Secrets in frontend code | Search for backend secret names and any non-`NEXT_PUBLIC_*` `process.env` reads | **None found** |

The theme suite verifies:
- the first visit follows the OS preference, in both directions
- the theme is already correct at the **first animation frame** (no flash)
- the toggle persists across reloads and overrides the OS
- the theme carries across pages
- the computed backgrounds are right
- the toggle has an accessible label

The app suite verifies:
- the navbar fits at 1181, 1240, 1300, 1366, 1440 and 1536 px
- there's no horizontal scroll at 375 px on 11 pages
- the mobile menu opens full height with every link clickable, the toggle works inside it, focus moves in, and Escape closes it
- contact form validation, value preservation and success
- auth redirect with `?next`, login errors, and return to the requested page
- dashboard data
- pagination, debounced search, URL state surviving a reload, reset, `aria-sort` and the status filter
- inline status change with a toast
- the details dialog: labelled, closes on Escape, returns focus
- confirmed delete
- CMS: create with errors, slug suggestion, JSON errors, duplicate slug, create, publish toggle, edit and dirty state
- settings: tabs, jump to the error, save
- admin on mobile: drawer focus and Escape, no page overflow
- the error, empty and slow (skeleton) scenarios, with retry
- account menu, sign out, and the dashboard locking again

**Honesty notes**
- Runs of the browser suites were not all green. Intermediate runs failed on real bugs, which are fixed and listed in §1, and twice on harness timing:
  - One run timed out on four steps when the app suite started immediately after the theme suite on a loaded machine. Rerun alone, it passed 65/65.
  - The final suite passed 66/66.
- Builds inside `frontend/.next` intermittently failed with `e[o] is not a function` and `PageNotFoundError`. The cause turned out to be your **`npm run dev` servers running at the same time** and writing to the same `.next` folder, possibly made worse by OneDrive sync. The verified builds were therefore run in a scratch copy of `frontend/`, which is identical source with `node_modules` linked. Build in the repo when the dev server is stopped.
- Screenshots were reviewed by eye for light, dark, desktop and mobile on the home page, admin dashboard, dialogs, error state, drawer and mobile menu. **Not covered:** real iOS/Android devices, screen-reader software (NVDA/VoiceOver), and browsers other than Chromium-based Edge.

## 4. Status of the backend connection (observed during this session)

The audit earlier today found the database unreachable. By the end of this session your local backend (`npm run dev`, port 4000) answered `GET /api/services` (14), `/api/blog` (2) and `/api/settings` successfully, so the database connection has been restored. Only these read-only GET requests were made. Admin login and writes in API mode were **not** tested, because they need real credentials.

## 5. Remaining frontend gaps

| Gap | Notes |
|---|---|
| API-mode admin flows not exercised | The adapters are written and unit-tested at the HTTP layer, but signing in and running CRUD against the real backend needs real admin credentials. |
| Server-side admin route protection | Still client-side only (no `middleware.ts`). It needs the cookie domain/`SameSite` decision from the backend work (audit GA-006 and GA-009). |
| API pagination and sorting | Applied on the client until the backend supports them (GA-012). See MOCK_API_MODE.md. |
| Blog category picker | The CMS still asks for a raw category ID; it should be a select fed by `/blog-categories`. |
| Mock store resets on full reload | By design. Edits survive client-side navigation only. |
| Unsubscribe flow | The newsletter email promises it, but no endpoint or page exists yet. |
| Other apps | `training/`, `intern/`, `employee/`, `admin/` and `trainer/` are untouched placeholder shells. |
| Next.js security upgrade | `next@14.2.35` still carries critical advisories (audit GA-004); upgrading to ≥15.5.24 is a separate, approval-gated step. |
| E2E in CI | The browser harness is a local scratch tool (Windows Edge path). A portable Playwright suite would need a new dev dependency, which needs your approval. |
| `docs/IMPLEMENTATION_STATUS.md` | Doesn't exist yet, so it wasn't updated. |
