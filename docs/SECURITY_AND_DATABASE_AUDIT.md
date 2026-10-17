# Security & Database Audit — 2026-10-17

Scope: the backend (`backend/src`, 406 registered endpoints), the six Next.js apps, `packages/*`, the Prisma schema and migrations, and the git repositories.

Method:
- A full read-only security code review of auth, IDOR, mass assignment, payments, files, XSS, CSV, SSE and environment handling. Every finding below was re-confirmed by reading the code path end to end.
- Executable verification: the regression tests listed per item, a production-mode API smoke run, and a headless-browser crawl.

No secret values appear in this document.

## 1. Fixed in this audit (each has a regression test or live check)

| # | Severity | Defect | Root cause | Fix | Proof |
|---|---|---|---|---|---|
| S1 | **Medium** | Open redirect after login via `?next=/%09/evil.example` (admin, intern, employee and trainer portals plus the training site) | `safeNext` and `safeInternalPath` string-checked for `//`, but browsers strip TAB/CR/LF while parsing URLs, so `/\t/evil.example` becomes `//evil.example` | Parse with `new URL(next, base)` and require the same origin (`packages/ui/src/safe-next.ts`, `training/lib/config.ts`) | `frontend/tests/safe-redirect.test.ts`: the old check accepted both attack strings (shown before the fix) |
| S2 | **Medium** | A partial Razorpay refund was recorded as a full refund: payment and invoice set to REFUNDED, program enrollment revoked, referral reward reversed | `refund.processed` (sent for partial refunds too) always called `markRefunded` | Mark REFUNDED only when the entity status is `refunded` or `amount_refunded ≥ amountPaise`. Otherwise audit `payment.partial_refund` and raise an admin event; the payment stays PAID | `payments.test.ts`: "a partial refund keeps the payment PAID…" |
| S3 | Medium | SSE notification stream leaked connection slots and timers | Cleanup listeners were attached *after* the awaited replay queries. A client disconnecting during them left `totalStreams` raised and intervals running; after 200 leaks every stream returns 503, and the process never exits | Register cleanup before any await; `try/catch` after the headers are sent; `if (closed) return` | `notifications.test.ts`: against the original code the test **failed** and the run **hung** on leaked intervals; with the fix it passes |
| S4 | Medium | Graceful shutdown hung forever while any SSE stream was open | `server.close()` waits for open connections and there was no force timeout | `endAllStreams()`, `closeIdleConnections()`, then `closeAllConnections()` after 10 s (`server.ts`) | `notifications.test.ts`: "shutdown: endAllStreams()…" |
| S5 | Low–Med | Forgot-password response time revealed which emails have accounts | Real accounts waited for a DB transaction plus the Resend HTTP call; unknown emails returned immediately | Respond first, then issue the token and send the email detached (errors logged) | `auth.test.ts` (flow); prod smoke: 4 ms vs 3 ms |
| S6 | Low–Med | Internal user notes were not scoped. HR (`employees.manage`) could read and delete admins' notes about students, admins and itself | The routes accepted any user id; `removeNote` had no author check | `assertNoteScope`: `users.manage` sees all; `training.students.manage` sees students; `employees.manage` sees users with an employee profile; never yourself. Removal by the author or `users.manage` only | `admin-integration.test.ts`: "notes are scoped…" |
| S7 | Low | A salesperson could link another rep's lead (by also sending a `clientId`) or copy any student's name, email and phone into a business document | The lead scope check ran only when `clientId` was absent; `studentId` was unchecked | Always check lead scope; `studentId` only for users who see all documents | `documents.test.ts`: "scope: a salesperson cannot link…" |
| S8 | Low | HTML injection in staff emails through the event title (an editor-controlled CMS title) | `layout()` interpolated `title` raw | `esc(title)` in `layout()`; all callers pass plain text | `notifications.test.ts`: "event emails escape the title…" |
| S9 | Low | CSV formula injection in admin exports via a leading TAB or CR | The admin `downloadCsv` regex was `^[=+\-@]` (the trainer app already handled `\t\r`) | `^[=+\-@\t\r]` (`admin/lib/admin.tsx`) | Code review; admin typecheck and lint |
| S10 | Low | **False success messages:** "Employee created and invitation sent", "Account created and invitation sent", "Password reset link sent" and `{sent:true}` appeared even when the email was SKIPPED or FAILED | `send()` hides SKIPPED; the route messages and UI toasts were hard-coded | `sendPasswordResetEmail` returns the delivery result; `createStaffUser` returns `inviteEmail`; the routes word their messages from it; the admin UI toasts follow `inviteEmail` / `sent` | `employee.test.ts` (SENT path). **Live** (prod mode, no email key): `inviteEmail=SKIPPED`, `sent:false`, truthful messages |
| S11 | Medium (availability) | Admin and other staff hit **429** after about 40 page views in 15 min; one office IP shares the budget | The global `apiLimiter` allows 300 requests per IP per 15 min, and portal pages make 5–7 calls each | Signed-in callers are counted per session (hashed token, 1,200 per 15 min); anonymous callers per IP (300); new `apiIpBackstop` allows 3,000 per IP per 15 min for everything (rotating fake cookies gains nothing) | `hardening.test.ts`: "global API limit…"; browser crawl before: 25 of 63 admin pages got 429 (re-crawl results in BUILD_AND_TEST_RESULTS.md) |
| S12 | Low (config) | Production could boot with `localhost` links in emails, stored image URLs and the CORS allow-list | `FRONTEND_URL`, `PUBLIC_API_URL`, `MAIN_SITE_URL`, `TRAINING_URL`, `INTERN_PORTAL_URL`, `EMPLOYEE_PORTAL_URL` and `ADMIN_PORTAL_URL` silently defaulted to localhost | Required in production (fail fast); defaults stay for development. Startup also lists unconfigured optional integrations (names only) | Prod-mode boot log shows the warnings; dev and test unaffected |
| S13 | Low | A transaction timeout or write conflict was reported as `400 Database request error` (a client fault) | P2028 and P2034 fell through to the generic 400 | Mapped to 503 "temporarily unavailable" (retryable) | `hardening.test.ts`: "transaction timeout / write conflict…" |

## 2. Checked and found correct (no change needed)
- **Student data:** every student route takes the id from the session. Applications, invoices, receipts, enrollments, attempts and certificates are filtered by `studentId`.
- **Trainer and employee isolation:** `assertTrainerBatch` on every batch path; the employee portal filters by `employeeId`, assignee or member.
- **Route guards:** every private router has `router.use(requireAuth, …)`. `/api/admin` requires `cms.manage`/`cms.publish`, and `requireAdmin` for leads and settings. Cron endpoints use a timing-safe secret and return 404 without it.
- **Sessions:**
  - JWT pinned to HS256 (the prod smoke rejects `alg=none`);
  - the role is re-read from the DB on every request;
  - logout and password reset revoke sessions (the prod smoke confirms a revoked cookie is rejected);
  - the cookie is `HttpOnly; Secure; SameSite=Lax` in production (observed live).
- **Mass assignment:** zod-stripped bodies everywhere; no `passthrough`.
- **Payments:**
  - amounts come from the DB;
  - HMAC with `timingSafeEqual`;
  - the provider is re-fetched on verify;
  - webhook event-id dedupe;
  - `FOR UPDATE` lock in `markPaidTx`;
  - REFUNDED never goes back to PAID;
  - without gateway keys → 503, never a simulated success (observed live).
- **Uploads:**
  - magic-byte type check (PDF, PNG, JPEG, WEBP only; no SVG or HTML);
  - double size limit;
  - random storage keys;
  - `attachment` + `nosniff` + sandbox CSP on download.
- **XSS:** every `dangerouslySetInnerHTML` is the `jsonLd()` helper or the static theme script; the markdown renderer escapes.
- **CORS:** in production only the configured origins are allowed. An unknown origin, or an arbitrary localhost port, gets 403 (observed live).
- **Headers:** helmet (HSTS, nosniff, frame-options), no `X-Powered-By`, `X-Robots-Tag: noindex` on API responses.
- **Build output:** 1,769 files in the six production builds were scanned for the real `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `CLOUDINARY_*` and `SEED_ADMIN_PASSWORD` values, and for connection-string and API-key patterns: **0 matches**.

## 3. Open security items (need the owner)

| # | Severity | Item | Evidence | Action |
|---|---|---|---|---|
| O1 | **High** | **`backend/.env` is committed** in the `globalantic-web-backend` git repo, and its history matches the live file exactly (Supabase `DATABASE_URL`/`DIRECT_URL`, `JWT_SECRET`, `RESEND_API_KEY`, Cloudinary secret). `backend/node_modules` (2,716 files) and `dist/` are committed too. The repo is private (anonymous GitHub returns 404), but anyone with repo access has production credentials | `git ls-files` in `backend/` lists `.env`; the blob is identical to the working file | 1. Rotate the Supabase DB password, `JWT_SECRET` (this signs everyone out), the Resend key and the Cloudinary secret. 2. `git rm --cached .env` and add a `.gitignore` in `backend/` (and in each app repo). 3. Optionally purge history (`git filter-repo`). **Not done by me** (it needs your approval and your credentials) |
| O2 | Medium | Your edit at 14:34 today put the **Razorpay test key ID and key secret** into `backend/.env.example`, identical to `.env`. `.env.example` is committed by design | Value-pattern check (no values printed) | Put placeholders back in `.env.example` before committing. Use test keys only until go-live |
| O3 | Medium | `RAZORPAY_WEBHOOK_SECRET` is empty in `backend/.env`. Webhooks are rejected (503), so a payment captured after the browser closes is only reconciled manually | The prod boot warning lists it | Set it in Razorpay → Webhooks, and on the server |
| O4 | Low (build-time) | `npm audit`: `postcss < 8.5.23` (high, 4 advisories) via `next`. The fix is only in next 16 (breaking) | `npm audit --omit=dev` | Exploitable only through attacker-controlled CSS at build time (we build our own CSS). Track Next 15.5.x patch releases; do not force-upgrade to 16 now |
| O5 | Info | 6 app repos have no `.gitignore`: `.next/` build output and `frontend/.env.local` (public values only) are committed | `git ls-files` | Add a `.gitignore` per repo (see the release checklist) |

## 4. Database & Prisma
| Check | Result |
|---|---|
| `prisma validate` (dummy URLs) | ✅ valid |
| Migration history | 9 migrations, all additive, in order: `20260921043321_init` … `20261022090000_admin_notifications_and_media`. No failed or conflicting folders |
| Migrations from scratch | ✅ the test runner applies all 9 to a fresh UTF-8 embedded Postgres before every suite (`tests/run.ts`), and the smoke DB was built the same way (`/health` → `schema:"current"`, `pendingMigrations:0`) |
| **Production Supabase migration status** | ⛔ **BLOCKED this run.** `prisma migrate status` → `P1001 Can't reach database server`. At the time, this machine had no internet at all (supabase.com, fonts.googleapis.com and api.razorpay.com all failed to connect). The last verified state (2026-10-17 morning, previous session) was 9/9 applied with an empty `migrate diff`. Re-run `npx prisma migrate status --schema prisma/schema.prisma` from `backend/` when online |
| Schema-drift detection | `/health` returns 503 with `schema:"behind"` when migrations are pending (`hardening.test.ts`) |
| P2021/P2022 handling | 503 with a safe message, never internals (`hardening.test.ts`) |
| Connection pooling | Prisma via the Supabase transaction pooler (`DATABASE_URL`); `DIRECT_URL` for migrations; transactions `maxWait 10 s / timeout 20 s` |
| Destructive operations | **None** were run. No reset, drop or delete against any existing DB. Every test and smoke run used throwaway embedded Postgres (ports 54000–54990) |

**Important:** local `backend/.env` points at the production Supabase DB. Running the API locally, `npm run dev:backend` or `npm --workspace backend start`, therefore reads and writes production data.
