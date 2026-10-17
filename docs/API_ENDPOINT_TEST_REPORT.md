# API Endpoint Test Report (2026-10-17)

## Summary
| Metric | Count | Basis |
|---|---|---|
| Registered endpoints | **398** | `scripts/api-inventory.ts` (191 GET · 116 POST · 40 PUT · 32 PATCH · 19 DELETE) |
| Exercised by the existing suite, with a 2xx | **238** | **Measured** by the coverage recorder over a full run: 18 files, **181/181 tests passed** |
| Previously never called | **160** | 89 GET · 26 POST · 17 PUT · 16 PATCH · 12 DELETE |
| New tests written for those 160 | 4 files, **79 tests passing** when each file runs alone | `endpoints-site` 23/23 (61 endpoints) · `endpoints-learning` 17/17 (27) · `endpoints-training-admin` 24/24 (26) · `endpoints-ops` 15/15 (51) |
| Failed (code defects still open) | **0** | 2 defects were found and fixed (below) |
| Blocked | **0 endpoints**; real **provider** calls are blocked | Razorpay and Resend run against a gateway double with real HMAC signatures and a test outbox. No real provider call was made |
| Untested | **0 reported**, but **not yet measured in one combined run** | See the caveat |

**Caveat, stated plainly:** the final full run (all 22 files with coverage recording) was **killed by the OS for low memory**, with the six dev servers and the API running. Before that, 8 files had passed (90 tests). The next file failed in setup with `P1001`: the embedded test Postgres became unreachable at the moment memory ran out, and the run was killed right after. That same file passed 17/17 on its own. As a result:
- the combined pass count across all 22 files,
- the measured coverage figure (expected 398/398),
- and one edited assertion in `endpoints-training-admin` (certificate verification after revoke is now asserted unconditionally)

are **not yet confirmed by a single run**. To confirm, close the dev servers and run:
```bash
cd backend
API_COVERAGE_FILE=C:\\temp\\cov.log npm test
npx tsx scripts/api-inventory.ts out.json C:\\temp\\cov.log report.md   # prints "exercised by tests: N"
```

## What every new test checks (where it applies)
- A valid request, with the result verified in the database (Prisma read or follow-up GET), not just the response.
- **401** when signed out; **403** for a role without the permission.
- **Ownership.** Changing an id in the URL must not reach another user's data (enrollments, invoices, certificates, program attempts, payment orders, leave, batches, documents). In this API that means 404.
- **422** for invalid bodies, queries, enums and UUIDs, with field-level errors.
- **404** for unknown ids.
- **409** for duplicates (slug, staff email) and invalid state transitions (double cancel, revoke, confirm without payment, editing a published exam's question, archiving the last required lesson).
- **DELETE and archive.** Archive is a soft change (`archivedAt`/`deletedAt`); deletes don't touch unrelated rows.
- **Idempotency.** Newsletter re-subscribe, double confirm-enrollment, refund-record replay, CRM reminder dispatch run twice.

## Defects found by the new tests, and fixed
| File | Defect | Fix |
|---|---|---|
| `backend/src/services/admin-training.service.ts:150` | `listStaff()` left out `HR`, although `POST /staff` can create HR accounts. New HR staff never appeared on the admin "Staff & trainers" page | `HR` added to the role filter. The test asserts it appears |
| `backend/src/services/payment.service.ts:275` | `reportCheckoutFailure` always answered `{status:"FAILED"}`, even when the payment was already PAID and nothing changed. The data was never altered; the response was misleading | It now returns the payment's real status unless it actually marked the payment FAILED. No frontend reads this value (`PayButton` ignores it) |

## Regression tests for the root cause (`tests/hardening.test.ts`)
- `/health` returns 200 with `schema:"current"` on a fully migrated database.
- `/health` returns **503** with `schema:"behind"` and `pendingMigrations:1` when a migration is rolled back. Migration names are not exposed.
- A missing column (P2022) on `/api/services` gives **503** with the safe message, no internals, and **200** again once the column exists.

## Against the real (Supabase) database, after the migration
On the owner's running API (:4000) and on a second instance (:4100). Only reads and non-persisting requests were sent; no production records were created:

| Request | Before | After |
|---|---|---|
| `GET /health` | 200 "healthy" (wrong) → 503 `schema:"behind"` with the new check | **200 `schema:"current"`** |
| `GET /api/services`, `/services/:slug`, `/blog`, `/portfolio`, `/settings`, `/programs` | 503 | **200** |
| `GET /api/landing-pages/<unknown>` | 503 | **404** |
| `POST /api/contact` (valid) | **503**, P2022 `contact_leads.reference` | not re-sent to production (it would create a real lead); the same code returns 201 on a migrated local DB, and the schema now matches exactly |
| `POST /api/contact`, `/training/apply`, `/careers/apply`, `/newsletter`, `/auth/register` (invalid) | — | **422** with field errors |
| `POST /api/auth/login` (wrong password) | — | **401** |
| Protected POSTs without a session (crm, student support, documents, admin CMS) | — | **401** |
| 40 consecutive `/health` checks | — | 40/40 |

Running apps (owner's dev servers), all rendered against Supabase: `:3000` `/`, `/services`, `/services/web-development`, `/blog`, `/portfolio`, `/contact`; `:3001` `/`, `/courses`; `:3002`–`:3005` `/login`. All returned 200 with **zero** "temporarily unavailable" occurrences. All 14 services from the database render on `/services`.

## Local migrated database (embedded Postgres, [DEMO] data)
Write lifecycle on the same code:
- `POST /api/contact` returns 201 `LEAD-2026-000025`, and the lead is visible in `/api/crm/leads` and `/api/admin/contacts`.
- Login sets the cookie; `/auth/me` returns 200; logout leads to 401.
- A student calling `/admin/dashboard` gets 403.
- The admin, CRM, CMS, programs, training-admin, exams, documents, platform and HR list endpoints all return 200.

## Frontend ↔ backend contract
- All **335** API calls in `@globalantic/api-client` and the main-site services resolve to registered routes with the correct method. That is 316 static calls plus 19 dynamic CMS/leads calls, whose resource unions were checked against the routes.
- The four public form schemas (contact, training, careers, newsletter) match the backend's Zod schemas field-for-field: required/optional flags and enum values.
- Both HTTP clients send `credentials: 'include'` and JSON with a content type. They use a 15 s timeout and distinct messages for missing config, network, timeout and server errors. They retry GETs only, once, on 502–504, and **never** retry writes. Server components forward the cookie.

## Other checks run
| Check | Result |
|---|---|
| `prisma validate` | valid |
| `prisma migrate status` (Supabase) | up to date |
| `prisma migrate diff` live → schema | empty |
| Backend `tsc --noEmit` | clean (run again after all fixes) |
| Backend eslint | clean (run again after all fixes) |
| Frontend unit tests | 64/64 |
| Production builds of the six apps | **not run this session**, because of the memory limits above (see the next steps) |
