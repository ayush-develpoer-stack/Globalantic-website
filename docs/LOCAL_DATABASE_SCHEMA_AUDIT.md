# Local Database Schema Audit (2026-10-17)

## Which database local development uses
- Only `backend/.env` defines `DATABASE_URL`/`DIRECT_URL`. No other app or env file has database settings.
- Both point at the **shared Supabase project**: host `aws-0-ap-south-1.pooler.supabase.com`, database `postgres`, schema `public`, Postgres 17.6, UTF-8.
  - `DATABASE_URL` = transaction pooler :6543 with `pgbouncer` set, used at runtime.
  - `DIRECT_URL` = :5432, used for migrations.
- So "local" API failures were really failures of the shared production database. No separate local database is configured. `npm run dev:db` (embedded Postgres on :54320, data in `~/.globalantic/dev-db`) exists for isolated testing but is not wired into `.env`.
- Automated tests never use Supabase. `tests/helpers.ts` refuses to run unless `DATABASE_URL` is a 127.0.0.1 embedded instance.

## State before the fix (verified, read-only)
| Check | Result |
|---|---|
| `prisma validate` | schema valid |
| `prisma migrate status` | 5 of 8 applied. Pending: `20261019090000_sales_crm`, `20261020090000_certificate_program_and_documents`, `20261021090000_cms_campaigns_and_site` |
| Drift check (live vs. applied migrations) | **no drift**. None of the pending changes existed partially, so marking anything as applied by hand was neither needed nor safe |
| `findFirst()` on every model | **23 of 83 failing**: 7 with P2022 (missing columns on `services`, `blog_posts`, `portfolio_projects`, `site_settings`, `contact_leads`, `payments`, `invoices`) and 16 with P2021 (missing tables: CRM activities and rules, marketing events, landing pages, email logs, 7 certificate-program tables, 4 business-document tables) |
| Reproduced POST | `POST /api/contact` → 503. Server log: `P2022, missing contact_leads.reference`, raised by the first query inside `crm.service.createEnquiry`'s transaction, so nothing was written |
| Transient | one `P1001 Can't reach database server` at a cold start. A 40-request sample afterwards was 40/40 healthy, so this is not a root cause |

## What the pending migrations do (reviewed before applying)
- **20261019 sales_crm:** new columns on `contact_leads` (reference, normalized email and phone, UTM fields, assignment, follow-up), plus new tables `lead_activities`, `lead_assignment_rules` and `marketing_events`. Additive.
- **20261020 certificate_program_and_documents:**
  - New program tables (`certificate_programs`, `program_*`) and document tables (`business_profile`, `business_clients`, `document_templates`, `business_documents`), plus `email_logs`.
  - `payments.programEnrollmentId` and `invoices.programEnrollmentId` added.
  - `payments.applicationId` and `invoices.applicationId` become **nullable**, guarded by CHECK constraints that require exactly one owner. Both tables had 0 rows.
- **20261021 cms_campaigns_and_site:** CMS columns on `services`, `blog_posts` and `portfolio_projects` (archive and schedule state, hero variant, client approval); `site_settings` map fields; new `landing_pages` table. Additive.

## Applied 2026-10-17, with the owner's explicit approval
1. `scripts/migration-rehearsal.ts`: no drift. Backup at `~/.globalantic/backups/supabase-pre-migration-2026-10-17T05-13-48-112Z.json` (an earlier one from the same day: `…T04-28-08-581Z.json`). A local copy loaded with every live row was migrated with all 8 migrations: **all rows preserved**, and login still worked.
2. `npm run prisma:deploy` applied the 3 migrations at 05:14:47–48 UTC.
3. Checks afterwards:
   - `prisma migrate status`: **"Database schema is up to date!"**
   - `prisma migrate diff` from live to `schema.prisma`: **empty migration**. Columns, types, enums, indexes, FKs and checks all match exactly.
   - Model probe: **0 of 83 failing**.
   - Row counts for all 17 non-empty tables are **identical** to the backup: audit_logs 26, auth_tokens 1, blog_categories 10, blog_posts 2, contact_leads 3, faqs 5, industries 12, newsletter_subscribers 1, referral_settings 1, services 14, sessions 11, site_settings 1, solutions 10, stored_files 1, student_profiles 1, technologies 23, users 2.

Nothing was reset, dropped, force-pushed or marked as applied by hand. The migration files and history are unchanged.

## Catalog after the fix
84 tables (83 models + `_prisma_migrations`), 1,024 columns, 54 enums, 117 foreign keys, 263 indexes, 4 CHECK constraints. Prisma client 5.22 was generated from the same `prisma/schema.prisma`, and the test harness applies all 8 migrations to a fresh database on every run.

## Guard against recurrence
`GET /health` now returns 503 with `schema:"behind"` when the database is missing migrations that the running build ships. The API also logs the pending migration names at startup.
