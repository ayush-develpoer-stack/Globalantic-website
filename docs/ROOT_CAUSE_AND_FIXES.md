# Root Cause and Fixes — "Service temporarily unavailable" (2026-10-17)

## Symptom
Across the main site, the training site, and the admin pages for services, blog, portfolio, settings, the certificate program and landing pages, the UI showed **"Service temporarily unavailable. Please try again shortly."** The same thing would happen with the contact/enquiry form and payments.

## Root cause (verified)
**The production database (Supabase) is three migrations behind the backend code.** The backend is up and the database is reachable. However, the code queries tables and columns that do not exist yet. Prisma raises `P2021` (table missing) or `P2022` (column missing). `backend/src/middleware/error.middleware.ts` maps both codes to HTTP 503 with exactly this message.

Evidence (all read-only against Supabase):

| Check | Result |
|---|---|
| `prisma migrate status` | 8 migrations in the repo, 5 applied. **Pending:** `20261019090000_sales_crm`, `20261020090000_certificate_program_and_documents`, `20261021090000_cms_campaigns_and_site` |
| `findFirst()` on all 83 Prisma models | **23 fail.** P2022: `services.heroVariant`, `blog_posts.archivedAt`, `portfolio_projects.clientApproved`, `site_settings.mapUrl`, `contact_leads.reference`, `payments.programEnrollmentId`, `invoices.programEnrollmentId`. P2021: `lead_activities`, `lead_assignment_rules`, `marketing_events`, `landing_pages`, `email_logs`, the 7 `program_*`/`certificate_programs` tables, and the 4 `business_*`/`document_templates` tables |
| Same API code, Supabase vs. a local DB with all 8 migrations | Every endpoint that returns 503 on Supabase returns 200 (or a correct 404) locally. See `API_ENDPOINT_TEST_REPORT.md` |
| Server log | `[error] database schema out of date (P2022) — run prisma migrate deploy` |

The three migrations were built and tested locally on 2026-10-16 (CRM, ₹999 program and documents, CMS). They were never deployed to Supabase. The frontend, the API URLs, CORS, auth and the network are **not** the cause: those parts work, and endpoints on unchanged tables (`/api/faqs`, `/api/solutions`, `/api/industries`, `/api/training/courses`) return 200 from the same server.

This is the same failure mode as the 2026-10-15 incident (`DEPLOYMENT.md`): the code was deployed or run ahead of the migrations.

### Contributing defect: the health check could not see it
`GET /health` ran only `SELECT 1`. It reported `{"status":"ok","database":"up"}` (HTTP 200) while 23 models were broken, so any uptime monitor would have shown green.

## Fixes made in code
| File | Change | Why |
|---|---|---|
| `backend/src/config/schemaStatus.ts` (new) | Compares the migration folders shipped with the build against `_prisma_migrations` (finished, not rolled back). Returns `current`, `behind` or `unknown` | Detects schema drift directly |
| `backend/src/app.ts` | `/health` now returns **503** `schema:"behind"` with the pending count when migrations are missing. `database` and `schema` are reported separately. Migration names are not exposed publicly | Readiness reflects whether the routes can actually work |
| `backend/src/server.ts` | On startup, logs `✗ Database schema is out of date — N migration(s) not applied: …` | The cause is visible in the first lines of the server log |
| `backend/src/middleware/error.middleware.ts` | The P2021/P2022 log line now names the missing table or column | Prisma's multi-line message hid it |
| `backend/tests/hardening.test.ts` | 3 regression tests: health is `current` on a migrated DB; health is 503 when a migration is rolled back; a missing column gives 503 with a safe message (no column or Prisma names), and the route recovers once the column exists | Locks in the behaviour |

Unchanged on purpose: the 503 response itself is correct (the request really failed, and internals stay hidden). The frontend clients already distinguish "not configured", network, timeout and server errors. They retry only GETs, once, and never retry writes.

## Update — fix applied (2026-10-17, second request)
The owner then reported the error in **local development**, especially on POSTs. Investigation showed that local development uses the same shared Supabase database (`backend/.env`), so it was the same root cause. It was reproduced directly: `POST /api/contact` returned 503 with the server log `P2022, missing contact_leads.reference`, raised by the first query of `crm.service.createEnquiry`.

With the owner's explicit approval, the 3 migrations were applied after a fresh rehearsal and backup. Afterwards:
- `migrate status` reports up to date.
- `migrate diff` against the live database is empty.
- 0 of 83 models fail.
- Row counts are identical to the backup.
- The owner's own running API on :4000 returns 200 on every endpoint that had returned 503, with no restart needed.

Details: `LOCAL_DATABASE_SCHEMA_AUDIT.md`. Full endpoint testing: `API_ENDPOINT_TEST_REPORT.md`.

Additional changes in the second pass:
| File | Change |
|---|---|
| `backend/src/middleware/auth.middleware.ts`, `validate.middleware.ts` | Guards and validators carry metadata (permission list; schema and source) so the inventory can document each route's real access rule and fields. No behaviour change |
| `backend/scripts/api-inventory.ts` (new) | Lists every registered endpoint by walking the live Express router. With a coverage log, it reports which routes the tests exercised |
| `backend/tests/helpers.ts` | When `API_COVERAGE_FILE` is set, records method, route pattern and status for each request |
| `backend/tests/endpoints-*.test.ts` (new) | Tests for every endpoint the existing suite never called (see the test report) |

## Original "fix still required" note (now done)
Apply the pending migrations to Supabase. A safety rehearsal was run on 2026-10-17:
- Drift check: none.
- Full JSON backup: `~/.globalantic/backups/supabase-pre-migration-2026-10-17T04-28-08-581Z.json`.
- All migrations applied to a local copy loaded with the live rows: **every row was preserved**, and login still works.

```bash
cd backend
npx tsx scripts/migration-rehearsal.ts      # optional re-run (read-only on live, fresh backup)
npm run prisma:deploy                        # uses DIRECT_URL
npx prisma migrate status --schema=../prisma/schema.prisma   # must say "up to date"
```
Then start the API: it should log no `✗ Database schema` line, and `GET /health` should return 200 with `"schema":"current"`.

All three migrations are additive. The one behavioural change is that `payments.applicationId` and `invoices.applicationId` become nullable, guarded by CHECK constraints. Both tables are empty on live.
