# Implementation Status — Training Module

**Date:** 2026-10-15. Legend: ✅ implemented and verified · 🟡 implemented, needs credentials or approval for live use · ⛔ not done.

## Features
| Area | Status | Notes |
|---|---|---|
| Public training website (`training/`, 23 build routes) | ✅ | Catalogue with search, filters and pagination; course and batch detail; programmes; modes; fees; FAQ; contact; register with `?ref`; email verify; password reset; login; apply; application status; referral info; certificate verification; terms and privacy |
| Admission flow | ✅ | Account → verified email → apply (all server validated, fee snapshot, duplicate and seat protection) → review → payment → enrollment |
| Student portal (`intern/`, 23 build routes) | ✅ | All requested pages, including printable receipts and certificates |
| Trainer portal (`trainer/`, 14 build routes) | ✅ | Assigned batches only: roster, attendance (audited edits), assignments and grading, materials, announcements, assessments and results, progress, feedback, CSV report |
| Admin training (`admin/`, 21 build routes) | ✅ | Courses with syllabus and SEO, batches with schedule, trainers and status machine, admissions, students, payments (reconcile, refund record, audited offline), certificates, referrals (settings, rewards, payouts, fraud, audit), staff invites, support, announcements, audit log |
| Payments (Razorpay) | 🟡 | Fully implemented and tested with real HMAC; **no keys configured**, so every payment call returns 503 by design |
| Referral programme (₹2,000 configurable) | ✅ | See REFERRAL_SYSTEM.md |
| Notifications | 🟡 | In-app ✅; email through Resend after commit (key present in `.env` but not exercised in tests) |
| Dark / light theme | ✅ | Shared tokens, no flash, system detection, persistence; verified in a headless browser |
| Auth hardening | ✅ | Server-side sessions, revocation, per-account limiter, non-enumerating flows, email verification |
| Document / file upload | ✅ (2026-10-15) | Private storage (`UPLOAD_DIR`) with magic-byte type checks, 5 MB limit, random keys and ownership-checked downloads. Used for assignment submissions, admission documents, employee documents and (since 2026-10-15) trainer-uploaded learning materials, which only the batch can download. |
| Employee portal (`employee/`) | ✅ (2026-10-15) | Profile, attendance check-in/out, leave, tasks, projects, work updates, documents, HR requests, announcements |
| HR administration (admin app) | ✅ (2026-10-15) | Employees (invite), attendance correction, leave approvals, projects/tasks, work updates, HR requests, company announcements, employee documents |
| Users & roles, reports | ✅ (2026-10-15) | Role changes with escalation guards; permission matrix; summary report with CSV export |
| Marketing & Sales intern exams | ✅ (2026-10-15) | Question bank, exams (test / practical / interview), scheduling, assignment by intern / batch / college / programme, timed attempts with autosave and offline copy, server-side scoring with negative marking, manual evaluation, retakes, result release, reports and CSV export. API-tested (11) and driven end to end in a browser. See EXAM_MODULE.md |
| Real logo | ✅ (2026-10-15) | The supplied `frontend/public/logo.svg` in every app: headers, sidebars, mobile top bars, login screens, footers and favicons (shared `<Logo>`; a test keeps the copies byte-identical) |
| Main site data source | ✅ (2026-10-15) | Real API by default; mock only with an explicit `NEXT_PUBLIC_DATA_SOURCE=mock`. Verified in a browser (contact form 201, CMS admin). |

## Database changes
- **Migrations:**
  - `20261015090000_training_platform`
  - `20261016090000_employee_portal_and_files`
  - Both are additive only; see DATABASE_DESIGN.md.
- **Neither is applied to Supabase** (it still has only `init`). They are applied automatically to every local test and dev database.

## Session 2026-10-15: backend connection
See BACKEND_CONNECTION_AUDIT.md.
- **New backend:**
  - Services: `file.service.ts`, `employee.service.ts`, `hr.service.ts`, `users.service.ts`.
  - Routes: `files.routes.ts`, `employee.routes.ts`, `hr.routes.ts` (`/api/hr`, `/api/platform`).
  - Validators: `validators/employee.ts`.
  - Permissions: HR / EMPLOYEE / users / reports.
  - Config: env `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`, `EMPLOYEE_PORTAL_URL`.
- **Fixed:**
  - `prisma/seed.ts` module resolution;
  - main-site mock default and silent content errors.
- **Tests:** 12 files, 128 tests passing.

## Files changed (summary)
- **backend/**
  - New: `src/lib/{permissions,audit,counters,crypto,identity,pagination}.ts`.
  - New services: `src/services/{auth (rewritten),catalog,admission,payment,payment-gateway,referral,learning,student,certificate,admin-training,notification,training-email}.ts`.
  - New routes: `src/routes/{training.public,student,trainer,admin.training}.routes.ts`.
  - New: `src/validators/training.ts`.
  - Updated: `app.ts` (webhook raw route, routers, dev CORS), `middleware/auth.middleware.ts` (sessions, permissions), `middleware/rateLimit.middleware.ts`, `config/env.ts`, `config/database.ts` (transaction timeouts), `controllers/auth.controller.ts`, `routes/auth.routes.ts`, `utils/token.ts`, `services/email.service.ts` (HTML escaping, test outbox).
  - Tests: `tests/*` (8 files + runner and helpers).
  - Scripts: `scripts/{embedded-pg,migration-diff,dev-db}.ts`.
  - `.env.example` sanitised (placeholders).
- **prisma/:** `schema.prisma` (extended), the new migration, `seed-training-dev.ts` (local [DEMO] only).
- **packages/:** `types` (rewritten), `api-client` (new), `ui` (new: tokens, theme, primitives, shell, session), `auth` (real roles).
- **Apps:** `training/`, `intern/`, `trainer/`, `admin/` (all pages, layouts, middleware, `.env.example`). `next.config.mjs` gained `transpilePackages`, security headers and an optional `NEXT_DIST_DIR`.
- **Root:** `turbo.json` (env keys), `package.json` (`test:backend`, `dev:db`), `.gitignore`.
- **Docs:** TRAINING_MODULE_AUDIT, TRAINING_MODULE, DATABASE_DESIGN, API_DOCUMENTATION, SECURITY, ROLE_PERMISSION_MATRIX, REFERRAL_SYSTEM, TESTING, THEME_SYSTEM (appended), this file.
- **Unchanged:** `frontend/` (main site and legacy CMS admin).

## Tests
See TESTING.md.
- Backend: **85/85** passing.
- Main site: 40/40.
- Each of the 4 apps (final run after all fixes): `tsc --noEmit` ✓, `next lint` ✓ (no warnings), `next build` ✓. Routes in the build output: training 23, intern 23, trainer 14, admin 21.
- Headless-browser theme and layout checks on all 4 apps.

## Environment variables still required (production)
| Variable | Where | Status |
|---|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | backend | **missing**: payments are disabled until set; the webhook URL also needs configuring in Razorpay |
| `HASH_SALT` | backend | **missing**: required in production (boot fails without it) |
| `COOKIE_DOMAIN` (`.globalantic.com`) | backend | needed so portal subdomains share the session |
| `FRONTEND_URL` (all portal origins, comma-separated) | backend | must list training, intern, admin and trainer origins |
| `TRAINING_URL`, `INTERN_PORTAL_URL` | backend | used in emails and referral links |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TRAINING_URL`, `NEXT_PUBLIC_INTERN_PORTAL_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TRAINER_URL` | apps | see each `.env.example` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | backend | present locally; needs a verified sending domain (D-7) |

## Blockers / approvals needed
1. ~~Apply the migrations to Supabase~~: done 2026-10-15 with approval, after a JSON backup and a rehearsal on a local copy (`backend/scripts/migration-rehearsal.ts`). Deploy order for the future: migrate first, then deploy the backend.
2. **Rotate** the credentials that were in `backend/.env.example` (DB password, Resend key, Cloudinary secret, seed admin password).
3. **Next.js 14 → 15.5+ upgrade** for the published advisories (major; React 19).
4. Razorpay account and keys (test first), and a Resend sending domain.
5. Real course content and fees (D-9). The public site shows real API data only; production currently has no courses.
6. Initialise git. The repository is still not under version control.

## Session 2026-10-15: final backend integration
See FINAL_BACKEND_INTEGRATION_AUDIT.md for the gap list (G1–G15) and how each gap was resolved.
- **Migrations pending on Supabase (all additive):** `20261015090000_training_platform`, `20261016090000_employee_portal_and_files`, `20261017090000_admin_integration`.
- **New backend:**
  - `services/admin-platform.service.ts` (overview, user admin, grants, notes, typed reports), `controllers/faq.controller.ts`;
  - request-info functions in `admission.service.ts`, `setEmployeeStatus` in `hr.service.ts`, `listReferralCodes`, trainer workload;
  - public image store (`file.service.ts`, `routes/files.routes.ts`), sorting helper (`lib/pagination.ts`), grants in `lib/permissions.ts` and `middleware/auth.middleware.ts`, sign-in audit in `auth.service.ts`, `ApiError.validation` (422).
- **Frontends:** admin (dashboard, users/[id], trainers, referral codes, typed reports, sortable tables, course images, request-info, employee status, notes), intern (info-request response), legacy CMS (FAQs, image uploads, API image host).
- **Tests:** backend 140/140; main site 43/43; builds pass.
