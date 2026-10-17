# GLOBALANTIC — CURRENT PROJECT AUDIT (Phase 1)

**Date:** 2026-10-14
**Mode:** Read-only. No source, config, env, schema or database changes. No migrations, no seeds, no emails, no payments.
**Companion report:** `FULL_PROJECT_AUDIT_REPORT.md` (repo root, same date). It has route-by-route tables, file and line evidence, and 29 numbered issues (GA-001 … GA-029), which this document references.
**Secrets:** None are reproduced here. Env files were checked by key name and by hash comparison only.

> **Update (later on 2026-10-14):** the local backend started with `npm run dev` now answers `GET /api/services` (14 records), `/api/blog` (2) and `/api/settings`, so **the database connection has been restored** since this audit was written (GA-002). Only read-only checks were made. Separately, `frontend/` gained a mock/API service layer and a light/dark theme; see `docs/FRONTEND_PROGRESS.md`. Every other finding below is unchanged, including that the secrets in `.env.example` have not been rotated.

---

## 1. Verification performed

| Check | When | Result |
|---|---|---|
| Source inspection of every non-generated file (~200) | this session | done |
| Git status / branch | this session | **Not a git repository** (`fatal: not a git repository`). There is no branch, history or remote. |
| Change detection since the companion report | this session | No source, schema or env changes found. |
| `prisma validate` | this session | **PASS** ("schema is valid") |
| DB connectivity (`SELECT 1` through Prisma with `backend/.env`) | this session | **FAIL**: Supabase pooler returns `FATAL: (ENOTFOUND) tenant/user … not found` |
| `tsc --noEmit` in 7 apps and 6 packages | this session (companion run) | **PASS** ×13 |
| ESLint in 7 apps | this session (companion run) | **PASS** ×7, no warnings |
| `next build` ×6 (run in a scratch copy) + backend `tsc` | this session (companion run) | **PASS** ×7 |
| API runtime (local, read-only and negative requests) | this session (companion run) | Auth 401 ×4 PASS; validation 400 PASS; DB endpoints 500 (DB down) |
| Unit / integration / E2E tests | — | **None exist** |
| `npm audit` | this session | **FAIL**: 1 critical package (`next`, including **unauthenticated RCE** advisories below 15.5.24), 14 high |
| DNS / HTTPS / hosted deployments | — | **NOT VERIFIED**. Nothing was queried, and no deployment config exists. |
| Browser / responsive / accessibility | — | **NOT VERIFIED** |

---

## 2. Current architecture (actual)

```
Globalantic/  (npm workspaces + Turborepo; NOT under git; OneDrive-synced)
├── frontend/   Next.js 14 — corporate site (public) + embedded admin CMS at /admin   ← REAL
├── backend/    Express 4 + Prisma 5 REST API on :4000                             ← REAL
├── training/ intern/ employee/ admin/ trainer/   Next.js 14 single-page shells     ← PLACEHOLDER
├── packages/{auth,config,types,ui,utils,validation}   tiny stubs, imported by NO app ← PLACEHOLDER
├── prisma/     schema.prisma (14 models), 1 migration (init), seed.ts + data/
└── docs/       13 markdown files (prior reports + Phase-1 design proposals)
```

**Differences from the target structure:**

| Target | Actual | Gap |
|---|---|---|
| `apps/frontend` … `apps/trainer` | Root-level `frontend/` … `trainer/` | No `apps/` folder. A move would be cosmetic. See decision D-1. |
| `packages/api-client` | missing | Each future portal would otherwise duplicate the fetch helpers in `frontend/lib/*`. |
| `packages/utilities` | `packages/utils` exists | Naming differs; trivial. |
| `scripts/` | missing | — |
| `.github/workflows` | missing | No CI. Also no git. |
| Central admin in `apps/admin` | Real admin is in `frontend/app/admin`; `admin/` is a shell | Duplicate intent. See decision D-2. |

**Monorepo hygiene:**
- `frontend/` and `backend/` each still carry a pre-monorepo `package-lock.json` and a partial `node_modules/`, so two dependency trees exist.
- There is no NestJS anywhere. The backend is plain Express.

## 3. Actual framework versions (installed)

**Frontend tooling:**

| Package | Version |
|---|---|
| Node (local) | 24.12.0 |
| npm | 11.6.2 |
| next | **14.2.35** (vulnerable; see §9) |
| react / react-dom | 18.3.1 |
| typescript | 5.9.3 |
| turbo | 2.11.4 |
| eslint | 8.57.1 |
| zod | 3.25.76 |

**Backend:**

| Package | Version |
|---|---|
| express | 4.22.3 |
| prisma / @prisma/client | 5.22.0 |
| jsonwebtoken | 9.0.3 |
| bcryptjs | 2.4.3 |
| helmet | 8.3.0 |
| express-rate-limit | ^7.4 |
| resend | 4.8.0 |

**Not installed anywhere:** razorpay, cloudinary, multer/upload libraries, a test framework, a logger, or an error monitor.

## 4. Existing applications

| App | Path | Dev port | Routes | Status |
|---|---|---|---|---|
| Corporate site + admin CMS | `frontend/` | 3000 | 15 public route folders, 3 legal pages, `/admin/login`, 11 `/admin/dashboard/*` pages, sitemap/robots/OG | Partially implemented (works; content depends on the down DB) |
| Training | `training/` | 3001 | `/` only | Placeholder |
| Intern | `intern/` | 3002 | `/` only | Placeholder |
| Employee | `employee/` | 3003 | `/` only | Placeholder |
| Admin | `admin/` | 3004 | `/` only | Placeholder |
| Trainer | `trainer/` | 3005 | `/` only | Placeholder |
| API | `backend/` | 4000 | 45 registered handlers (see §6) | Partially implemented |

## 5. Existing database models (`prisma/schema.prisma`)

**Models:**

| Group | Models |
|---|---|
| Auth | `User` (id, email unique, passwordHash, name, role, timestamps) |
| CMS | `Service`, `Solution`, `Industry`, `PortfolioProject`, `BlogCategory`, `BlogPost` |
| Leads | `ContactLead`, `TrainingApplication`, `CareerApplication`, `NewsletterSubscriber` |
| Reference | `Technology`, `FAQ`, `SiteSetting` (singleton by convention) |

**Enums:** `Role {ADMIN, EDITOR}`, `ContactStatus`, `TrainingStatus`, `CareerStatus`, `TrainingMode`, `SubscriberStatus`.

**Integrity:**
- There is one foreign key: `BlogPost.categoryId`, with `SET NULL` on delete.
- All other cross-references are JSON or strings.
- Every delete is a hard delete.
- RLS is not enabled on any table.

**Missing:** every model needed by the platform. That includes roles and permissions, student, employee and trainer profiles, courses, batches, enrollments, attendance, assignments, submissions, assessments, certificates, fees, invoices, payments, notifications, audit logs, all referral models, and fraud reviews. These exist only as proposals in `docs/SCHEMA_EXTENSIONS_PROPOSAL.md`.

**Migration status:** one migration exists in the repo, `20260921043321_init`. Whether it is applied to the database **cannot be checked**, because the DB is unreachable.

## 6. Existing API endpoints (all mounted in `backend/src/app.ts`)

- `GET /health` — liveness only. It returns 200 even when the DB is down.
- **Auth:**
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- **Public reads:**
  - `GET /api/{services,solutions,industries,portfolio,blog}` and `/:slug`
  - `GET /api/{settings,technologies,faqs,blog-categories}`
- **Public writes** (zod-validated, strict rate limit):
  - `POST /api/contact`
  - `POST /api/training/apply`
  - `POST /api/careers/apply`
  - `POST /api/newsletter`
- **Admin** (`requireAuth` + `role === 'ADMIN'`):
  - Dashboard: `GET /dashboard`
  - Content CRUD for `{services,solutions,industries,portfolio,blog}`: `GET`, `GET /:id`, `POST`, `PUT /:id`, `PATCH /:id/publish|unpublish`, `DELETE /:id`
  - Leads `{contacts,training,careers}`: `GET`, `PUT /:id` (status), `DELETE /:id`
  - Newsletter: `GET`, `DELETE /:id`
  - Settings: `GET`, `PUT`

**Not present:**
- Pagination on any list endpoint.
- Any user-management, payment, webhook, upload, referral, LMS, HR, or trainer endpoint.

## 7. Existing roles and permissions

| Layer | What exists |
|---|---|
| DB | `Role` enum: `ADMIN`, `EDITOR` |
| Backend enforcement | `requireAdmin` checks only `req.user.role === 'ADMIN'`, read from the **JWT, not the DB**. `EDITOR` can do nothing. |
| Permissions | None (no permission model or checks) |
| Ownership checks | None needed today, because no user-owned resources exist |
| `packages/auth` | 9-role portal-access map (SUPER_ADMIN … INTERN). **Unused**, and it does not match the DB enum. |
| `docs/ROLE_PERMISSION_MATRIX.md` | Design proposal only; not implemented |

## 8. Feature classification

Legend: **VC** = Verified complete, **PI** = Partially implemented, **MI** = Missing, **IS** = Implemented but insecure, **BR** = Broken, **BD** = Requires business decision.

### Platform / infrastructure
| Feature | Class | Evidence |
|---|---|---|
| Monorepo build/lint/typecheck | VC | All PASS this session |
| Database connectivity | **BR** | `SELECT 1` fails. Every DB endpoint returns 500. |
| Secrets hygiene | **IS** | `backend/.env.example` = `.env` for DB URLs, Resend, Cloudinary and seed-admin keys (GA-001) |
| Version control | MI | No git |
| CI/CD | MI | No `.github/workflows` |
| Deployment config (Vercel/Render/Docker) | MI | None |
| Health check | IS / PI | Not DB-aware (GA-011) |
| Logging / monitoring | MI | console only |
| Backup & recovery | MI | No docs or scripts |
| Automated tests | MI | None |
| Dependency security | **IS** | `next@14.2.35`: critical unauthenticated RCE and many high advisories (GA-004) |

### Corporate website (`frontend/`)
| Feature | Class | Notes |
|---|---|---|
| Home, About, Contact, Careers, Legal | PI | Built. Not browser-verified. |
| Services list + 14 service detail pages | PI | CMS-driven. Down while the DB is down. |
| Industries list + 12 detail pages | PI | Same. Content is templated and near-duplicate. |
| Solutions list + 10 detail pages | PI | Same. |
| Portfolio | PI | 0 records (intentional; no fabricated work) |
| Blog list + detail | PI | 2 seeded posts. Renderer is safe. |
| SEO metadata, sitemap, robots, JSON-LD, OG image | VC (by build) | Missing `/og-image.png` asset (P3) |
| Contact / career / newsletter forms | PI | Validated client- and server-side. Write paths not run. |
| Email notifications (Resend) | **IS** | Unescaped user HTML. Acknowledgements go to arbitrary addresses (GA-005). Test sender only. |
| Newsletter unsubscribe | MI | Email copy promises it |
| Loading / error / 404 / empty states | VC (by source + build) | — |
| Responsive / accessibility | PI | Not browser-verified |
| Admin CMS UI (`frontend/app/admin`) | PI / IS | Works through the API. Client-side-only route guard (GA-006). No pagination. |

### Authentication & security
| Feature | Class | Notes |
|---|---|---|
| Password hashing (bcrypt 12) | VC (code) | — |
| JWT + httpOnly cookie | **IS** | Token also returned in the JSON body. `SameSite=None` in prod. No `Domain`. `maxAge` hardcoded (GA-007, GA-009). |
| Logout / session invalidation | IS | Cookie cleared only; JWT stays valid for 7 days |
| Role re-validation | IS | Role trusted from the JWT (GA-008) |
| Server-side auth on admin API | VC (runtime 401 tests) | — |
| RBAC / granular permissions / ownership | MI | — |
| Password reset / activation / change password | MI | — |
| Account lockout / enumeration protection | PI | IP rate limit only; timing enumeration possible |
| CORS allowlist | PI | Works, but rejection returns 500 |
| Helmet headers | VC (runtime) | — |
| CSRF | PI | Mitigated by CORS Origin rejection. Weakened by `SameSite=None` and urlencoded bodies. |
| Audit logs / security events | MI | — |
| Supabase RLS | **IS** (unverified exposure) | Not enabled. Needs a dashboard check (GA-003). |
| File upload validation | MI | No uploads exist |

### Training website (`training/`)
**Implemented:** a static info page on the main site at `/training` (PI) and a single application form (PI).

**Missing (MI), with no models, endpoints or UI:**
- Course listing
- Course details
- Batch listing
- Registration/accounts
- Admission enquiry workflow
- Dynamic fee information
- Payment flow
- Login links
- Referral registration
- Admin-controlled content

Program fees and the "50% off / limited seats" offer are hardcoded marketing copy. **BD:** confirm the real fee structure.

### Student/intern portal (`intern/`)
Every listed feature is **MI**:
- Authentication
- Profile
- Enrollment
- Batch / timetable
- Attendance
- Materials
- Assignments
- Submissions
- Assessments
- Feedback
- Certificates
- Fees, invoices and receipts
- Notifications
- Support
- Referral dashboard

The app is a single placeholder page.

### Employee portal (`employee/`)
Every listed feature is **MI**:
- Profile
- Onboarding
- Attendance
- Leave
- Tasks
- Projects
- Work updates
- Documents
- HR requests
- Announcements
- Confidentiality controls

### Trainer portal (`trainer/`)
Every listed feature is **MI**.

### Admin dashboard (`admin/` app)
Placeholder. The real admin functions (CMS, leads, settings, stats) are in `frontend/app/admin` (PI).

**Missing (MI):**
- SEO settings UI beyond site settings
- Courses and batches
- Admissions and students
- Fees and payments
- Employees and trainers
- Roles and permissions
- Referrals
- Reports
- Notifications
- Email templates
- Audit logs
- Security events
- System health
- Background jobs
- Reward settings

### Integrations
| Integration | Class |
|---|---|
| Supabase Postgres | **BR** (unreachable) + IS (no RLS) |
| Resend | PI / IS |
| Razorpay (orders, signature, webhooks, idempotency, refunds) | **MI**. No SDK, env keys, routes or models. |
| Cloudinary / file storage | **MI**. Only env keys are read; nothing uses them. |

## 9. Security risks (prioritised)

| ID | Pri | Risk |
|---|---|---|
| GA-001 | **P0** | Real credentials in `backend/.env.example`, which `.gitignore` explicitly allows. Folder is OneDrive-synced. **Rotate.** |
| GA-004 | **P0** | `next@14.2.35` has **critical unauthenticated RCE** advisories (Image Optimization API with AVIF; Windows-hosted servers). Fixed only in `next ≥ 15.5.24`. That is a major upgrade and requires React 19. **Do not deploy publicly until upgraded.** (This was raised from P1 in the companion report after reading the advisory details.) |
| GA-002 | P0 | DB unreachable; production blocker |
| GA-003 | P1 | No RLS. Possible anon-key access to `users.passwordHash` and lead PII. |
| GA-005 | P1 | Email HTML injection and an open acknowledgement relay |
| GA-006 | P1 | Admin pages have only a client-side guard (the API itself is protected) |
| GA-007/008/009 | P2 | Token in body; no revocation; role from JWT; weak cookie attributes |
| GA-010 | P2 | Seed resets the admin password hash on every run; weak fallback password |
| GA-011/013/021/023 | P2–P3 | Health not DB-aware; invalid filters → 500; one shared rate limiter; CORS 500 |
| GA-018 | P2 | No audit log; hard-deletes PII |
| GA-014 | P2 | No version control |

## 10. Deployment gaps

**Nothing is configured.** Missing:
- `vercel.json` or project settings
- Render/Railway/Docker files
- CI
- Monitoring
- Backups doc

**Domains:** `globalantic.com` and all subdomains are **unverified**. No DNS or HTTPS checks were performed.

**Cookies:** the cookie has no `Domain`, so one login cannot span subdomains. `COOKIE_DOMAIN` appears in the docs and `turbo.json` but nowhere in the backend code.

**CORS:** `FRONTEND_URL` must list all 6 portal origins.

**Resend:** needs a verified sending domain. The current sender is placeholder-style.

**Razorpay webhook URL:** not applicable yet; there is no integration.

## 11. Referral system gaps

**No referral implementation exists.** A code search for "referr" matches only `noreferrer` and `preferredContactTime`. Everything in Phase 5 is MISSING, along with all of its prerequisites:

1. **Student identity.** Today a "training applicant" is a lead row, not a user account.
2. **Verified student accounts.** No registration, email/phone verification, or duplicate-identity checks.
3. **Admissions and enrollment.** Required to define "admitted".
4. **Razorpay** with server-side orders, signature-verified webhooks and idempotency. This is the only trustworthy "paid" signal.
5. **RBAC + audit log.** Required for reward approval and payout actions.
6. **Configurable settings storage.** Reward amount and eligibility rules.

The referral system therefore **cannot be safely built first**. It depends on items 1–6.

**Business decisions required (BD):**

| ID | Decision | Proposed default (to confirm) |
|---|---|---|
| R-1 | Who may refer? | Students with an active enrollment |
| R-2 | When is a referral reward-eligible? | Referred student's admission CONFIRMED **and** first/full fee verified via Razorpay webhook **and** a refund window of N days has passed with no refund |
| R-3 | Refund window N | 7 days |
| R-4 | Reward amount | ₹2,000, configurable by an authorised admin |
| R-5 | Is the reward the same for online and offline fees? | Same, configurable |
| R-6 | Payout method | Manual (UPI/bank transfer) recorded by Finance. No automated payouts. |
| R-7 | Caps | e.g. maximum rewards per referrer per month; maximum rewards per batch |
| R-8 | Referral expiry | Click attribution lasts 30 days; first valid referral code wins |
| R-9 | Reward on partial or EMI payment? | Only after the qualifying amount is paid |

## 12. Business / high-risk decisions needed before Phase 2+

| ID | Decision | My recommendation |
|---|---|---|
| D-1 | Move apps into `apps/`? | **Defer or skip.** It is cosmetic, and the guidance in this project is not to move files for appearance. If wanted, do it once, right after `git init`, in a single commit. It touches 6 workspace paths, `turbo.json`, and docs. |
| D-2 | Where does the central admin live? | Keep `frontend/app/admin` working. Build new platform admin features in `admin/`, then migrate the CMS pages there and retire `frontend/app/admin` once parity is reached. |
| D-3 | Next.js upgrade path | Upgrade all 6 apps to Next 15.5.24+ with React 19 (critical RCE). Do it early, before writing new portal code, so new code is written once. |
| D-4 | Restore the DB | You need to check the Supabase project (paused, deleted, or credentials changed) and supply working credentials. **No migration work is possible until this is done.** |
| D-5 | Initialise git + private remote | Recommended immediately, *after* `.env.example` is sanitised |
| D-6 | Razorpay account (test keys first) | Needed before payments or referrals |
| D-7 | Resend sending domain | Needed for real admission and notification emails |
| D-8 | Hosting choice | Vercel (apps) + Render or Railway (API), as the docs state; confirm |
| D-9 | Real training fees / offer copy | Confirm before the training site goes dynamic |

## 13. Recommended implementation order

Each step must keep every build green and is followed by tests and doc updates. Steps marked ⚠ need your approval first.

1. **Safety baseline (no data risk)**
   - Sanitise `.env.example` with placeholders. You rotate the credentials.
   - ⚠ `git init` + `.gitignore` check.
   - Add a test framework: Vitest + Supertest for the backend.
   - Fix low-risk security bugs: email HTML escaping, token removed from the login body, role re-read from the DB, cookie attributes, DB-aware readiness check, query validation, separate rate limiters, CORS 403, seed no longer resetting the password.
2. **Restore the DB (you)**, then verify the existing migration status read-only, with `prisma migrate status`.
3. ⚠ **Next 15.5.24+ / React 19 upgrade** across all apps, plus a single root lockfile (remove the nested lockfiles).
4. **Shared foundations:**
   - `packages/api-client` (extracted from `frontend/lib`)
   - `packages/types` aligned with Prisma
   - `packages/validation` with shared zod schemas
   - `middleware.ts` session gate in each private app
5. ⚠ **Migration A (additive only):**
   - Extend the `Role` enum
   - Add a `User.status` field
   - Add the `Permission`/`RolePermission` models and `AuditLog`
   - Add the RBAC middleware (`requirePermission`)
   - Add admin user management with no self-escalation
   - Run ownership-check test helpers
6. ⚠ **Migration B:**
   - Courses, Batches, StudentProfile, Enrollment, Admission states
   - Training site course and batch pages + registration with email verification
7. ⚠ **Migration C:**
   - Fees, Invoices, Payments, WebhookEvent (idempotency)
   - Razorpay orders, signature-verified webhook, and transactions
   - Admission → enrollment on verified payment
8. ⚠ **Migration D:**
   - The referral system (codes, clicks, attributions, rewards, payouts, fraud reviews, configurable settings)
   - `docs/REFERRAL_SYSTEM.md`, written *after* R-1…R-9 are confirmed
9. **Intern portal:** profile, enrollment, schedule, attendance, assignments and submissions (with secure uploads via Cloudinary signed uploads), assessments, certificates, fees and receipts, referral dashboard.
10. **Trainer portal:** assigned batches only, with IDOR tests.
11. **Employee portal + HR models:** confidential-document access controls.
12. **Admin portal completion:** reports, notifications, email templates, security events, system health.
13. **Deployment:** Vercel and Render configs, CI workflow, monitoring, backup doc, subdomain setup doc, live DNS/HTTPS verification.

**Honest scope note:** steps 6–12 are each a substantial multi-session phase for a single maintainer. Doing them in this order means every later phase builds on verified auth, payments and audit logging, rather than retrofitting them.
