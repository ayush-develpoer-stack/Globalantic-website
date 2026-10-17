# Testing

All results below come from commands actually run on 2026-10-15 on the development machine (Windows 11, Node 24.12). Nothing here was run against Supabase.

## 1. Backend API tests — `npm --workspace backend test`
`backend/tests/run.ts` does the following:
1. Starts an **embedded PostgreSQL 17** (`embedded-postgres`, dev dependency).
2. Applies the committed migrations to a template DB. This also proves the migrations apply from scratch.
3. Runs each `tests/*.test.ts` file in its **own fresh database** with test-only secrets.

Network calls to Razorpay use an in-process double (`FakeGateway`). All HMAC signatures use real crypto with test secrets. A guard refuses to run if `DATABASE_URL` is not local.

**Last full run (2026-10-15): 13 files, 140 tests, 0 failures** (`✓ all 13 test files passed`, exit 0). Validation failures are asserted as **422** throughout.

| File | Tests | Covers |
|---|---|---|
| `auth.test.ts` | 11 | Unauthenticated access is blocked on every private area. Forged and tampered JWTs, and JWTs without a session, are rejected. Registration does not enumerate (duplicate email, duplicate phone, Gmail alias). Input validation and consent. Single-use verification links; unverified students cannot apply. Generic login errors; httpOnly + SameSite cookie. Logout revokes the server session. Suspension revokes sessions and is audited. Password reset is generic, single-use and revokes sessions. A role change applies immediately. |
| `permissions.test.ts` | 9 | Static permission matrix. Students and trainers get 403 on all admin routes. EDITOR is denied training admin. FINANCE limits. Portal separation. Legacy CMS stays ADMIN-only. Course and batch management end-to-end with audit (discount ≤ fee, publish needs a syllabus, cancel needs a reason). Nullable fields clear, and a cleared fee override falls back to the course fee. Trainer assignment requires the TRAINER role. |
| `admissions.test.ts` | 9 | Invalid, unknown and injection batch ids rejected. Closed, past-deadline and full batches refused. Approval cannot exceed capacity. Duplicate admission refused (same batch, same course, and 3 concurrent submits → exactly 1). Fee comes from the DB and client money/status fields are ignored. A student cannot read or withdraw another student's application, or pay for it. Rejection needs a reason, notifies and is audited. Zero-fee courses enroll on approval; withdraw and re-apply work. The public catalogue hides drafts. |
| `payments.test.ts` | 11 | Orders only for approved applications, using the DB amount, with no secrets in the response. **Invalid payment signature is rejected.** Valid checkout leads to PAID, then invoice, then enrollment, idempotently. IDOR on invoices and payments. Provider amount mismatch is rejected. **Webhook: bad signature rejected, tampered body rejected, replay ignored**, and checkout after the webhook is a no-op. failed → captured → refunded. A client-reported failure can never mark a payment paid. Reconciliation reads the provider. Offline payment is ADMIN-only, uses the DB amount and is audited. Not configured → 503. |
| `referral.test.ts` | 10 | Server-generated code only after enrollment; the link has no PII. Click tracking and dedupe. **Self-referral rejected** (phone, own code, Gmail alias). Full funnel to a reward of 200000 paise with a 7-day window. **Duplicate rewards impossible** (second course, second payment, webhook replay). **The client cannot set the amount**: settings are ADMIN-only and changes apply to new rewards only. Review rules: the refund window, the referrer cannot approve their own reward, no double approval, payout once, reject needs a reason. Refund cancels the reward. Confirmed fraud disqualifies. Same-IP signal leads to manual review. |
| `learning.test.ts` | 6 | **A trainer sees only assigned batches** (404 on others; access revoked immediately on unassignment). Attendance: an unassigned trainer is blocked, edits are audited before/after, foreign enrollments are refused, future dates are refused, and a student cannot write or read another student's attendance. Assignments: https-only links, submission isolation, outsiders get 404, marks ≤ max, a student cannot grade, graded work is locked. Results stay hidden until published. Materials and announcements. **Certificates:** only when eligible (completion, attendance, FINAL passed), once, never by a student, publicly verifiable. Batch report contains no financial or PII fields. |
| `contracts.test.ts` | 31 | Every enum in `@globalantic/types` equals Prisma's, and the shared `Permission` union equals the server list. |
| `hardening.test.ts` | 19 | `GET /` descriptor; `/health` checks the DB; malformed JSON 400 / oversized 413; CORS reject 403; login returns only safe fields and no token; SameSite default; suspended, soft-deleted, hard-deleted and demoted admins lose access immediately; separate limiter instances; per-account login lockout; contacts/training/careers lists: valid, empty and unknown filters 200, invalid status / repeated or oversized search / bracket syntax 400 with no Prisma internals; filtering preserved; FINANCE 403 / anon 401; FAQ repeated category 400 (was a Prisma 500). |
| `employee.test.ts` | 7 | HR creates an employee via invite (EMP code); portal separation (student/trainer/admin/HR cannot use the employee portal; employees/finance cannot use HR routes; an EMPLOYEE without a profile gets a clean 403); check-in/out once per day, private history, HR correction audited; leave validation, server-computed days, overlap 409, ownership, approve/reject rules, no self-approval; projects members-only, assignee can only change status, teammates without emails, work-update ownership and date window; HR requests and announcements; HR-managed job fields cannot be self-edited. |
| `files.test.ts` | 4 | Magic-byte detection and safe names; auth required, exe-as-pdf / html-as-png / empty / >5 MB / bad purpose rejected; students cannot upload HR docs; assignment file attached by its owner only; downloads limited to the owner and assigned trainer (others 404, anonymous 401), attachment + nosniff headers; employee documents visible/hidden rules, one attachment per file, admin access. |
| `platform.test.ts` | 3 | Users list and roles matrix need users.manage; role change audited and revokes sessions; ADMIN not grantable, no self-change, ADMIN accounts and students protected; reports summary for ADMIN/FINANCE only and free of PII. |
| `lead-list-query.test.ts` | 8 | Existing CMS lead-filter regression, now with a real admin session. |

Run one file with `npm --workspace backend test -- referral`.

> On this machine, a full run while four Next.js builds and the user's dev stack were running produced load-induced failures ("Can't reach database server", 20 s transaction expiry). The same suite passed 85/85 on the next run. If you see that, re-run on a quieter machine.

## 2. Static checks

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit` (backend) | ✓ |
| Backend compile | `tsc -p tsconfig.json` | ✓ |
| Backend lint | `npx eslint "src/**/*.ts"` | ✓ no warnings |
| Prisma | `prisma validate` | ✓ valid |
| Packages typecheck | `tsc --noEmit` in types, api-client, ui, auth | ✓ |
| Apps typecheck / lint / production build | per app: `tsc --noEmit`, `next lint`, `next build` | ✓ all four (training 23, intern 23, trainer 14, admin 21 routes) |
| Main site regression | `npm --workspace frontend test` | ✓ 40/40 |
| Theme contrast (WCAG) | `npm --workspace frontend run check:contrast` (the shared token file is byte-identical to the main site's) | ✓ all pass |

## 3. Browser verification (headless Microsoft Edge over CDP)
I ran each app against a **local API (port 4100) + local demo DB**. For every page:
- light and dark (via `prefers-color-scheme`, so first-visit system detection is also exercised);
- widths 360 px and 1280 px;
- screenshot, horizontal-overflow check, body colours, white surfaces in dark mode, console errors.

| App | Pages | Renders | Problems |
|---|---|---|---|
| training | home, courses, course detail, register with `?ref`, apply (signed out), referral | 24 (+4 re-check) | Found and fixed: the mobile header clipped Register and hid the menu button (CSS specificity vs the shared `.btn`). The re-check passed. |
| intern (signed in as a student) | login, dashboard, applications, referrals, attendance, payments | 24 (+2) | 0 (one blank capture was a dev-server reload; the re-check passed) |
| admin (signed in as ADMIN) | dashboard, admissions, referrals, courses, payments | 20 | 0 |
| trainer (signed in as TRAINER) | dashboard, batch attendance, batch report | 12 | 0 |

HTTP smoke tests:
- all 11 public training pages, 17 student, 15 admin and 10 trainer routes returned 200;
- the student portal without a cookie redirects to `/login?next=/` (middleware).

## 4. Not tested (needs credentials or production)
- Real Razorpay test-mode checkout in a browser (no keys configured). The signature and webhook logic is tested with real HMAC.
- Real email delivery through Resend (emails are captured in tests).
- The migration on Supabase (needs approval).

## 5. Connection verification (2026-10-15, real browser, local DB + real API)
- **Main site in API mode** (:3100 → API :4100):
  - `/`, `/services`, `/services/web-development`, `/blog`, `/industries`, `/portfolio`, `/contact` and `/admin/login` returned 200 with DB content.
  - Contact form submitted in the browser → `POST /api/contact` 201.
  - CMS admin login → `/api/auth/login` 200, then `/api/admin/dashboard` 200; `/api/admin/contacts` 200 lists the new lead; `/api/admin/services` 200.
  - 0 console errors.
- **Employee portal** (:3103): employee created through `POST /api/hr/employees`, invite accepted, check-in 201, leave 201. All 10 routes return 200. The dashboard shows today's attendance and pending leave.
- **Admin HR** (:3104): all 9 new routes return 200; the leave appears as Pending with the server-generated employee code.
- **Theme and layout:** 28 renders (employee and admin HR pages, light/dark × 360/1280): 0 overflow, 0 white-in-dark, 0 console errors.
- **Production seed:** `npm run prisma:seed` was broken (module resolution). Fixed, and verified by seeding the local DB.
- **Other checks:** main-site tests 40/40 and `next lint` clean; `tsc --noEmit` clean in training, intern, trainer, admin and employee; the agents' production builds (into `.next-verify`) passed for employee, admin, intern, trainer and training.

## 6. Final integration pass (2026-10-15)
- **New file `admin-integration.test.ts` (12 tests):**
  - status contract (422/400/401/403/409);
  - security audit events (login success/failure with hashed unknown email, logout, forbidden);
  - permission grants (non-grantable → 422, ineligible role → 409, self → 403, immediate effect, revocation, audit);
  - user detail, safe edit, reset link, notes;
  - permission-aware overview;
  - reports (date filter, per-type 403, audited export);
  - request-info loop;
  - HR employee status;
  - public images (images only, public read, private never public, URL validation);
  - whitelisted sorting;
  - referral codes and trainer workload;
  - CMS FAQ CRUD.
- **Main site:** `npm --workspace frontend test` → 43/43 (3 new FAQ/upload tests).
- **Builds** (`tsc`, `next lint`, `next build` into `.next-verify`): admin (34 routes), intern (23) and frontend all pass.
- **Browser** (headless Edge, local DB + API :4100):
  - admin dashboard overview: `GET /platform/overview` 200, real counts;
  - `/users/[id]`: 200 for platform/users/:id, roles and permissions;
  - application shows the info request;
  - course image upload: `POST /files?purpose=COURSE_IMAGE` 201, `GET /files/public/:id` 200, preview rendered;
  - reports and trainers pages load real data;
  - course table sort click: request carries `sort=title:asc`, `aria-sort=ascending`;
  - student response to the info request: saved, and the admin API returns it. After reload the portal shows "Your response was sent". The immediate post-submit refresh was not captured within 8 s in dev mode; the persisted end state was verified;
  - legacy CMS FAQ create: `POST /admin/faqs` 201, listed.
- **Theme/layout:** 24 renders (6 screens × light/dark × 360/1280): 0 overflow, 0 white-in-dark, 0 console errors.
- Dev-mode first compiles took up to 53 s per route on this machine; checks used extended waits.

## 7. "Service temporarily unavailable" fix (2026-10-15)
**Passed:**
- Backend `npm --workspace backend test`: 140/140 across 13 files (embedded Postgres, never Supabase).
- Main site `npm --workspace frontend test`: 46/46. The 3 new tests in `tests/http.test.ts` check that a GET is retried once on 503 or a network error, and that POST/PUT/PATCH/DELETE are never retried.
- Shared client (`packages/api-client`), stubbed-fetch script: GET retried once; writes never retried; an empty API URL gives "NEXT_PUBLIC_API_URL missing".
- `tsc --noEmit`: backend, api-client, config, and all 6 apps.
- `next lint`: all 6 apps clean.
- `prisma validate`: valid.
- `next build` (`.next-verify`): all 6 apps. The training, intern and employee builds first failed on a transient DNS failure for `fonts.googleapis.com` (`next/font`) and passed on retry.
- Live API on :4000 against Supabase, read-only:
  - `/health` 200 with database up;
  - 11 public GETs 200;
  - 9 protected endpoints return 401 without a session;
  - invalid contact body 422, malformed JSON 400, foreign origin 403, unknown route 404;
  - CORS allows `http://localhost:3001`;
  - wrong credentials on login give 401, no longer 503.
- Live browser (headless Edge against the user's dev servers): 8 pages on :3000/:3001/:3002/:3004 rendered with no "temporarily unavailable" text and 0 console errors.

**Not run against live Supabase (by design):** authenticated writes such as login with real credentials, applications, attendance and HR actions. Running them would put test data in the real database. They are covered by the API tests and by the browser runs on local database copies (sections 5–6).

**Not testable here:** Razorpay checkout and webhook, and Resend email delivery. Both need credentials.

## 8. Intern exams, logo and responsive pass (2026-10-15)
**Passed:**
- Backend `npm --workspace backend test`: **151/151 across 14 files**.
  - The new `tests/exams.test.ts` has 11 tests: access, key secrecy, lifecycle, deadline/auto-submit, limits/retakes/concurrent starts, edit locks, college/batch assignment with random subsets, interview/report/export, material files, negative marking.
  - The first full run had one `fetch failed` (a connection dropped while the machine was heavily loaded). That file passed 12/12 on its own, and a clean full rerun passed everything.
- Main site `npm --workspace frontend test`: **48/48**, including `tests/logo.test.ts` (logo copies byte-identical; no "G" placeholder).
- `tsc --noEmit`: backend, `packages/ui`, `packages/api-client`, all 6 apps. `next lint`: all 6 apps clean. `prisma validate`: valid.
- `next build` (`.next-verify`): all 6 apps.
- **Exam workflow in a real browser** (headless Edge; built apps on 3100–3105; API :4100; local dev DB):
  - Admin UI: create questions (MCQ and written) → new exam → attach from bank → assign an intern → publish.
  - Intern UI: list → instructions → start → autosave ("All answers saved") → refresh restores answers → submit.
  - A duplicate submit returns 409.
  - Admin evaluates 1.5/2 on the written answer → release results → report.
  - The intern sees "1.5 / 3" with feedback and comment. Another student gets 404.
  - 0 console errors. At 360 px the timer is visible and there is no horizontal overflow.
- **Responsive + logo audit**: 41 pages (main site, training, intern, employee, admin, trainer, 4 login pages) × 7 widths (320, 375, 414, 768, 1024, 1366, 1920):
  - 0 pages with horizontal overflow;
  - the real logo is loaded and visible inside the viewport at every width;
  - 0 console errors.
  - Small-target flags: 1 on /register and 3 on the exam settings tab, all 18 px checkboxes inside clickable labels.
- **Supabase after the migration**: `migrate status` up to date; all 60 tables have row counts identical to the pre-migration backup; live :4000 serves the new routes (401 without a session).

**Not run against Supabase:** authenticated exam/material calls. That would need real credentials and would write test data. They were verified on the local DB.

**Fixed during this pass:**
- A stray vertical scrollbar on every tab row (shared CSS).
- The mobile portal top bar had no logo.
- The nav highlighted two items on nested routes.
- The rehearsal DB was created as WIN1252 and could not hold "₹" (now UTF-8).
