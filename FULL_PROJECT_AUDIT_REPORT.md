# GLOBALANTIC — FULL PROJECT AUDIT REPORT

**Audit date:** 2026-10-14
**Mode:** Read-only. No source, config, env, or database changes. No migrations or seeds. No emails or payments sent.
**Method:** Every source file was inspected directly (≈ 200 non-generated files). Typecheck, lint, build, and `npm audit` were run, and the API was started locally and called with **read-only and negative-path requests only**.
**Secrets:** No secret values appear in this report. Env files were checked by key name, value length, and hash comparison only.

**Side effects of the audit (all outside source):**
- Next.js builds ran in a scratch copy, so the repo's `.next/` folders were not touched.
- The backend was compiled to a scratch `outDir`, so `backend/dist/` was not touched.
- The local API was started and then stopped.
- `npm audit` sent the lockfile to the npm registry.
- One file was added: this report.

---

## A. Executive Summary

Globalantic is currently made of three working parts:

1. **A working public IT-services marketing website** (`frontend/`).
2. **A small, cleanly structured Express + Prisma API** (`backend/`), covering CMS content, lead capture, and a single-role admin.
3. **An admin CMS/CRM embedded inside the marketing site** (`frontend/app/admin/*`).

The other five "portals" (`training/`, `intern/`, `employee/`, `admin/`, `trainer/`) are **one-page placeholder shells**. Each has a single static page with no routes, no API calls, and no auth.

The six `packages/*` are **placeholders that no app imports**.

None of the following exist in code: the training/LMS platform, intern features, employee/HR features, trainer features, Razorpay, Cloudinary, RBAC beyond `ADMIN`, password reset, and audit logging. They exist only in design documents (`docs/PLATFORM_ARCHITECTURE.md`, `SCHEMA_EXTENSIONS_PROPOSAL.md`, `ROLE_PERMISSION_MATRIX.md`, `ONLINE_WORKFLOW.md`). Those documents describe themselves as proposals.

**Most important findings:**

| # | Finding | Severity |
|---|---|---|
| 1 | `backend/.env.example` holds **the same real values as `backend/.env`** for the DB URLs, Resend key, Cloudinary key/secret, and seed admin email/password. This was flagged by the earlier audit (2026-09-26) and is **still unfixed**. | P0 |
| 2 | **The database is unreachable with the current credentials.** The Supabase pooler rejects the connection ("tenant/user not found"). Every DB-backed endpoint returns HTTP 500. The project may be paused or deleted, or the credentials may have been rotated. | P0 (production blocker) |
| 3 | `next` (installed 14.2.35) has **1 critical and 14 high** `npm audit` advisories. | P1 |
| 4 | The admin area is protected **only by a client-side guard**. The backend correctly rejects unauthenticated calls (verified). | P1 (defense-in-depth) |
| 5 | Supabase RLS is **not enabled** on any table (no policies in the migration). If the Supabase Data API is on, `users.passwordHash` and lead PII could be read with the project's public anon key. | P1 (verify in dashboard) |
| 6 | User input is placed into Resend email HTML **without escaping**. The acknowledgement emails go to any address a visitor submits. | P1 |
| 7 | The login response returns the JWT in the JSON body, which undermines the httpOnly-cookie design. There is no logout revocation, and the role is trusted from the token instead of re-read from the DB. | P2 |
| 8 | **No automated tests** exist anywhere. **No deployment config** exists (no vercel.json, render.yaml, or Dockerfile). | P2 |

**What does pass (verified this session):**
- Typecheck: all 7 apps and 6 packages.
- Lint: all 7 apps.
- Build: all 6 Next apps and the backend.
- Auth guards: return 401 correctly.
- Validation: returns 400 correctly.
- CORS: rejects unknown origins.
- Helmet: headers present.

---

## B. Actual Repository Structure

```
Globalantic/                    (NOT a git repository — no .git; synced via OneDrive)
├── package.json                npm workspaces + turbo scripts (genuine workspace config)
├── package-lock.json           root lockfile (authoritative)
├── turbo.json                  build/lint/typecheck/dev pipeline
├── tsconfig.json               root base config with @globalantic/* paths (unused by apps)
├── .gitignore                  ignores .env, .next, dist, .turbo; allows .env.example
├── README.md
├── frontend/                   REAL app — marketing site + embedded admin CMS
│   ├── app/(marketing)/…       15 public route folders
│   ├── app/admin/…             login + 11 dashboard routes
│   ├── components/             ~45 components (ui, layout, sections, detail, forms, blog, portfolio, admin)
│   ├── lib/                    api.ts (server fetch), client-api.ts, config.ts, seo.ts
│   ├── package-lock.json       ⚠ stale nested lockfile (workspace uses root lock)
│   ├── node_modules/           ⚠ partial nested install (no `next` inside)
│   └── .env.local              identical to .env.example (public vars only)
├── backend/                    REAL app — Express API
│   ├── src/{config,controllers,middleware,routes,services,utils,validators}
│   ├── dist/                   compiled output (identical to a fresh compile — not stale)
│   ├── package-lock.json       ⚠ stale nested lockfile
│   ├── node_modules/           ⚠ separate nested install (own prisma/tsx)
│   ├── .env                    real secrets (correctly gitignored)
│   └── .env.example            ⚠ CONTAINS REAL SECRETS (see J-1)
├── training/ intern/ employee/ admin/ trainer/
│                               SHELLS — app/{layout,page,globals.css} + empty .gitkeep folders
├── packages/{auth,config,types,ui,utils,validation}
│                               PLACEHOLDERS — tiny src/index.ts each, imported by nothing
├── prisma/                     schema.prisma, seed.ts, data/*.ts, 1 migration (init)
└── docs/                       13 markdown files (reports + Phase-1 design proposals)
```

**Is it a genuine monorepo?** Partly. npm workspaces are real: the root lockfile covers every workspace, `npm --workspace X` works, and `@globalantic/*` packages are symlinked into the root `node_modules`. `turbo.json` is valid. However:

- No app depends on any `@globalantic/*` package. The packages are dead code.
- `frontend/` and `backend/` still carry their own pre-monorepo `package-lock.json` and partial `node_modules/`. Two dependency trees can resolve different versions (for example, `backend/node_modules` has its own tsx and prisma).
- The admin CMS lives in `frontend/app/admin`, while a separate `admin/` app exists as an empty shell. This duplicates the intended responsibility.
- The project is **not under version control**. There is no history, no rollback, and no way to tell whether secrets were ever pushed anywhere.

---

## C. Application Inventory

| Application | Path | Framework | Entry Point | Port/URL (dev) | Status |
|---|---|---|---|---|---|
| Main website + admin CMS | `frontend/` | Next.js 14.2.35 App Router, React 18, TS | `app/layout.tsx`, `app/(marketing)/page.tsx` | 3000 (`next dev`, default port) | **Working** (builds; content depends on API) |
| Training site | `training/` | Next.js 14 | `app/page.tsx` | 3001 | **Placeholder shell** ("full implementation lands in a later phase") |
| Intern portal | `intern/` | Next.js 14 | `app/page.tsx` | 3002 | **Placeholder shell** |
| Employee portal | `employee/` | Next.js 14 | `app/page.tsx` | 3003 | **Placeholder shell** |
| Admin portal | `admin/` | Next.js 14 | `app/page.tsx` | 3004 | **Placeholder shell** (the real admin is in `frontend/app/admin`) |
| Trainer portal | `trainer/` | Next.js 14 | `app/page.tsx` | 3005 | **Placeholder shell** |
| API | `backend/` | Express 4.21, TS, Prisma 5.22 | `src/server.ts` → `src/app.ts` | 4000 | **Runs**; DB unreachable (see K) |
| Shared packages | `packages/*` | plain TS | `src/index.ts` | — | **Placeholders, unused** |

**Scripts:**
- Every Next app has `dev`, `build`, `start`, `lint` (`next lint`), and `typecheck` (`tsc --noEmit`).
- The backend has `dev` (tsx watch), `build` (tsc), `start`, `lint`, `typecheck`, and `prisma:*`.
- The root has turbo `dev`, `build`, `lint`, and `typecheck`, plus `prisma:*` passthroughs.
- No workspace has a `test` script.

---

## D. Frontend Audit (`frontend/`)

### Architecture
- **Rendering:** App Router with a `(marketing)` route group that has its own Navbar/Footer layout, and a separate `admin/` layout with no marketing chrome.
- **Data fetching:**
  - Public data comes from server components via `lib/api.ts` (fetch with ISR `revalidate: 300`). It returns `null` on failure, so pages degrade gracefully instead of crashing.
  - Mutations go through `lib/client-api.ts` with `credentials: 'include'`.
- **Styling:** CSS Modules per component, plus global tokens in `app/globals.css`. Colours are tokenised there, but `packages/config` duplicates the same tokens, and the portal shells define a third copy.
- **TypeScript:** strict mode; passes `tsc --noEmit`. API JSON fields are typed loosely, as `string[]`, with no runtime validation.
- **Forms** (Contact, Training, Career, Newsletter) use react-hook-form + zod, with error, loading, and success states.
  - Client and server rules mostly match.
  - Mismatch: training `age` is allowed from 10 on the client but must be ≥15 on the server, so ages 10–14 get a server 400.
- **Career form:** collects a résumé *URL* only. There is no file upload anywhere.
- **SEO** (verified by source inspection and the build):
  - `buildMetadata()` sets canonical, OpenGraph, and Twitter tags.
  - `generateMetadata` on dynamic pages.
  - JSON-LD (Organization, Breadcrumb, Service, Article, Course).
  - `sitemap.ts` (static + API-driven URLs), `robots.ts` (disallows `/admin`), and a generated `opengraph-image`.
- **Error states:** `not-found.tsx`, `error.tsx`, and `loading.tsx` exist. Dynamic slug pages call `notFound()`.
- **Images:** `next/image` remotePatterns allow Cloudinary and Unsplash. `public/` is empty (only `.gitkeep`). `siteConfig.ogImage = '/og-image.png'` points to a file that does not exist, but `buildMetadata` falls back to the generated OG image.
- **Security headers** (in `next.config.mjs`): `nosniff`, `X-Frame-Options`, `Referrer-Policy`. No CSP.
- **XSS:** The blog renderer (`components/blog/ArticleContent.tsx`) is a safe, escaping markdown subset. `dangerouslySetInnerHTML` is used only for `JSON.stringify` JSON-LD. One edge: a CMS string containing `</script>` inside JSON-LD would break out of the script tag. Only admins can write that content, so this is P3.
- **Dependencies:** `framer-motion` is used only for hero animation. That is acceptable but heavy for one effect.

### Design / positioning review (source-level; visual quality NOT browser-verified)
- **Main services are covered.** The seed defines 14 services, each with its own detail page via `/services/[slug]`: web, software, mobile, AI, CRM, ERP, e-commerce, UI/UX, cloud, digital marketing, SEO, social media, Google & Meta ads, and branding.
- **Other content sets:**
  - 10 solutions at `/solutions/[slug]`.
  - 12 industries at `/industries/[slug]`. The earlier audit noted these are templated and near-duplicate.
  - 2 blog posts.
  - Portfolio intentionally has 0 records, so the empty state shows.
- **Content is DB-driven.** If the API is down, list and detail pages show fallbacks or 404s. This build had the DB down: it produced 31 pages instead of the 69 the earlier report recorded, and none of the 0 slug pages were prerendered.
- **Positioning:**
  - The homepage leads with IT-services sections (Hero, BusinessPositioning, WhatWeBuild, CoreServices, Solutions, Portfolio, Process, Why, Technology, Industries).
  - Training appears as one `TrainingCTA` block near the end, plus one of 10 nav items.
  - **Training does not overpower the IT positioning.** ✔
- **Content honesty:**
  - No fabricated clients, testimonials, or statistics were found.
  - Minor: the decorative hero dashboard mock shows "Uptime 99.9%" and "Deployments Live" (`components/hero/Hero.tsx:129`). It is `aria-hidden` illustration, but a reader could take it as a claim. P3.
  - The training page states fees and a "50% OFF / Limited Seats" launch offer. That is business content to confirm, not a code issue.
- **Requires a browser (NOT VERIFIED):** visual hierarchy, spacing, typography rendering, responsive layouts at 320–1440px, the mobile menu, animation performance, Lighthouse/Core Web Vitals, keyboard focus order, and colour contrast.

### Embedded admin (`frontend/app/admin`)
- **Login** (`/admin/login`) calls `POST /auth/login`, which sets the cookie.
- **Dashboard pages:** stats, contacts, training, careers, newsletter, settings, plus generic `CmsManager` CRUD for services, solutions, industries, portfolio, and blog.
- **Guard:** `useAuthGuard` calls `/auth/me` on the client and redirects on failure. There is **no `middleware.ts`**. The static admin HTML and JS bundles are public; data is protected only by the API.
- **No pagination** in the admin tables, and none in the API either.
- **Publishing:** toggles go through `PUT` with `{published}`. The dedicated `PATCH /:id/publish|unpublish` routes are **never called** by the frontend, and `client-api.request` does not support PATCH.

### Portal shells
Each of `training`, `intern`, `employee`, `admin`, and `trainer` has:
- one static page with `robots: noindex`, and
- inline styles plus a 7-variable `globals.css`.

They do **not** have: auth, API client, navigation, or a 404 page (the Next default is used). The `components`, `lib`, `hooks`, `types`, `styles`, and `public` folders are empty.

---

## E. Backend Audit (`backend/`)

**Middleware order** (`src/app.ts`):
`trust proxy 1` → `helmet()` → CORS allowlist from `FRONTEND_URL` (credentials) → JSON and urlencoded body parsing (1 MB limit) → `cookie-parser` → `/health` → `/api` global rate limit (300 per 15 min) → routers → 404 handler → central error handler.

**Layering:**
- Content: route → validate (zod) → controller → service (generic `content.factory.ts`) → Prisma.
- Leads, settings, and auth: the controllers call Prisma directly. There is no repository layer, which is acceptable at this size.

**Strengths:**
- Consistent `{success, message, data | errors}` envelope.
- `asyncHandler` wrapper.
- `ApiError` class.
- Zod errors map to 400; Prisma P2002 to 409; P2025 to 404.
- Production hides internal error messages.
- `requiredStrict` refuses dev fallbacks for `DATABASE_URL` and `JWT_SECRET` in production.
- Graceful shutdown.

**Weaknesses (evidence):**
- **`/health` returns 200 even when the DB is down.** Verified: 200 while every DB endpoint returned 500. A load balancer would keep routing to a broken instance.
- **The server starts even if the DB connection fails** (`server.ts:8-15` logs and continues).
- **CORS rejection returns HTTP 500** ("Not allowed by CORS") instead of 403. Verified.
- **Dev error messages leak Prisma invocation text and absolute file paths** (verified). The local `.env` has `NODE_ENV=development`. If that value were deployed, internals would leak.
- **One shared `strictLimiter`** instance (20 per 15 min per IP) covers login, contact, training, careers, and newsletter together. A visitor who submits a few forms consumes the login budget. The limiter uses in-memory storage, so the count resets on restart and is not shared across instances.
- **Invalid `?status=` filter values** are cast `as never` and passed to Prisma. Prisma throws a validation error, which is not mapped, so the response is 500 instead of 400. Seen in `contact.controller.ts:63`, `training.controller.ts`, and `career.controller.ts`.
- **No pagination** on any list endpoint. All rows are returned.
- **No request logging** (no morgan or pino) and no error monitoring (no Sentry or similar).
- **Prisma client:** `content.factory.ts` uses a loosely typed delegate (`unknown`) and request bodies pass to Prisma as `Record<string, unknown>`. Zod strips unknown keys first, so mass assignment is limited to schema fields.
- **The validate middleware** uses `Object.assign(req.query, parsed)` for query sources. No route currently validates query params.

### Registered API routes (from `src/routes/*.ts`, all verified as mounted in `app.ts`)

The Status column reflects what was **runtime-verified this session**. DB-backed endpoints are BLOCKED because the DB is unreachable.

| Method | Endpoint | Purpose | Authentication | Authorization | Validation | DB | Status |
|---|---|---|---|---|---|---|---|
| GET | `/health` | liveness | none | — | — | none | PASS (200), but does not check DB |
| POST | `/api/auth/login` | login, sets cookie | none | — | zod `loginSchema` + strict limit | users read | Validation 400 PASS; success path NOT RUN (did not use real admin credential) |
| POST | `/api/auth/logout` | clear cookie | none | — | — | none | NOT RUN (trivial; no server-side revocation) |
| GET | `/api/auth/me` | current user | JWT | any role | — | users read | 401 without/with bad token PASS; success BLOCKED |
| GET | `/api/services`, `/:slug` | public content | none | published only | — | read | BLOCKED (500: DB) |
| GET | `/api/solutions`, `/:slug` | public content | none | published only | — | read | BLOCKED |
| GET | `/api/industries`, `/:slug` | public content | none | published only | — | read | BLOCKED |
| GET | `/api/portfolio`, `/:slug` | public content | none | published only | — | read | BLOCKED |
| GET | `/api/blog`, `/:slug` | public content | none | published only | — | read | BLOCKED |
| GET | `/api/settings` | public settings | none | public-safe fields only | — | read | BLOCKED (500) |
| GET | `/api/technologies`, `/api/faqs`, `/api/blog-categories` | reference | none | — | `category` unvalidated | read | BLOCKED |
| POST | `/api/contact` | lead + 2 emails | none | — | zod + strict limit | write | Validation 400 PASS; write NOT RUN (by design) |
| POST | `/api/training/apply` | training lead + 2 emails | none | — | zod + strict limit | write | NOT RUN (write) |
| POST | `/api/careers/apply` | career lead + email | none | — | zod + strict limit | write | NOT RUN (write) |
| POST | `/api/newsletter` | subscribe + email | none | — | zod + strict limit | upsert | NOT RUN (write) |
| GET | `/api/admin/dashboard` | stats | JWT | `role==='ADMIN'` | — | counts | 401 unauth PASS; success BLOCKED |
| GET/GET:id/POST/PUT/PATCH publish/PATCH unpublish/DELETE | `/api/admin/{services,solutions,industries,portfolio,blog}` | CMS CRUD | JWT | ADMIN | zod (PUT uses `.partial()`) | CRUD | BLOCKED; PATCH routes unused by any frontend |
| GET / PUT / DELETE | `/api/admin/{contacts,training,careers}` | lead mgmt | JWT | ADMIN | status enum | read/update/**hard delete** | 401 unauth PASS (`/admin/contacts`); success BLOCKED |
| GET / DELETE | `/api/admin/newsletter` | subscribers | JWT | ADMIN | — | read/delete | BLOCKED |
| GET / PUT | `/api/admin/settings` | site settings | JWT | ADMIN | zod | read/upsert/update | BLOCKED |

**Frontend calls vs backend routes:**
- Every frontend call has a matching backend route.
- Backend routes with **no frontend caller:** `PATCH /admin/*/:id/publish|unpublish` and `GET /admin/:type/:id`.
- **No orphaned or unregistered** route files exist.

**Example traced path:** `POST /api/admin/blog`
1. `admin.routes.ts` runs `router.use(requireAuth, requireAdmin)`.
2. `validate(blogSchema)` checks the body.
3. `blogCtrl.create` (`content.controller.ts`) calls `normalize`, which nulls an empty `categoryId` and sets `publishedAt`.
4. `blogContent.create` (`content.factory.ts`) calls `prisma.blogPost.create`.
5. Errors are mapped by `error.middleware.ts`.

---

## F. Database Audit (Prisma / Supabase)

**Schema** (`prisma/schema.prisma`, 14 models, 6 enums):
- `User`
- Content: Service, Solution, Industry, PortfolioProject, BlogCategory, BlogPost
- Leads: ContactLead, TrainingApplication, CareerApplication, NewsletterSubscriber
- Reference: Technology, FAQ, SiteSetting

**Migrations:** a single migration, `20260921043321_init`, which matches the schema.

**Config:** `url` uses the pooled transaction-mode connection; `directUrl` is used for migrations. This is the correct Supabase pattern.

**Observations:**
- **Relations:** There is only one foreign key, `BlogPost.categoryId → BlogCategory` (`onDelete: SetNull`, which is safe). Industry `relevantServices`, Service `technologies`, and Portfolio `technologies`/`industry` are stored as **JSON or strings, not relations**, so referential integrity is not enforced.
- **Redundant indexes:** every `slug` has both a `@unique` constraint and a separate `@@index([slug])`. The unique constraint already creates an index. Seen in the migration (lines 296–347).
- **Missing index:** `SiteSetting` is a singleton with no constraint enforcing a single row. `getOrCreateSettings` has a race window that could create two rows (low risk).
- **Deletion:** all lead and content deletes are **hard deletes**. There is no soft delete and no audit trail.
- **Audit fields:** `createdAt`/`updatedAt` exist on most models. There is no `createdBy`/`updatedBy`. `NewsletterSubscriber`, `Technology`, `FAQ`, and `BlogCategory` have no `updatedAt`.
- **PII in leads:** names, emails, phones, age, college, and city are stored in plain text, with no retention policy.
- **Roles:** `enum Role { ADMIN EDITOR }`. `EDITOR` exists but is **unusable**, because `requireAdmin` only allows `ADMIN`. None of the documented roles exist in the DB: SUPER_ADMIN, HR, FINANCE, TRAINER, COUNSELLOR, EMPLOYEE, INTERN.
- **Planned models are absent:** training, admission, attendance, assignment, employee/HR, payment, and certificate models do not exist in the schema. They exist only in `docs/SCHEMA_EXTENSIONS_PROPOSAL.md`.
- **Transactions:** none are used, and none are currently needed.
- **The seed** upserts the admin from `SEED_ADMIN_*` and **overwrites the admin password hash on every run** (`update: { name, passwordHash }`). Re-running the seed silently resets the admin password to the env value. Its fallback password is `ChangeMe123!` if the env var is missing.
- **RLS:**
  - The migration contains **no `ENABLE ROW LEVEL SECURITY` and no policies**, and the repo has no other RLS definitions.
  - Prisma connects as a privileged role and does not need RLS.
  - However, Supabase exposes the `public` schema through its Data API (PostgREST) to the `anon` key by default. If the Data API is enabled, the `users` table (password hashes) and every lead table could be readable and writable with the anon key, which is public by design.
  - **Status: NOT VERIFIED.** Dashboard access is required. **Recommend enabling RLS with no policies** on all tables (Prisma bypasses RLS as the table owner) or disabling the Data API.
- **Connectivity: FAIL.** The pooler returned `FATAL: (ENOTFOUND) tenant/user … not found`. The project is likely paused, deleted, or its credentials have changed. `prisma migrate status` could not be checked (BLOCKED).

---

## G. Authentication and Authorization

| Aspect | Implementation | Assessment |
|---|---|---|
| Login | `auth.service.authenticate`: lookup by lowercased email + bcrypt compare (12 rounds) | OK. Minor timing-based user enumeration (bcrypt only runs when the user exists). |
| JWT creation | HS256 via `jsonwebtoken`; payload `{sub,email,role}`; `expiresIn = JWT_EXPIRES_IN` (default 7d) | OK. No `iss`/`aud`. The algorithm is not pinned on verify (the library default rejects `none`). |
| JWT verification | `requireAuth` takes the cookie `globalantic_token`, or else a `Bearer` header | Verified: missing → 401, malformed → 401. |
| **Token in response body** | `auth.controller.ts:25` returns `{ user, token }` | ⚠ This defeats the purpose of httpOnly. Any XSS or logging of responses exposes the token. Remove it. |
| Cookie | `httpOnly`, `secure` (prod), `sameSite: none` (prod) / `lax` (dev), `maxAge` **hardcoded 7d** | ⚠ `maxAge` ignores `JWT_EXPIRES_IN`. `SameSite=None` is unnecessary because `*.globalantic.com` is same-site; `Lax` is safer. **No `Domain`**, so there is no cross-subdomain SSO, despite `DEPLOYMENT.md` claiming `COOKIE_DOMAIN`. `COOKIE_DOMAIN` is referenced nowhere in `backend/src`. |
| Logout | Clears the cookie only | ⚠ The JWT stays valid until expiry. There is no denylist or token version. |
| Role trust | `requireAdmin` reads `req.user.role` **from the JWT** | ⚠ A demoted or deleted user keeps admin access for up to 7 days. Only `/auth/me` re-reads the DB. |
| CSRF | No token. Mitigated by the CORS callback rejecting foreign `Origin` before handlers run (verified), and by JSON bodies. | Moderate. `express.urlencoded` is enabled and requests **without** an `Origin` header are allowed. Switch to `SameSite=Lax` and drop urlencoded on admin routes. |
| Registration / activation / password reset / refresh tokens | **MISSING** | — |
| Password policy | Login only requires `min(1)`. The seed admin password in env is short (9 characters). | ⚠ Weak. There is no change-password flow. |
| Brute force | Shared strict limiter, 20 per 15 min per IP, in-memory | Partial. No per-account lockout. |
| Frontend protection | Client `useAuthGuard` only; no `middleware.ts` | ⚠ Admin UI shells are publicly downloadable. Data stays protected by the API. |
| RBAC / permissions | Single check: `role === 'ADMIN'` | Only coarse admin vs. not-admin. `packages/auth` defines a 9-role portal map that **nothing uses** and that does not match the DB enum. |
| Ownership / IDOR | No user-owned resources exist yet | **Not applicable today.** The questions "can an intern see another intern's records" and "can a trainer see unassigned batches" cannot arise, because those models and endpoints do not exist. Every admin can see and delete everything. |
| Privilege escalation | No user-management endpoints exist | No vector today. Users can only be created by the seed or by direct DB access. |
| Hardcoded credentials | The seed fallback `ChangeMe123!`, and the dev JWT fallback (refused in production) | P2. The real credential problem is in `.env.example` (J-1). |

---

## H. Feature Completion Matrix

### Main website and CMS (exists)
| Feature | Status | Evidence |
|---|---|---|
| Public marketing pages (home, about, services, solutions, industries, portfolio, blog, careers, training info, contact, 3 legal) | PARTIAL | Builds and renders. Content requires the DB, which is currently unreachable. Not browser-verified. |
| Contact lead capture + emails | PARTIAL | Code complete. Write path not run this session. Resend test sender only. |
| Training application (single form on the main site) | PARTIAL | Stores `TrainingApplication`. No admission workflow. |
| Career application | PARTIAL | Résumé URL only. No upload. |
| Newsletter | PARTIAL | Subscribe works in code. **No unsubscribe endpoint or link**, although the email says "unsubscribe at any time". |
| Admin CMS (services, solutions, industries, portfolio, blog) CRUD | PARTIAL | Code complete. BLOCKED at runtime by the DB. No pagination. |
| Admin leads (contacts, training, careers) status + delete | PARTIAL | Same as above. Hard delete only. |
| Admin settings | PARTIAL | Same as above. |
| Admin dashboard stats | PARTIAL | Same as above. |

### Training and intern platform
Programs/curriculum are **PLACEHOLDER**: static content on `frontend/(marketing)/training`, and the `training/` app is a shell. The single application form is **PARTIAL** (see above). Every other feature is **MISSING**: no models, endpoints, or UI exist.

- Admission management
- Enrollment
- Course access
- Modules/lessons
- Batches
- Timetable
- Attendance
- Assignments
- Submissions
- Tests
- Results
- Fees
- Payments
- Invoices
- Refunds
- Certificates
- Announcements
- Notifications
- Student profile
- Support

### Employee portal
Every feature is **MISSING**. The `employee/` app is a single placeholder page.

- Profile
- Attendance
- Leave
- Tasks
- Projects
- Documents
- Payslips
- Performance
- Announcements
- Support

### Trainer portal
Every feature is **MISSING**.

- Batches
- Students
- Schedules
- Attendance
- Assignments
- Submissions
- Tests
- Results
- Announcements

### Admin portal (`admin/` app)
**PLACEHOLDER.**
- The only admin functions that exist are the CMS, leads, settings, and dashboard listed above, and they live in `frontend/app/admin`.
- Users, roles/permissions, interns, employees, trainers, courses, batches, attendance, assessments, payments, certificates, HR/leave, tasks/projects, support, reports, and audit logs are all **MISSING**.

---

## I. Third-Party Integrations

| Integration | Status | Evidence / Notes |
|---|---|---|
| **Supabase Postgres** | **FAIL (connection)** | Pooler rejects the current credentials. RLS not configured (see F). |
| **Resend** | PARTIAL; live sending NOT RUN (by instruction) | Server-side only (`email.service.ts`). Missing key → logs and skips. Send errors are caught so leads still persist. |
| **Razorpay** | **MISSING** | No dependency, no env usage in `env.ts`, no routes. It is only listed in `turbo.json globalEnv` and the docs. |
| **Cloudinary** | **MISSING** (env only) | `env.ts` reads `CLOUDINARY_*` but nothing uses it. No SDK, no upload route, no signature generation. `next.config` only allows rendering `res.cloudinary.com` images. |
| Google Fonts | OK | `next/font` (Plus Jakarta Sans), self-hosted at build time. |

**Resend details:**
- **Sender:** `RESEND_FROM_EMAIL` is still a placeholder-style value (most likely the `onboarding@resend.dev` test sender). The test sender only delivers to the Resend account owner.
- **Templates:** contact (admin + acknowledgement), training (admin + acknowledgement), career (admin only), newsletter confirmation.
- **Missing templates:** password reset, admission, payment, certificate.
- **⚠ HTML injection:** user input is interpolated unescaped (`row()` and `${lead.message}`; `email.service.ts:55, 80, 91, 132`). Acknowledgement emails go to any visitor-supplied address, with the visitor-supplied name inside the HTML. This allows spam or phishing that appears to come from Globalantic's sender domain, limited only by the shared 20-per-15-minute IP limit.
- **No duplicate prevention:** a resubmitted form creates a new lead and sends new emails each time.

---

## J. Security Findings (prioritised; no secret values reproduced)

| ID | Pri | Finding | File | Recommendation |
|---|---|---|---|---|
| J-1 | **P0** | `.env.example` holds the **same values as `.env`** for `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `ADMIN_EMAIL`. `JWT_SECRET` differs, but the example still holds a real-looking 33-character value. `.gitignore` explicitly un-ignores `.env.example`, so it would be the first thing committed. The folder is also OneDrive-synced. | `backend/.env.example` | **Rotate** the Supabase DB password, Resend key, Cloudinary secret, and admin password. Replace every value with placeholders. |
| J-2 | P1 | Supabase tables have no RLS. The Data API may expose `users.passwordHash` and lead PII through the anon key. | `prisma/migrations/*/migration.sql` | Verify in the dashboard. Enable RLS (deny-all) on all tables, or disable the Data API for `public`. |
| J-3 | P1 | `next` has a critical advisory (Image Optimizer DoS with remotePatterns, RSC deserialization DoS, rewrite request smuggling). Also high: postcss, glob, braces/micromatch, typescript-eslint, eslint-config-next. | root `package-lock.json` | Plan a deliberate upgrade to a patched Next line and test. Do not blindly run `audit fix --force`. |
| J-4 | P1 | Unescaped user input in email HTML; acknowledgement mail sent to arbitrary addresses. | `backend/src/services/email.service.ts` | HTML-escape every interpolated value. Consider dropping the acknowledgement or rate-limiting it per email address. |
| J-5 | P1 | Admin pages have no server-side gate. | `frontend/app/admin/*`, no `middleware.ts` | Add middleware that checks the cookie. This requires a cookie readable on the frontend domain, so it also depends on the cookie Domain/SameSite fix. |
| J-6 | P2 | JWT returned in the login JSON body. | `backend/src/controllers/auth.controller.ts:25` | Return only `user`. |
| J-7 | P2 | No server-side session revocation; role trusted from the JWT for 7 days. | `auth.middleware.ts` | Re-load the user (role/status) in `requireAuth`, or add a `tokenVersion` field. |
| J-8 | P2 | Cookie `SameSite=None` in prod, no Domain, `maxAge` decoupled from the JWT expiry. | `auth.controller.ts:9-17` | Use `SameSite=Lax`, `Domain` from `COOKIE_DOMAIN`, and derive `maxAge` from `JWT_EXPIRES_IN`. |
| J-9 | P2 | Weak password handling: login `min(1)`, short seed password, seed resets the admin hash, fallback `ChangeMe123!`. | `validators/index.ts`, `prisma/seed.ts` | Enforce a strong admin password. Make the seed `update` skip `passwordHash`. Remove the fallback. |
| J-10 | P2 | No audit logging of admin create, update, or delete; hard deletes of PII leads. | controllers | Add a minimal `AuditLog` model and write to it from admin mutations. |
| J-11 | P2 | Dev error output leaks file paths and Prisma internals. The local `.env` sets `NODE_ENV=development`. | `error.middleware.ts` | Make sure `NODE_ENV=production` on the host. Even in dev, avoid returning Prisma messages to the client. |
| J-12 | P2 | The in-memory rate limiter is shared across all lead and auth endpoints. | `rateLimit.middleware.ts` | Use separate limiters for login and forms. A per-instance memory store is acceptable for a single instance. |
| J-13 | P3 | CORS rejection returns 500; `!origin` is allowed. | `app.ts:19-29` | Return 403 for rejected origins. |
| J-14 | P3 | Login enumeration via timing. | `auth.service.ts` | Run a dummy bcrypt compare when the user is not found. |
| J-15 | P3 | Frontend has no CSP; JSON-LD can break out on a `</script>` string. | `next.config.mjs`, JSON-LD scripts | Escape `<` in JSON-LD. Add a CSP later. |
| J-16 | P3 | `docs/FINAL_IMPLEMENTATION_REPORT.md` contains a personal email address. | docs | Remove PII from docs. |

**Checked and found OK:**
- SQL injection: no raw SQL; Prisma only.
- XSS in the blog renderer: safe.
- Frontend secret exposure: the frontend reads only `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PHONE`, and `NEXT_PUBLIC_WHATSAPP`.
- `backend/.env` is gitignored.
- Body size is limited.
- Helmet headers are present: CSP, HSTS, nosniff, and frameguard (verified).

**Could not be checked:** "secrets committed to Git". **There is no Git repository**, so no history exists to inspect.

---

## K. Build and Test Results (executed this session)

| Check | Command | Result |
|---|---|---|
| Typecheck backend | `npm --workspace backend run typecheck` | **PASS** (exit 0) |
| Typecheck frontend, training, intern, employee, admin, trainer | `npm --workspace <app> run typecheck` | **PASS** ×6 |
| Typecheck packages ×6 | `npx tsc --noEmit` in each `packages/*` | **PASS** ×6 |
| Lint backend | `npm --workspace backend run lint` | **PASS** (exit 0, no output) |
| Lint all 6 Next apps | `npm --workspace <app> run lint` | **PASS** ("No ESLint warnings or errors") ×6 |
| Build backend | `tsc -p tsconfig.json --outDir <scratch>` | **PASS**. Output is identical to the existing `backend/dist`. |
| Build frontend | `next build` (scratch copy, junctioned node_modules) | **PASS**. 31 static pages. 0 slug pages prerendered because the API/DB was down. The build does not fail on missing content, by design. |
| Build training, intern, employee, admin, trainer | `next build` | **PASS** ×5 (4 pages each: `/`, `/_not-found`) |
| API boot | `tsx src/server.ts` | Server **listens**. **DB connect FAIL** (pooler: tenant/user not found). |
| `/health` | GET | 200, but **does not reflect DB state** |
| Public content GETs | GET `/api/services`, `/api/services/web-development`, `/api/settings` | **FAIL / BLOCKED**: 500 caused by the DB |
| Unknown route | GET `/api/nope` | PASS (404 envelope) |
| Auth guard | GET `/api/auth/me`, GET `/api/admin/dashboard` with no token; bad bearer token; bad cookie | **PASS** (401 ×4) |
| CORS | GET with `Origin: https://evil.example` | Rejected (**500**, should be 403) |
| Validation | POST `/api/contact` invalid body; POST `/api/auth/login` invalid body | **PASS** (400 with field errors; no DB write) |
| Login success, admin CRUD, lead writes, emails | — | **NOT RUN / BLOCKED**: DB down, and writes and email sends were avoided per audit rules |
| Unit / integration tests | — | **NOT RUN: none exist** (no test files, framework, or scripts) |
| Dependency audit | `npm audit --json` (root) | **FAIL**: 1 critical (next), 14 high |
| Prisma migrate status | — | **BLOCKED** (DB unreachable) |
| Browser / responsive / Lighthouse / a11y | — | **NOT RUN** (no browser session used) |

---

## L. Deployment Readiness

| Item | In code/config | Verified live |
|---|---|---|
| Subdomain mapping (globalantic.com, training., intern., employee., admin., trainer., api.) | Only in `docs/DEPLOYMENT.md` and `packages/config` (unused) | **NOT VERIFIED.** No DNS or deployment checks were performed. |
| Vercel config | **None** (no `vercel.json`) | — |
| Render/Railway config | **None** (no `render.yaml` or Dockerfile) | — |
| Build/start commands | `backend`: `tsc` → `node dist/server.js`; Next: `next build/start` | Builds verified locally |
| CORS origins | `FRONTEND_URL` comma list; the local value covers one origin | Must list every portal origin in production |
| Cookies | Secure + SameSite=None in prod; no Domain | Cross-subdomain SSO **not possible** as coded |
| API base URL | `NEXT_PUBLIC_API_URL` (fallback localhost) | — |
| DB pooling | Pooled + direct URLs correctly separated | DB currently unreachable |
| Health check | `/health` exists but is not DB-aware | — |
| Logging / monitoring | console only; no request logs, no error tracker | — |
| Backups / recovery docs | **None** in repo | — |
| Migrations on deploy | Documented (`prisma:deploy`) | — |
| Version control / CI | **None** | — |

**Readiness verdict:**
- The **marketing site and API are close to deployable** once the DB is restored, secrets are rotated, and Next is upgraded.
- Nothing else is deployable: the other five portals are placeholders.

---

## M. Documentation Discrepancies

| Document | Claim | Reality |
|---|---|---|
| `README.md` | Six portals at subdomains backed by one API; `packages/` are shared code | Five portals are placeholder shells. Packages are unused placeholders. |
| `README.md` / `SECURITY.md` | Razorpay, Cloudinary in the stack; `RAZORPAY_*` env | No Razorpay code. Cloudinary is env-only. `RAZORPAY_*` is not in `.env.example` or `env.ts`. |
| `SECURITY.md` | "Every protected resource checks auth + role + ownership"; roles SUPER_ADMIN…INTERN | Only `role==='ADMIN'` is checked. The DB enum has only ADMIN and EDITOR (EDITOR is unusable). No ownership checks, because no owned resources exist. |
| `SECURITY.md` | "JWT in an httpOnly cookie … no token in localStorage" | True, but the token is **also returned in the login response body**. |
| `DEPLOYMENT.md` | Auth cookie `Domain=.globalantic.com`, `SameSite=Lax`, `COOKIE_DOMAIN` env | The code sets no Domain, uses `SameSite=None` in prod, and never reads `COOKIE_DOMAIN`. |
| `FINAL_IMPLEMENTATION_REPORT.md` (Sep 21) | Database PASS, 14 tables live, public APIs PASS | **Outdated.** The DB connection now fails, and every DB endpoint returns 500. |
| `UI_COMPLETION_REPORT.md` / `FINAL…` | 69 static pages, 47 content routes prerendered | Today's build: 31 pages, 0 content routes, because the API was unreachable at build time. |
| `FULL_WEBSITE_AUDIT.md` (Sep 26) / `SECURITY.md` / `DEPLOYMENT.md` | CRITICAL: rotate and sanitise `.env.example` | **Still not done.** Values are still identical to `.env`. |
| `SECURITY.md` | "Known advisories in `next@14.2.18`" | The installed version is 14.2.35, which **still** has a critical advisory per `npm audit`. |
| `API_DOCUMENTATION.md` | `PATCH :id/publish|unpublish` | Exists in the backend but is unused by the frontend (it uses PUT). |
| Newsletter email copy | "You can unsubscribe at any time" | No unsubscribe mechanism exists. |
| `FOLDER_STRUCTURE.md` | Admin at `admin/` | The functioning admin lives at `frontend/app/admin`. `admin/` is a shell. |
| `ROLE_PERMISSION_MATRIX.md`, `SCHEMA_EXTENSIONS_PROPOSAL.md`, `ONLINE_WORKFLOW.md`, `PLATFORM_ARCHITECTURE.md` | — | Correctly labelled as **proposals**. Nothing in them is implemented. |
| Tests | Several reports cite "live tested" API flows | Those were manual HTTP checks in earlier sessions. **There are no automated tests** to reproduce them. |

---

## N. Prioritised Issues

| ID | Pri | App/Module | Location | Evidence | Impact | Recommended solution | Blockers | Verification |
|---|---|---|---|---|---|---|---|---|
| GA-001 | P0 | backend/config | `backend/.env.example` (all DB, Resend, Cloudinary, seed keys) | Hash comparison: same values as `.env` | Credential compromise if shared, synced, or committed | Rotate every credential. Replace with placeholders. | Supabase, Resend, and Cloudinary dashboard access | Hash compare shows `.env.example` ≠ `.env`; values are clearly placeholders |
| GA-002 | P0 | Database | Supabase project / `DATABASE_URL` | Runtime: pooler "tenant/user not found"; all DB endpoints 500 | Site content and admin completely down | Check the Supabase project (paused, deleted, or renamed). Restore it or update `backend/.env` (outside this audit). | Supabase access | `/api/services` returns 200 with data |
| GA-003 | P1 | Supabase | migration SQL | No RLS statements | Possible public read/write of `users` and leads through the anon key | Enable RLS on all `public` tables, or disable the Data API | Dashboard | Supabase security advisor is clean; anon REST call is denied |
| GA-004 | P1 | Dependencies | root `package-lock.json` | `npm audit`: 1 critical, 14 high | DoS and smuggling exposure for self-hosted Next | Upgrade Next and eslint-config-next to a patched line; retest builds | Regression testing | `npm audit` shows no critical/high |
| GA-005 | P1 | backend/email | `email.service.ts` `row()`, message interpolation | Unescaped interpolation | HTML injection; phishing relay via acknowledgement emails | Add an `escapeHtml` helper. Limit acknowledgements per email address. | — | Unit test with `<a>` input renders as escaped text |
| GA-006 | P1 | frontend/admin | `frontend/app/admin/*`; no `middleware.ts` | Client-only guard | Admin UI enumerable; weak defense in depth | Add Next middleware checking the session cookie. Requires GA-009. | GA-009 | Unauthenticated GET `/admin/dashboard` → redirect from the server |
| GA-007 | P2 | backend/auth | `auth.controller.ts:25` | Token in JSON | Token exposure | Remove `token` from the response | Frontend does not use it (verified) | Login response contains no token |
| GA-008 | P2 | backend/auth | `auth.middleware.ts requireAdmin` | Role read from JWT | Revoked admins retain access up to 7 days | Re-read the user in `requireAuth`, or add `tokenVersion` | — | Changing the role in the DB → next request 403 |
| GA-009 | P2 | backend/auth | `auth.controller.ts cookieOptions` | SameSite=None, no Domain, fixed maxAge | CSRF surface; no SSO across subdomains | `SameSite=Lax`, `domain: env.cookieDomain`, maxAge from JWT expiry | Decide the domain strategy | Cookie inspection in a browser |
| GA-010 | P2 | prisma/seed | `seed.ts seedAdmin` | `update: { passwordHash }`; fallback password | Silent admin password reset; weak default | Don't update the hash on existing users. Require the env var. | — | Re-run in a staging DB; hash unchanged |
| GA-011 | P2 | backend | `app.ts /health`, `server.ts` | 200 while DB is down | Broken instance looks healthy | Add `/health/ready` running `SELECT 1`; exit if the DB is unreachable at boot (or retry) | — | Readiness endpoint 503 when DB is down |
| GA-012 | P2 | backend | all list controllers | No pagination | Slow responses and large payloads as leads grow | Add `?page&limit` with caps | Frontend table update | Response includes `meta.total` |
| GA-013 | P2 | backend | `*.controller.ts` status filters | Invalid enum → 500 | Wrong status codes | Validate query with zod | — | `?status=FOO` → 400 |
| GA-014 | P2 | repo | root | Not a git repo; OneDrive sync | No history or rollback; secret sync risk | `git init` after GA-001, with a private remote | GA-001 first | `git status` clean; `.env` untracked |
| GA-015 | P2 | repo | `frontend/` and `backend/` nested `package-lock.json` / `node_modules` | Two dependency trees | Version drift and confusion | Delete the nested lockfiles and node_modules; reinstall from root | Planned maintenance window | `npm ls` shows a single tree |
| GA-016 | P2 | testing | — | No tests | Regressions undetected | Add Vitest + Supertest for auth, validators, admin guard, email escaping | — | `npm test` in CI |
| GA-017 | P2 | deployment | — | No deploy config, CI, monitoring, or backups doc | Manual, unrepeatable deploys | Add minimal `render.yaml` / Vercel project settings, Sentry (optional), and a backup note | Hosting accounts | Staging deploy succeeds |
| GA-018 | P2 | admin/audit | controllers | No audit log; hard deletes | No accountability for PII deletion | `AuditLog` model; soft delete for leads | Migration (later phase) | Mutation creates an audit row |
| GA-019 | P2 | structure | `admin/` vs `frontend/app/admin` | Duplicate intent | Confusion about where admin lives | Decide: move the CMS into `admin/` when portals start, or delete the shell | Product decision | One admin location |
| GA-020 | P2 | packages | `packages/*` | Imported by nothing; role list ≠ DB enum | Dead code; misleading types | Remove until needed, or align with the Prisma `Role` enum | — | Grep shows real imports, or the packages are removed |
| GA-021 | P2 | backend | `rateLimit.middleware.ts` | One shared strict limiter | Form usage blocks login and vice versa | Separate limiters | — | Hitting contact 20× does not block login |
| GA-022 | P2 | newsletter | backend + email copy | No unsubscribe | Compliance (anti-spam) risk | Unsubscribe token endpoint + link | — | Clicking the link sets UNSUBSCRIBED |
| GA-023 | P3 | backend | `app.ts` CORS | 500 on rejected origin | Noisy errors | Return 403 | — | Test returns 403 |
| GA-024 | P3 | frontend | `TrainingForm.tsx:31` vs `validators/index.ts` | Age min 10 vs 15 | Confusing server error | Align at 15 | — | Form blocks age 14 |
| GA-025 | P3 | frontend | `Hero.tsx:129` | "Uptime 99.9%" mock | Could read as a claim | Use neutral labels | — | Visual review |
| GA-026 | P3 | prisma | schema `@@index([slug])` | Redundant with `@unique` | Wasted write I/O | Drop the redundant indexes in a future migration | Migration window | Migration diff |
| GA-027 | P3 | frontend | `lib/config.ts ogImage` | `/og-image.png` missing | Possible broken OG reference | Remove it or add the asset | — | OG debugger |
| GA-028 | P3 | docs | `FINAL_IMPLEMENTATION_REPORT.md` | Personal email in docs | PII exposure | Redact | — | grep |
| GA-029 | P3 | backend | `client-api.ts` / admin routes | PATCH publish routes unused | Dead code | Remove the routes or use them | — | — |

---

## O. Recommended Implementation Roadmap (reordered from findings)

1. **Critical security and stability.**
   - GA-001: rotate and sanitise secrets.
   - GA-002: restore DB connectivity.
   - GA-003: RLS / Data API.
   - GA-014: put the repo under git, only *after* sanitising.
2. **Dependency and API correctness.**
   - GA-004: Next upgrade.
   - GA-005: email escaping.
   - GA-011: health readiness.
   - GA-013: query validation.
   - GA-021: limiters.
   - GA-023: CORS 403.
   - GA-015: single dependency tree.
3. **Auth hardening.**
   - GA-007, GA-008, GA-009, GA-010.
   - GA-006: server-side admin gate.
   - Password change and reset, per-account lockout.
4. **Testing baseline.** GA-016, covering the auth, validator, and admin-guard tests that protect steps 1–3.
5. **Finish the public website.**
   - Browser responsive and accessibility pass.
   - Real OG asset.
   - Unsubscribe (GA-022).
   - Admin pagination (GA-012).
   - Industry content de-duplication.
6. **Decide the admin location (GA-019) and add an audit log (GA-018)** *before* building new portals.
7. **Training and admission system.** Schema extensions (User roles, Program/Batch/Enrollment, Admission states) per `SCHEMA_EXTENSIONS_PROPOSAL.md`, kept minimal.
8. **Payments and email notifications.** Razorpay server-side orders, signature-verified webhook with idempotency, and admission/payment emails. Domain-verified Resend sender.
9. **Intern portal**, then **trainer portal**, then **employee portal**, each with ownership checks and IDOR tests from day one.
10. **Deployment and production readiness.** GA-017: deploy config, CORS for all origins, monitoring, backups, staging.

The roadmap has not been started.

---

## P. Final Readiness Assessment

**How these were estimated (rough audit estimates, not measured metrics):** for each area, I listed the capabilities the brief and docs expect and scored each one. Implemented and runtime-verified = 1. Implemented but unverified or partly flawed = 0.5. Missing = 0. Production-blocking issues then pull the score down.

| Area | Estimate | Basis |
|---|---|---|
| Frontend (main site) | **70%** | All pages exist; build, lint, and typecheck pass; SEO is solid. Minus: no browser verification, content depends on the down DB, client-only admin guard. |
| Frontend (other 5 apps) | **3%** | Shells only. |
| Backend | **55%** | Clean structure, validation, and errors for the current scope. Minus: DB down, no pagination, health check, logging, or tests. Planned modules are absent. |
| Database | **25%** | 14 sound models for the marketing scope. Minus: unreachable, no RLS, none of the platform models exist. |
| Authentication | **45%** | bcrypt + JWT + httpOnly work (negative paths verified). Minus: token in body, no revocation, no reset, weak cookie and domain setup. |
| Authorization | **15%** | A single ADMIN check. No RBAC, permissions, or ownership. |
| Training platform | **5%** | Static info page + application form only. |
| Intern platform | **0%** | — |
| Employee platform | **0%** | — |
| Trainer platform | **0%** | — |
| Admin platform | **30%** | CMS, leads, and settings exist (in `frontend`). Every platform-management module is missing. |
| Security | **35%** | Good baseline (helmet, CORS, zod, Prisma, rate limiting). Minus: real secrets in the example file, critical Next advisory, no RLS, email injection. |
| Testing | **5%** | Static checks pass; zero automated tests. |
| Deployment readiness | **15%** | Builds pass. No configs, CI, monitoring, VCS, or backups. DB down. |
| **Overall production readiness** | **~20%** | Weighted towards the stated goal of a six-portal ecosystem. The **marketing site alone** is roughly 60% of the way to production once GA-001–GA-005 are fixed. |

---

## Q. Immediate Next Actions

1. **Rotate** the Supabase DB password, Resend API key, Cloudinary secret, and admin password. Then replace every value in `backend/.env.example` with placeholders (GA-001).
2. **Restore database connectivity:** check whether the Supabase project is paused or deleted, and update `backend/.env`. Then re-verify `/api/services` and admin login (GA-002).
3. **Lock down Supabase:** enable RLS (deny-all) on every `public` table, or disable the Data API, and check the Security Advisor (GA-003).
4. **Initialise git with a private remote** once secrets are clean, so all further work has history and rollback (GA-014).
5. **Upgrade Next.js to a patched release and escape email HTML.** Then re-run lint, typecheck, build, and `npm audit` (GA-004, GA-005).

---
*End of report. No source files were modified during this audit. Awaiting further instructions.*
