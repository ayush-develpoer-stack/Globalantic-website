# Globalantic — Deployment

**Status:** not deployed. Nothing in this repository has been verified in production. The steps below are the intended procedure.

## Targets
- **Frontends:** `frontend`, `training`, `intern`, `employee`, `admin`, `trainer` → Vercel, one project per app with its own root directory and subdomain.
- **Backend:** `backend` → Render or Railway (Node service at `api.globalantic.com`) with a **persistent disk** for `UPLOAD_DIR`.
- **Database:** Supabase PostgreSQL. The pooled `DATABASE_URL` is for runtime; `DIRECT_URL` is for migrations.

## Subdomains
| Subdomain | App | Who may sign in |
|---|---|---|
| `globalantic.com` | frontend (+ legacy CMS at `/admin`) | ADMIN (CMS) |
| `training.globalantic.com` | training | public; students register here |
| `intern.globalantic.com` | intern | STUDENT |
| `employee.globalantic.com` | employee | EMPLOYEE |
| `admin.globalantic.com` | admin | ADMIN, FINANCE, HR |
| `trainer.globalantic.com` | trainer | TRAINER |
| `api.globalantic.com` | backend | — |

## Order of operations (important)
1. **Migrate first:** `npm --workspace backend run prisma:deploy` (uses `DIRECT_URL`), then `npx prisma migrate status --schema prisma/schema.prisma` must say "Database schema is up to date". All migrations are additive only. **The backend must not run against an un-migrated DB:** login writes to `sessions`, and every new route returns 503 until the tables exist. (Status on Supabase as of 2026-10-17: 5 of 8 applied. `20261019`, `20261020` and `20261021` are **pending**; see `ROOT_CAUSE_AND_FIXES.md`.)
2. Deploy the backend.
3. Deploy the frontends.
4. Smoke test:
   - `GET https://api.globalantic.com/health` → 200 `{status:"ok", database:"up", schema:"current", pendingMigrations:0}`. A 503 with `schema:"behind"` means step 1 was skipped.
   - `GET /health/live` → 200
   - one sign-in per portal

## Backend environment (server only, never in a frontend)
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `DATABASE_URL`, `DIRECT_URL` | yes | Rotate the credentials first (see SECURITY.md) |
| `JWT_SECRET` | yes | long random value |
| `HASH_SALT` | yes | boot fails without it in production |
| `FRONTEND_URL` | yes | comma-separated: every portal origin above |
| `COOKIE_DOMAIN` | yes | `.globalantic.com` |
| `COOKIE_SAMESITE` | no | default `lax` (correct for `api.` on the same site); `none` only if the API is on another domain |
| `TRAINING_URL`, `INTERN_PORTAL_URL`, `EMPLOYEE_PORTAL_URL` | yes | used in email links and referral links |
| `UPLOAD_DIR` | **yes** | absolute path on a persistent disk; uploads return 503 if unset in production |
| `UPLOAD_MAX_BYTES` | no | default 5 MB |
| `PUBLIC_API_URL` | **yes** | e.g. `https://api.globalantic.com/api`. Used to build public image URLs for course/CMS images (defaults to `http://localhost:<PORT>/api`) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL` | for email | verified sending domain required |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | for payments | without them, payments return 503 |
| `SEED_ADMIN_*` | only when seeding | |

Also configure the Razorpay webhook: URL `https://api.globalantic.com/api/payments/razorpay/webhook`, secret `RAZORPAY_WEBHOOK_SECRET`. Events: `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`, `refund.processed`.

**Proxy:** the app trusts exactly one proxy hop (`trust proxy = 1`). Keep a single load balancer in front of it.

## Frontend environment (public values only)
| App | Variables |
|---|---|
| all | `NEXT_PUBLIC_API_URL=https://api.globalantic.com/api` |
| frontend | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DATA_SOURCE=api` (or unset; **never** `mock` in production) |
| training | `NEXT_PUBLIC_INTERN_PORTAL_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TRAINER_URL` |
| intern | `NEXT_PUBLIC_TRAINING_URL` |

**Separate environments.** Each app has its own env file per environment:
- `.env.development` holds public localhost values only. It is committed and loaded only by `next dev`.
- `.env.local` holds per-machine overrides and is git-ignored.
- Staging and production values are set in the hosting project (Vercel "Preview" vs "Production" environments) and are never committed.

A production build never falls back to localhost:
- If `NEXT_PUBLIC_API_URL` is missing, API calls fail with "The application is not configured to reach the server (NEXT_PUBLIC_API_URL missing)." (also logged to the console).
- Cross-portal links fall back to the `*.globalantic.com` subdomains above.

`NEXT_PUBLIC_*` values are baked in at build time: change them, then rebuild/redeploy (or restart `next dev`).

## Incident 2026-10-15: "Service temporarily unavailable"
**Symptom:** every portal showed "Service temporarily unavailable. Please try again shortly." on login and on training pages.

**Evidence:**
- The API was up and Supabase was reachable: `/health` reported `database: up` and `/api/services` returned 200.
- Supabase had only `20260921043321_init` applied.
- A read-only Prisma probe returned P2022 for the missing `users.status` column, which every login query reads, and P2021 for the missing `sessions` and `courses` tables.
- The error handler maps P2021/P2022 to 503 with that message. The frontends displayed it correctly.

**Fix:** ran `backend/scripts/migration-rehearsal.ts`:
- Drift check: none.
- JSON backup of all original tables to `~/.globalantic/backups/supabase-pre-migration-*.json`.
- Rehearsal of all migrations on a local copy loaded with the real rows: all rows preserved.

Then, with the owner's approval, `prisma migrate deploy` applied the 3 pending migrations. Row counts after the deploy matched those before it.

**Second migration, 2026-10-15:** `20261018090000_intern_exams_and_material_files` (exam tables and learning-material files). The same procedure was followed: `backend/scripts/migration-rehearsal.ts` now generalises to "whatever is applied on live". Steps:
1. Drift check: none.
2. JSON backup of all 60 tables.
3. Rehearsal on a local UTF-8 copy: every row preserved.
4. With the owner's approval, `migrate deploy`.

Afterwards Supabase was up to date and all 60 tables had row counts identical to the backup.

## Pre-deploy checklist
1. Rotate the credentials that appeared in the old `backend/.env.example`.
2. Run `prisma migrate status` against the target DB; apply pending migrations (above), with a backup first.
3. Upgrade Next.js to ≥ 15.5 (advisories), or accept the risk explicitly.
4. Razorpay in **test mode** first; verify one real checkout plus webhook end-to-end.
5. Verify the Resend sending domain.
6. Provision a persistent disk for `UPLOAD_DIR` and include it in backups.
7. Run the checks in `docs/TESTING.md`: `npm --workspace backend test`, typecheck, lint, and a build for every app.
