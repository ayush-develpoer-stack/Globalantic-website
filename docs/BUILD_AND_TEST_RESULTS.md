# Build & Test Results — 2026-10-17

**Machine:** Windows 11, Node v24.12.0, npm 11.6.2 (npm workspaces + turbo; root `package-lock.json`), 7.8 GB RAM (1–2 GB free during the run).

Everything below was **actually run** in this audit. "PASS" means the command exited 0 and the output was checked. The owner's dev servers were not running.

## A. Repository inventory
| Path | What | Framework / scripts | Own git repo? |
|---|---|---|---|
| `frontend/` | Main site + embedded CMS (`/admin/*`) | Next 15.5.27, React 19.2.8; `dev build start lint typecheck test check:contrast` | yes → `globalantic-web-frontend` |
| `training/` | Public training site (:3001) | Next 15; `dev build start lint typecheck` | yes → `globalantic-web-training` |
| `intern/` | Student/intern portal (:3002) | Next 15 | yes |
| `employee/` | Employee portal (:3003) | Next 15 | yes |
| `admin/` | Admin / finance / HR / CRM portal (:3004) | Next 15 | yes |
| `trainer/` | Trainer portal (:3005) | Next 15 | yes |
| `backend/` | Express 4 + Prisma 5.22 API (:4000) | `dev build(tsc) start(node dist/server.js) lint typecheck test prisma:* dev:db` | yes → `globalantic-web-backend` |
| `packages/{types,api-client,ui,auth,config,utils,validation}` | Shared TS packages (source-consumed; `typecheck` only) | — | no, root repo |
| `prisma/` | `schema.prisma` (83 models), 9 migrations, seeds | — | no, root repo |

**API entry:** `backend/src/server.ts` → `app.ts` (helmet → CORS allow-list → raw-body Razorpay webhook → JSON 1 MB → cookies → rate limits → 16 routers → 404 / error handler). Health: `/health/live`, `/health` (DB + schema version).

**Database:** PostgreSQL (Supabase): `DATABASE_URL` (pooler) for runtime, `DIRECT_URL` for migrations. Tests use embedded Postgres 17.

**⚠ Repository structure (release blocker R1):** the root repo stores the 7 apps only as **gitlinks** (mode 160000) and has **no `.gitmodules`**.
- A fresh clone of the root has empty app folders.
- The 5 portal repos import `@globalantic/*`, which exists only in the root repo.
- `backend` needs the root `prisma/`.
- **So no single repository builds on its own.** It works here only because all the folders sit side by side on disk.

## B. Build results
| App / package | Exact command | Result | Notes |
|---|---|---|---|
| backend | `npm --workspace backend run build` | **PASS** (×4, the last after all fixes) | `tsc` → `backend/dist` (dist is committed in the backend repo, so the build changes tracked files) |
| frontend | `NEXT_DIST_DIR=.next-verify NEXT_PUBLIC_API_URL=http://localhost:4100/api npm --workspace frontend run build` | **PASS**, 77/77 pages, 191 s | Prerendered against the isolated production-mode API |
| training | same pattern | **PASS**, 18/18 pages; rebuilt after the CSS fix and the UI package change | slow (580 s) while the internet was down (Google Fonts retries) |
| intern | same | **PASS**, 23/23 pages; rebuilt after the hooks fix | see the final portal rebuild row |
| employee | same | **PASS**, 15/15 pages | see the final portal rebuild row |
| admin | same | **PASS**, 55/55 pages; rebuilt 3× after fixes | — |
| trainer | same | **PASS**, 6/6 pages | see the final portal rebuild row |
| packages × 7 | `npm --workspace packages/<p> run typecheck` | **PASS** ×7 | No build script (consumed as source) |
| Final portal rebuild after the shared `packages/ui` change | `APPS="training intern employee trainer"` serial builds | **PASS**: training 580 s · intern 153 s · employee 57 s · trainer 60 s (admin rebuilt separately, PASS) | — |

These are the first verified production builds of training, intern, employee, admin and trainer. The previous attempt (`PRODUCTION_BUILD_REPORT.md`) was killed for low memory.

Each build's `tsconfig.json` was restored afterwards, and `next-env.d.ts` was reset with `git checkout`. The owner's `.next` folders were not touched.

**Secret scan of all build output:** 1,769 files; checked for the real `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`/`KEY` and `SEED_ADMIN_PASSWORD` values (by suffix match, nothing printed), plus connection-string and Resend-key patterns → **0 matches**.

**Build warnings:**
- "Using edge runtime on a page currently disables static generation" (OG image routes; expected).
- One `react-hooks/exhaustive-deps` warning in `intern/app/(portal)/exams/attempts/[id]/take/page.tsx`. **Fixed.**

## C. Static validation
| Check | Command | Result |
|---|---|---|
| Typecheck, 7 apps + 7 packages | `npm --workspace <w> run typecheck` | **PASS** ×14 (rerun on every touched workspace after the fixes) |
| ESLint, 7 apps | `npm --workspace <w> run lint` | **PASS** ×7 (`prefer-const` caught in my SSE edit and fixed, not suppressed) |
| Prisma schema | `npx prisma validate --schema prisma/schema.prisma` | First run **FAIL**: `P1012 DIRECT_URL not found`, because I ran it from the root without env. Rerun with placeholder URLs → **PASS**. Not a defect |
| Dependency tree | `npm ls --all --omit=optional` | Exit 1 only for an **extraneous** `@img/sharp-wasm32` (harmless leftover); no missing or invalid deps |
| Advisories | `npm audit --omit=dev` | 1 high (`postcss` via `next`, build-time only; the fix needs next 16) + 1 moderate. Documented, not force-upgraded |

## D. Automated tests
| Suite | Command | Result |
|---|---|---|
| Backend, first full run (before fixes) | `npm --workspace backend test` | 279/280; 1 load flake (`referral`: a P2028 transaction timeout reported as **400**, which led to fix D13). `npm test -- referral` alone → 10/10 |
| Backend, final full run (after all fixes) | same, with `API_COVERAGE_FILE` | **288 tests: 275 passed in the full run.** The 13 `payments.test.ts` tests failed only because that file's throwaway Postgres became unreachable mid-run (`Can't reach database server at 127.0.0.1:54472`; memory pressure). Rerun `npm test -- payments` → **13/13 PASS**. Final: **288/288 passing** |
| Backend, files touched by fixes | `npm test -- <file>` | notifications 17/17 · payments 13/13 · hardening 23/23 · auth 11/11 · admin-integration 13/13 · documents 8/8 · employee 7/7 |
| Frontend unit | `npm --workspace frontend test` | **79/79 PASS** (adds `safe-redirect.test.ts`) |
| Endpoint coverage | `scripts/api-inventory.ts` | **406/406** endpoints exercised with a 2xx (see `API_ROUTE_TEST_MATRIX.md`) |
| Regression tests proven to fail before the fix | — | SSE leak test failed **and hung** on the original route code; the open-redirect strings were accepted by the old check |

## E. Production-mode runtime
| Step | Result |
|---|---|
| Backend `node dist/server.js` with `NODE_ENV=production` against a throwaway, migrated and seeded UTF-8 Postgres (port 54990). Every key of `backend/.env` was overridden, so no production value was read | **PASS**. Clean boot; it lists unconfigured integrations by name (RESEND, RAZORPAY, COOKIE_DOMAIN) |
| `GET /health` · `/health/live` | 200 `{database:"up", schema:"current", pendingMigrations:0}` · 200 |
| API smoke (`api-smoke.mjs`) | **57/57**: headers, CORS, auth, cookie flags, token tampering, role isolation, CRM write + read-back, payments-off → 503, webhook signature, logout revocation, SSE |
| All 6 apps via `next start` (127.0.0.1:3100–3105) | **PASS**. Each ready in under 4 s; public sites 200; portals 307 → `/login` without a session |
| Frontend → backend URL | All API traffic in the crawl went to `http://localhost:4100/api` (the build-time `NEXT_PUBLIC_API_URL`); no other API origin was seen |
| Graceful shutdown | Mechanism tested (`endAllStreams` + close); a real SIGTERM can't be delivered on Windows. Verify on the Linux host |

## F. Browser end-to-end crawl (headless Edge over CDP; follows links only, never clicks buttons)
For every page: document status, console errors, uncaught exceptions (including React hydration errors), API responses ≥ 400, placeholder text (`undefined`, `NaN`, `[object Object]`, `TODO`, lorem), a blank page, horizontal overflow at 390 px, and form controls without labels.

| App (role) | Pages | Clean | Issues found → outcome |
|---|---|---|---|
| frontend (anonymous) | 70 | **70** | — |
| frontend CMS `/admin/*` (ADMIN) | 15 | **15** | — |
| training (anonymous) | 28 | 27 → **28** | `/programs/certificate` overflowed 54 px at 390 px (an unwrappable button label in a grid card) → **fixed**, re-crawl clean. One hydration error #418 on `/` during the DB outage; **not reproduced** in 3 clean reloads |
| intern (STUDENT) | 22 | **22** | — |
| employee (EMPLOYEE, created through `POST /api/hr/employees`) | 10 | **10** | — |
| admin (ADMIN) | 63 → 66 | 38 → **66** | 25 pages got **429** from the global per-IP limit → **fixed** (per-session limit). `/users` overflowed 99 px (`.sr-only` column label escaping the table scroller) → **fixed** (0 px). Blank `/roles` and `/programs/enrollments` plus a 503 were caused by the throwaway DB dropping; re-probed twice each → render fully, no errors |
| trainer (TRAINER) | 11 | **11** | First crawl blocked: its login was rate-limited like the admin pages; clean after the fix |

**Not covered by the crawl:**
- Button-driven flows (forms submitted, modals, uploads, payments).
- Tablet width.
- Keyboard-only navigation.

The backend suite covers those API paths. Earlier sessions' scripts (`exam-e2e`, `sales-e2e`, `final-e2e`) drove form flows in the browser, but they were **not re-run in this audit**.

## G. Environment limitations during this run
- **No internet** from about 18:00: `supabase.com`, `fonts.googleapis.com` and `api.razorpay.com` all failed to connect. So the **production Supabase migration status could not be checked** (P1001), and no live provider call was possible.
- Memory pressure caused two transient losses of the throwaway Postgres; they are noted against the affected results above.
