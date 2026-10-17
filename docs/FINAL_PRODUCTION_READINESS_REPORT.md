# Final Production Readiness Report — 2026-10-17

## Classification: **NOT READY — BLOCKING ISSUES REMAIN**

The **code** passes every check that could be run here:
- 7/7 production builds;
- 288/288 backend tests and 79/79 frontend tests;
- 406/406 API endpoints exercised by tests;
- a 57/57 production-mode API smoke check;
- 222 pages crawled across 6 apps and 7 roles, all clean after the fixes.

It would be ready for a **controlled staging test** once B1 and B2 below are resolved.

It is not ready for production, for these reasons:
- the git setup cannot produce a deployable checkout (B1);
- production credentials sit in git history and must be rotated (B2);
- the production database state could not be re-verified today (B3);
- payments and email are not configured for production (B4, B5).

Companion documents:
- `BUILD_AND_TEST_RESULTS.md`: every command and result.
- `API_ROUTE_TEST_MATRIX.md`: all 406 routes.
- `SECURITY_AND_DATABASE_AUDIT.md`: the security fixes and open items.
- `PRODUCTION_RUN_COMMANDS.md`: PowerShell commands.

## What was verified end to end
| Area | How | Result |
|---|---|---|
| Authentication | Login/logout, generic errors, `alg=none` and malformed tokens, revocation after logout, cookie flags in prod mode; suite: register → verify email → login, reset (single-use), session revoke on reset, per-account lockout | ✅ |
| Authorisation / isolation | 10 cross-role denial checks in prod mode; suite tests for student, trainer, employee, CRM-owner and notes scoping | ✅ (2 scoping gaps found and fixed: notes, documents) |
| Database persistence | Independent read-backs in the suite; prod smoke: contact form → CRM lead visible to admin | ✅ against embedded Postgres. **Not** against Supabase today (no internet) |
| Portals | Browser crawl as ADMIN, STUDENT, EMPLOYEE (created via the HR API), TRAINER and anonymous; CMS as site ADMIN | ✅ after the fixes (rate limiting, 2 mobile overflows) |
| CRM | Lead capture, duplicate linking (seen live), assignment rules, scoped visibility, notifications | ✅ suite + smoke |
| Notifications | Fan-out, dedupe, read/unread, SSE live + Last-Event-ID replay, deliveries, cron dispatch | ✅ suite (SSE leak and shutdown fixed) |
| Payments (Razorpay) | Fake gateway at the HTTP boundary: order amounts from the DB, signature + provider re-fetch, webhook HMAC + event dedupe, idempotent mark-paid, failed/captured ordering, refunds | ✅ suite (partial-refund bug fixed). **No live Razorpay call made** |
| Email | Test outbox; delivery status in `email_logs`; prod mode with no key → SKIPPED, now reported truthfully | ✅ logic. **No real email sent** |
| Uploads | Magic bytes, size, private/public access, image upload | ✅ suite |
| SEO / indexing | Not re-audited this session; the robots/indexing gate is unchanged (`SEO_IMPLEMENTATION_REPORT.md`) | — |

## E. Defects fixed in this audit (17)
| # | Area | Root cause | Files changed | Regression test |
|---|---|---|---|---|
| D1 | Open redirect on login (4 portals + training) | URL parsing strips TAB/LF | `packages/ui/src/safe-next.ts` (new), `packages/ui/src/session.tsx`, `training/lib/config.ts` | `frontend/tests/safe-redirect.test.ts` |
| D2 | Partial refund treated as full refund | Unconditional `markRefunded` | `backend/src/services/payment.service.ts` | payments.test.ts |
| D3 | SSE slot/timer leak | Listeners attached after awaits | `backend/src/routes/notifications.routes.ts` | notifications.test.ts (fails + hangs on old code) |
| D4 | Shutdown hangs with open SSE | No stream close or force timeout | `backend/src/server.ts`, `notifications.routes.ts` (`endAllStreams`) | notifications.test.ts |
| D5 | Account enumeration by timing | Awaited DB + email before responding | `backend/src/controllers/auth.controller.ts`, `services/auth.service.ts` | auth.test.ts + prod smoke |
| D6 | Notes readable/deletable outside the role's domain | No target or author scoping | `services/admin-platform.service.ts`, `routes/hr.routes.ts` | admin-integration.test.ts |
| D7 | Document party could copy another rep's lead or any student | Check skipped when `clientId` given | `services/document.service.ts` | documents.test.ts |
| D8 | HTML injection in staff emails | Unescaped title in `layout()` | `services/email.service.ts` | notifications.test.ts |
| D9 | CSV formula injection (TAB/CR) | Incomplete regex | `admin/lib/admin.tsx` | review + typecheck/lint |
| D10 | **Fake "invitation sent" / "reset link sent" messages** | Hard-coded success text; `send()` hid SKIPPED | `services/{auth,hr,admin-platform,training-email}.service.ts`, `routes/{hr,admin.training}.routes.ts`, `admin/app/(portal)/{employees,staff,users/[id]}/page.tsx` | employee.test.ts + live prod check (SKIPPED reported) |
| D11 | Staff throttled (429) after about 40 pages | Global limit per IP only | `middleware/rateLimit.middleware.ts`, `app.ts` | hardening.test.ts + re-crawl (0 × 429) |
| D12 | Prod could boot with localhost URLs | Silent defaults | `config/env.ts`, `server.ts` (unconfigured-integration warnings) | prod boot log |
| D13 | Transaction timeout reported as 400 | P2028/P2034 unmapped | `middleware/error.middleware.ts` | hardening.test.ts |
| D14 | Training certificate page 54 px overflow on phones | `nowrap` button in a grid card | `training/styles/site.module.css` | re-crawl (clean) |
| D15 | Admin `/users` 99 px overflow on phones | `.sr-only` escaping a static scroller | `packages/ui/src/ui.module.css` | probe: 0 px |
| D16 | Ineffective memo (lint warning) | `?? []` new array each render | `intern/app/(portal)/exams/attempts/[id]/take/page.tsx` | lint clean |
| D17 | `GET /api/notifications/deliveries` untested | — | `backend/tests/notifications.test.ts` | new test |

Changed files are uncommitted in their repos, so `git diff` in each repo shows them:
- `backend`: src + tests, and `dist/` from the build;
- `admin`: 4 files;
- `training`: 2 files;
- `intern`: 1 file;
- `frontend`: 1 new test;
- root: `packages/ui` and `docs/`.

Nothing was committed or pushed.

## F. Remaining issues
| # | Severity | Issue | Impact | Reproduce | Blocker / next action |
|---|---|---|---|---|---|
| **B1** | **Blocker** | No deployable repository: the root repo holds the 7 apps as gitlinks without `.gitmodules`; 5 portals need the root `packages/`; the backend needs the root `prisma/` | Vercel/Render builds from any single repo fail; a fresh clone is empty | `git clone <root>` → empty `admin/`…; or build `globalantic-web-admin` alone → `@globalantic/*` not found | **Your decision.** (a) Make the root a real monorepo: move the nested `.git` folders out (history stays in the GitHub repos), commit the app sources to the root, and deploy each Vercel project from the root with "Root Directory = <app>". Or (b) keep polyrepos and publish `packages/*` and `prisma/` into them. (a) is simpler for one maintainer. **Not done: it rewrites your git layout** |
| **B2** | **High** | `backend/.env` (prod DB URL, JWT secret, Resend and Cloudinary keys) is committed in the private `globalantic-web-backend` repo; `node_modules` and `dist` are committed too | Anyone with repo access has production credentials | `cd backend; git ls-files .env` | Rotate the 4 credentials, `git rm --cached .env`, add `.gitignore` files (and optionally purge history) |
| **B3** | High (unverified) | Production DB migration state not checked today | Unknown drift would return 503s | `npx prisma migrate status` → P1001 (machine offline) | Re-run when online; expect "9 migrations, up to date" |
| B4 | High for go-live | Razorpay: test keys only; `RAZORPAY_WEBHOOK_SECRET` empty; test key ID and secret also copied into the committed `.env.example` | Late captures are not auto-reconciled; test secret could be committed | Prod boot warning | Set the webhook secret, restore placeholders in `.env.example`, use live keys at launch |
| B5 | High for go-live | Email: Resend sending domain not verified (per the previous report); prod run had no key → all mail SKIPPED | Students cannot verify email or reset passwords | Prod boot warning | Verify the domain in Resend; set `RESEND_API_KEY` on the server |
| R6 | Medium | Not deployed: api.globalantic.com does not resolve; the live site is the old static Hostinger site | — | — | DNS + hosting (see the checklist) |
| R7 | Medium | Single-instance assumptions: SSE bus and rate limits are in-process | Run 1 backend instance (fine at this scale); revisit if scaling out | — | Document; no action now |
| R8 | Low | `postcss` advisory via `next` (build-time only) | — | `npm audit` | Track Next 15.5 patches |
| R9 | Low | Hydration error #418 seen once on training `/` during the DB outage; not reproducible | Possibly a server-render fallback differing from the client | — | Watch production logs |
| R10 | Info | Button-driven browser flows, tablet width and keyboard navigation not re-run this session | — | — | Re-run earlier E2E scripts on staging |

## H. Final release checklist (owner)
1. **Git layout (B1):** choose (a) or (b), then let the fix be applied. Add a `.gitignore` to every repo that excludes `.env`, `.env.local`, `node_modules/`, `.next/`, `.next-verify/` and `dist/`.
2. **Rotate secrets (B2):** Supabase DB password (update `DATABASE_URL` and `DIRECT_URL`), `JWT_SECRET` (logs everyone out), Resend API key, Cloudinary secret. Untrack `backend/.env`.
3. **Production backend env** (host secrets, never in git):
   - `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `HASH_SALT`;
   - `FRONTEND_URL` (comma list of all 6 https origins), `PUBLIC_API_URL=https://api.globalantic.com/api`, `MAIN_SITE_URL`, `TRAINING_URL`, `INTERN_PORTAL_URL`, `EMPLOYEE_PORTAL_URL`, `ADMIN_PORTAL_URL`;
   - `COOKIE_DOMAIN=.globalantic.com`, `UPLOAD_DIR` (persistent disk), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`;
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`, optionally `INTERNAL_API_TOKEN` (≥ 32 chars).

   The API now **refuses to start** without the URL variables.
4. **Frontend build env** (Vercel, one project per app): `NEXT_PUBLIC_API_URL=https://api.globalantic.com/api` and the `NEXT_PUBLIC_*` site URLs. `ALLOW_INDEXING=true` only on the public production sites.
5. **Database:** when online, `prisma migrate status`. Deploy order is migrate → backend → frontends. Take a backup first (`backend/scripts/migration-rehearsal.ts`). Never run the full `prisma:seed` on production.
6. **DNS/HTTPS:** `api.`, `training.`, `intern.`, `employee.`, `admin.` and `trainer.globalantic.com` → hosts with TLS. `trust proxy` is set to 1 hop. Keep exactly one proxy in front of the API.
7. **Email:** verify the sending domain in Resend; send one test reset to an address you control.
8. **Payments:** Razorpay webhook URL `https://api.globalantic.com/api/payments/razorpay/webhook` with its secret. Do a ₹1 test-mode payment end to end, then switch to live keys.
9. **Scheduler:** call `POST /api/crm/reminders/dispatch` and `POST /api/notifications/dispatch` with `CRON_SECRET`.
10. **Backups:** enable Supabase PITR or daily backups. Back up `UPLOAD_DIR`.
11. **Staging smoke after deploy:** `/health` = 200 `schema:"current"`, one sign-in per portal, contact form → CRM, then the API smoke script against staging.
