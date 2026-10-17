# GLOBALANTIC FULL WEBSITE AUDIT

**Audit date:** 2026-09-26
**Auditor role:** Full-Stack Code Auditor / Architect / Security / SEO / Performance / QA
**Scope:** Complete monorepo (`frontend/` Next.js 14 + `backend/` Express + Prisma + Supabase)
**Mode:** Read-only. No project files were modified, renamed, or deleted. No schema/env/API/UI changes were made. The only file created is this report.

**Verification performed (not assumed):**
- `backend`: `npm run build` (tsc) → **exit 0**; `npm run lint` (eslint) → **exit 0**.
- `frontend`: `npm run typecheck` (tsc --noEmit) → **exit 0**; `npm run build` (next build) → **exit 0**, 69/69 pages generated.
- **Live end-to-end test**: started the backend against the real Supabase database and exercised every public GET endpoint, the auth flow (login/me/logout), admin authorization, 404s, and validation rejection with `curl`. The backend was stopped afterward. No database records were created (only invalid submissions that return 400 were sent; no valid leads/applications were inserted).

Status legend: **VERIFIED** / **NOT VERIFIED** / **MISSING** / **BROKEN** / **PENDING EXTERNAL CONFIGURATION**

---

## 1. Executive Summary

Globalantic is a **well-architected, cleanly implemented** full-stack marketing website. The backend is a textbook layered Express/Prisma/TypeScript API with a factory pattern for content CRUD, centralized error handling, Zod validation on every write, rate limiting, Helmet, and a secure JWT + httpOnly-cookie auth model. The frontend is a Next.js 14 App Router application using server components with an API-with-static-fallback strategy, strong SEO metadata, and accessible, validated forms. Both projects **build, typecheck, and lint with zero errors**, and the full stack was verified working live against Supabase.

The codebase is **not** padded with placeholders, lorem ipsum, fake testimonials, fake statistics, or prohibited training claims — content is deliberately neutral and honest, consistent with the project's stated intent. There is no dead/demo scaffolding of significance.

The issues that matter are concentrated in a small number of areas:

1. **CRITICAL — live secrets are stored in `backend/.env.example`** (a file `.gitignore` force-includes). Real-looking Supabase DB password, Resend API key, Cloudinary secret, and a seed admin password are present in plaintext. These must be rotated and replaced with placeholders before any repository is shared.
2. **HIGH — admin routes have no server-side protection** (client-only guard). The data is safe (the backend enforces auth on `/api/admin/*`), but admin HTML/shell is reachable client-side until a redirect fires.
3. **HIGH — email is not production-deliverable yet** (Resend uses the shared `onboarding@resend.dev` test sender; domain not verified). This is *pending external configuration*, not broken code.
4. **MEDIUM — content gaps**: portfolio has 0 seeded projects; industries content is partly templated (identical technologies/FAQ patterns); only 2 blog posts across 10 categories.

**Overall readiness:** Ready for **development** now. Ready for **staging/production** after secret rotation, Resend domain verification, and (recommended) server-side admin protection.

| Area | Rating |
|---|---|
| Architecture / separation of concerns | GOOD |
| Backend API & error handling | GOOD |
| Database / Prisma schema | GOOD |
| Authentication / JWT | GOOD (server-side); NEEDS IMPROVEMENT (frontend route protection) |
| Validation | GOOD |
| Frontend pages & components | GOOD |
| Admin dashboard | GOOD (wiring); NEEDS IMPROVEMENT (pagination/search, error states) |
| Email / Resend | PENDING EXTERNAL CONFIGURATION |
| Security | PROBLEM (secrets in `.env.example`); otherwise GOOD |
| SEO | GOOD |
| Design system / CSS | GOOD |
| Content completeness | NEEDS IMPROVEMENT (portfolio empty, industries templated) |
| Build / Typecheck / Lint | GOOD (all pass) |

---

## 2. Project Architecture

The intended architecture — **Frontend → API → Backend → Prisma → Supabase** — is **correctly and cleanly implemented (VERIFIED)**.

- **Frontend** (`frontend/`) never touches the database directly. Server components read via `frontend/lib/api.ts` (`getJson<T>`), client forms/admin write via `frontend/lib/client-api.ts` (`request()`), both hitting `NEXT_PUBLIC_API_URL`.
- **API layer** (`backend/src/routes/*`) cleanly separates `auth.routes`, `public.routes`, `admin.routes`, each mounted in `app.ts` behind Helmet + CORS + rate limiting.
- **Controllers → Services → Prisma**: content CRUD is factored into `services/content.factory.ts` (one generic factory) + `controllers/content.controller.ts`, instantiated per entity in `*.instances.ts`. Lead capture, auth, settings, and public reference data have dedicated controllers.
- **Prisma** (`config/database.ts`) uses a singleton client with dev hot-reload guard and env-driven log levels.
- **Supabase** connection via pooled `DATABASE_URL` (pgbouncer, transaction mode) + `DIRECT_URL` (session mode) for migrations — the correct Supabase + Prisma pattern.

| Concern | Rating | Note |
|---|---|---|
| Separation of concerns | GOOD | Routes/controllers/services/utils cleanly split |
| Frontend/backend boundary | GOOD | No DB access from frontend; typed API envelope |
| API organization | GOOD | Public/auth/admin split; RESTful |
| Database layer | GOOD | Singleton Prisma, factory service |
| Authentication layer | GOOD | Middleware `requireAuth`/`requireAdmin` |
| Validation | GOOD | Zod on every mutation route |
| Error handling | GOOD | Centralized `errorHandler`, Prisma error mapping |
| Reusable components | GOOD | UI kit + factory patterns |
| Code duplication | GOOD | Minimal; factories remove CRUD repetition |
| Unnecessary complexity | GOOD | Appropriately simple |
| Maintainability | GOOD | Consistent, documented, typed |

---

## 3. Technology Stack

**Frontend:** Next.js `^14.2.18` (App Router), React `^18.3.1`, TypeScript `^5.7.2`, `react-hook-form` + `@hookform/resolvers` + `zod`, `framer-motion`, `lucide-react`. CSS Modules + a token-based `globals.css`.
**Backend:** Node + Express `^4.21.2`, TypeScript, Prisma `^5.22.0` (`@prisma/client`), `zod`, `jsonwebtoken`, `bcryptjs`, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `resend`, `dotenv`.
**Database:** Supabase PostgreSQL (pooled + direct URLs).
**Deployment targets:** Frontend → Vercel; Backend → Render/Railway; DB → Supabase.

All dependencies are current major versions; nothing abandoned or obviously vulnerable. Node engine pinned `>=18.18.0` (root) — CI/host should use Node 18/20/22 (build verified on Node 24 locally).

---

## 4. Route Audit

### Frontend routes (from `next build`, 69 pages generated)

| Route | Status | Source | Type | API-connected | SEO | Issues |
|---|---|---|---|---|---|---|
| `/` | VERIFIED | `(marketing)/page.tsx` | Static | Yes (sections) | Yes | Duplicate Org JSON-LD |
| `/about` | VERIFIED | `about/page.tsx` | Static | No (intentional) | Yes | Duplicate Org JSON-LD |
| `/services` | VERIFIED | `services/page.tsx` | Static+API | Yes | Yes | — |
| `/services/[slug]` | VERIFIED | 14 SSG paths | SSG | Yes | Yes | — |
| `/solutions` | VERIFIED | `solutions/page.tsx` | Static+API | Yes | Yes | — |
| `/solutions/[slug]` | VERIFIED | 10 SSG paths | SSG | Yes | Yes | — |
| `/industries` | VERIFIED | `industries/page.tsx` | Static+API | Yes | Yes | — |
| `/industries/[slug]` | VERIFIED | 12 SSG paths | SSG | Yes | Yes | Templated content |
| `/portfolio` | VERIFIED | `portfolio/page.tsx` | Static+API | Yes | Yes | Empty (0 records) |
| `/portfolio/[slug]` | VERIFIED | 0 SSG paths | SSG | Yes | Yes | No content seeded |
| `/blog` | VERIFIED | `blog/page.tsx` | Static+API | Yes | Yes | — |
| `/blog/[slug]` | VERIFIED | 2 SSG paths | SSG | Yes | Yes | Only 2 posts |
| `/training` | VERIFIED | `training/page.tsx` | Static | No (form→API) | Yes (Course JSON-LD) | Unused `PageHero` import |
| `/careers` | VERIFIED | `careers/page.tsx` | Static | No (form→API) | Yes | — |
| `/contact` | VERIFIED | `contact/page.tsx` | Static | No (form→API) | Yes | Duplicate Org JSON-LD |
| `/privacy-policy` | VERIFIED | static | Static | No | Yes | — |
| `/terms` | VERIFIED | static | Static | No | Yes | — |
| `/refund-policy` | VERIFIED | static | Static | No | Yes | — |
| `/admin/login` | VERIFIED | client | Static | Yes (auth) | noindex | — |
| `/admin/dashboard[/*]` | VERIFIED | 11 client pages | Static | Yes (admin API) | noindex | Client-only guard |
| `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/not-found`, `/error`, `/loading` | VERIFIED | conventions | — | sitemap uses API | — | — |

No duplicate routes, no route conflicts, no broken static routes. `not-found.tsx` renders a full 404 with navigation. The only route-existence risk is **data-driven**: static footer/nav links (e.g. `/services/crm-development`) and industry `relevantServices` links 404 via `notFound()` if the matching DB record is absent — all currently resolve because the seed provides them.

### Backend routes — see §12 API Audit.

---

## 5. Frontend Audit

**Result: GOOD.** Every listed page exists, builds, and renders. No placeholders, TODO/FIXME, "Coming Soon", lorem ipsum, `example.com`, or fake stats were found anywhere in `frontend/app`, `frontend/components`, or `frontend/lib`.

- **Dynamic vs static (VERIFIED):** Catalog pages (services/solutions/industries/portfolio/blog, list + detail) fetch live data via `lib/api.ts`; detail pages use `generateStaticParams` + `generateMetadata` + `notFound()`. Editorial pages (home sections, about, training, careers, legal) are intentionally hardcoded neutral copy.
- **Fallbacks are honest:** `getJson` returns `null` on any failure so pages render graceful fallbacks; empty states say "Case studies are on the way" / "No articles yet" rather than faking content.
- **Images (VERIFIED):** `next/image` used with `fill`/`sizes` in cards and detail pages; no raw `<img>` in the marketing tree. `next.config.mjs` allows only `res.cloudinary.com` and `images.unsplash.com` — API images from any other host would fail to render (see M6).
- **Client/server split (VERIFIED):** `'use client'` used correctly (Hero, forms, Navbar, MobileMenu, Accordion, PortfolioGrid, TableOfContents). No data-fetching-in-`useEffect` misuse; no hydration risks identified.
- **Loading/error states (VERIFIED):** `app/loading.tsx` (accessible spinner), `app/error.tsx` (reset boundary), `app/not-found.tsx` present.
- **Forms (VERIFIED):** Contact, Training, Career use `react-hook-form` + `zodResolver`, `aria-invalid`, `role="alert"` errors, disabled-while-submitting, success panels (`role="status"`), and surface server field errors via `setError`. All POST to the correct endpoints. NewsletterForm uses plain `useState` with weak client validation (see L4).
- **Responsiveness:** Layout uses fluid `clamp()` typography, a mobile menu component, and CSS-module grids. **NOT VERIFIED IN BROWSER at each breakpoint** (no visual browser testing was run); code structure is responsive-ready.

**Training page (VERIFIED CORRECT):** Offline (Bhopal) ₹50,000 → ₹25,000; Online ₹30,000 → ₹15,000; "50% OFF" badges consistent. **Compliance CLEAN** — copy reads "Top-performing interns *may* receive a job opportunity … based on performance"; **no "100% placement", "guaranteed job", or "PPO"** anywhere.

---

## 6. Backend Audit

**Result: GOOD.** Build and lint pass with zero errors. Live-tested end-to-end.

- `app.ts`: `trust proxy` set (correct behind Render/Railway/Vercel), Helmet, credentialed CORS restricted to `FRONTEND_URL` (comma-separated allowlist), 1 MB JSON/urlencoded body limits, cookie-parser, `/health`, rate limiting on `/api`.
- `config/env.ts`: `requiredStrict()` **refuses to boot in production** if `DATABASE_URL` or `JWT_SECRET` are missing (dev fallbacks only) — excellent.
- Controllers are thin; services hold logic; `asyncHandler` forwards rejections to the central error middleware; responses use a consistent `{success,message,data|errors}` envelope.
- Lead capture (contact/training/career/newsletter) **persists first, then sends email best-effort** — an email failure is logged and does not fail the request or cause duplicate submissions. Well-reasoned.

Minor: login also returns the JWT in the response body in addition to the httpOnly cookie (the frontend ignores it) — harmless but unnecessary (see L7). Email templates interpolate user input into HTML without escaping (see M1).

---

## 7. Database / Prisma Audit

**Result: GOOD.** `schema.prisma` is complete and correct. Migration `20260921043321_init` present; Prisma client generated.

Models present and correct: `User`, `Service`, `Solution`, `Industry`, `PortfolioProject`, `BlogCategory`, `BlogPost`, `ContactLead`, `TrainingApplication`, `CareerApplication`, `NewsletterSubscriber`, `Technology`, `FAQ`, `SiteSetting`.

- **Primary keys:** UUID `@default(uuid())` on all models. **VERIFIED.**
- **Unique constraints:** `slug` unique on all content models; `email` unique on `User` and `NewsletterSubscriber`; `name` unique on `Technology`. Duplicate slug/email correctly surfaces as HTTP 409 (Prisma P2002 handled).
- **Indexes:** `@@index` on `slug`, `published`, `order`, `status`, `createdAt`, `publishedAt`, `category`, `categoryId`, `featured` — appropriate for the query patterns.
- **Relations:** `BlogPost.category` → `BlogCategory` with `onDelete: SetNull` (correct — deleting a category nulls posts, handled by `nullableFields: ['categoryId']`).
- **Enums:** `Role`, `ContactStatus`, `TrainingStatus`, `CareerStatus`, `TrainingMode`, `SubscriberStatus` — all matched by the Zod status validators.
- **JSON fields:** `features/benefits/faqs/…` default `"[]"`; validated as arrays on write.
- **Timestamps:** `createdAt`/`updatedAt` consistent (NewsletterSubscriber has only `createdAt` — acceptable).
- **N+1 risk:** Low. Blog list uses `include: { category: true }` (single join). No per-row query loops. Admin dashboard uses `Promise.all` for parallel counts. **GOOD.**

No missing/unnecessary fields identified. `PortfolioProject` model exists but has **no seed data** (content gap, not a schema fault).

---

## 8. Supabase Audit

**Result: GOOD (configuration) / VERIFIED (connectivity).**

- `DATABASE_URL` uses the transaction-mode pooler (`:6543` + `pgbouncer=true`) — correct for serverless/Prisma runtime queries.
- `DIRECT_URL` uses the session-mode pooler (`:5432`) — correct for migrations.
- Connectivity **VERIFIED**: the backend logged `✓ Database connected` and every read endpoint returned live seeded data (14 services, 10 solutions, 12 industries, 2 posts, 23 technologies, etc.).
- Prisma singleton + pooling are production-compatible. No development-only DB assumptions (no SQLite, no localhost hardcoding in code; the only localhost fallback is the dev-only env fallback that is refused in production).

⚠️ The **connection credentials are exposed** in `.env.example` — see CRITICAL C1.

---

## 9. Authentication / JWT Audit

**Result: GOOD (server-side).** Live-verified.

- **Password hashing:** bcrypt, 12 salt rounds (`utils/password.ts`). **VERIFIED.**
- **JWT:** HS256, secret from `env.jwtSecret` (strict-required in prod), `expiresIn` 7d (`utils/token.ts`). **VERIFIED.**
- **Cookie:** `httpOnly: true`, `secure` in prod, `sameSite: 'none'` in prod / `'lax'` in dev, 7-day maxAge, `path:'/'`. The httpOnly flag was **confirmed live** (cookie jar shows `#HttpOnly_`). **VERIFIED.**
- **Token extraction:** cookie first, then `Authorization: Bearer` fallback (`auth.middleware.ts`).
- **Protected routes:** `requireAuth` + `requireAdmin` guard all `/api/admin/*`. Live tests: unauthenticated dashboard → **401**; wrong password → **401**; correct login → **200 + ADMIN role**; `/me` and `/admin/dashboard` with cookie → **200**. **VERIFIED.**
- **No token in localStorage:** the frontend relies solely on the httpOnly cookie (`credentials: 'include'`) — repo-wide grep found no `localStorage`/`Bearer` usage in app source. **XSS-safe. VERIFIED.**
- Unauthorized (401) and forbidden (403) are distinct and correct.

**Weaknesses:**
- **Frontend admin protection is client-only** (`useAuthGuard` calls `/auth/me` on mount and redirects). No `middleware.ts` or server guard exists → admin page HTML/shell is served before the client redirect. Data is safe (API enforces auth), but this is a defense-in-depth gap → **HIGH (H1).**
- **Frontend does not enforce role** (any authenticated user passes the client guard; role is display-only). The **backend** correctly enforces `requireAdmin`, so this is low impact → **LOW (L5).**
- No refresh-token/rotation and no server-side session revocation — acceptable for a single-admin CMS.

---

## 10. Resend / Email Audit

**Result: PENDING EXTERNAL CONFIGURATION.**

- `email.service.ts` initializes Resend only when `RESEND_API_KEY` is set; otherwise it logs and no-ops so lead capture still succeeds. **Good failure design.**
- API key is **backend-only** (never referenced in frontend). **VERIFIED.**
- Errors from `resend.emails.send` are thrown and caught by callers (best-effort) — **no fake success**: the API responds success because the *lead is persisted*, not because email delivered. Honest.
- Templates: reusable `layout()` + `row()` helpers; contact/training/career/newsletter notifications + acknowledgements implemented.

**Blockers for production email delivery:**
- Default sender is `Globalantic <onboarding@resend.dev>` (Resend's shared test domain). With the test domain, Resend only delivers to the account owner's address — acknowledgement emails to arbitrary leads **will not deliver**. A verified custom domain (e.g. `no-reply@globalantic.com`) is required. → **HIGH (H2), PENDING EXTERNAL CONFIGURATION** (not broken code).
- **Not live-tested**: no emails were actually sent during this audit (to avoid triggering the external service), so delivery is **NOT VERIFIED**.

**Security note:** user-supplied fields (`name`, `message`, etc.) are interpolated into email HTML without escaping → HTML injection into the admin's inbox (see M1).

---

## 11. Admin Dashboard Audit

**Result: GOOD (wiring) / NEEDS IMPROVEMENT (scale + error UX).** All sections are real and call the backend via `client-api.ts`. No stubs, TODOs, or fake data.

| Section | Read | Create | Update | Delete | Publish | Search/Filter | Pagination | Status |
|---|---|---|---|---|---|---|---|---|
| Dashboard | ✓ API | — | — | — | — | — | — | VERIFIED (no error state) |
| Services | ✓ | ✓ | ✓ | ✓ | ✓* | ✗ | ✗ | VERIFIED (CmsManager) |
| Solutions | ✓ | ✓ | ✓ | ✓ | ✓* | ✗ | ✗ | VERIFIED |
| Industries | ✓ | ✓ | ✓ | ✓ | ✓* | ✗ | ✗ | VERIFIED |
| Portfolio | ✓ | ✓ | ✓ | ✓ | ✓* | ✗ | ✗ | VERIFIED |
| Blog | ✓ | ✓ | ✓ | ✓ | ✓* | ✗ | ✗ | VERIFIED |
| Contacts | ✓ | — | ✓ status | ✓ | ✓ | ✗ | VERIFIED |
| Training | ✓ | — | ✓ status | ✓ | ✓ | ✗ | VERIFIED |
| Careers | ✓ | — | ✓ status | ✓ | ✓ | ✗ | VERIFIED |
| Newsletter | ✓ | — | ✗ (no status) | ✓ | ✓ email | ✗ | VERIFIED (status update MISSING) |
| Settings | ✓ | — | ✓ | — | — | — | VERIFIED |

\* Publish/unpublish is implemented as `PUT /:id` with `{published}` (works — the backend accepts it), **not** the dedicated `PATCH /:id/publish|unpublish` endpoints, which are therefore unused (see L2).

**Cross-cutting admin findings:**
- Loading and empty states present (`DataTable`). **VERIFIED.**
- **List-load errors collapse to an empty list** (a failed fetch is indistinguishable from "no records") — silent failure → **MEDIUM (M3).**
- **No pagination/search on the 5 CMS content sections** — fetches and renders the full table; won't scale → **MEDIUM (M2).** (Contacts/Training/Careers/Newsletter *do* have client-side search + filter.)
- **Newsletter admin cannot change subscriber status** though the schema/UI could support unsubscribe → **MEDIUM/LOW (M4).**
- Form validation is thin client-side (required/number/JSON only; no slug/email/URL format checks) — relies on backend Zod (which is solid) → **LOW.**

---

## 12. API Audit

All endpoints below were **live-tested** unless noted. Envelope: `{success, message, data}` / `{success:false, message, errors}`.

| Method | Endpoint | Auth | Validation | DB | Result | Status |
|---|---|---|---|---|---|---|
| GET | `/health` | No | — | No | uptime | VERIFIED |
| GET | `/api/services` | No | — | Yes | 14 items | VERIFIED |
| GET | `/api/services/:slug` | No | — | Yes | item / 404 | VERIFIED |
| GET | `/api/solutions` | No | — | Yes | 10 | VERIFIED |
| GET | `/api/solutions/:slug` | No | — | Yes | item/404 | VERIFIED |
| GET | `/api/industries` | No | — | Yes | 12 | VERIFIED |
| GET | `/api/industries/:slug` | No | — | Yes | item/404 | VERIFIED |
| GET | `/api/portfolio` | No | — | Yes | 0 | VERIFIED (empty) |
| GET | `/api/portfolio/:slug` | No | — | Yes | 404 | VERIFIED |
| GET | `/api/blog` | No | — | Yes | 2 | VERIFIED |
| GET | `/api/blog/:slug` | No | — | Yes | item/404 | VERIFIED |
| GET | `/api/technologies` | No | — | Yes | 23 | VERIFIED |
| GET | `/api/faqs` | No | — | Yes | 5 | VERIFIED |
| GET | `/api/blog-categories` | No | — | Yes | 10 | VERIFIED |
| GET | `/api/settings` | No | — | Yes | public-safe fields | VERIFIED |
| POST | `/api/contact` | No | Zod + strict RL | Yes | 201 / 400 | VERIFIED (400 on invalid; valid not submitted) |
| POST | `/api/training/apply` | No | Zod + strict RL | Yes | 201 | NOT VERIFIED (not submitted to avoid data) |
| POST | `/api/careers/apply` | No | Zod + strict RL | Yes | 201 | NOT VERIFIED (not submitted) |
| POST | `/api/newsletter` | No | Zod + strict RL | Yes | 201/200 | NOT VERIFIED (not submitted) |
| POST | `/api/auth/login` | No | Zod + strict RL | Yes | 200 + cookie / 401 | VERIFIED |
| POST | `/api/auth/logout` | No | — | No | clears cookie | VERIFIED (code) |
| GET | `/api/auth/me` | Yes | — | Yes | user | VERIFIED |
| GET | `/api/admin/dashboard` | Admin | — | Yes | stats | VERIFIED |
| CRUD | `/api/admin/{services,solutions,industries,portfolio,blog}` | Admin | Zod | Yes | list/get/create/update/publish/unpublish/delete | VERIFIED (auth); create/update NOT live-mutated |
| GET/PUT/DELETE | `/api/admin/{contacts,training,careers}` | Admin | Zod (status) | Yes | list/status/delete | VERIFIED (auth) |
| GET/DELETE | `/api/admin/newsletter` | Admin | — | Yes | list/delete | VERIFIED (auth) |
| GET/PUT | `/api/admin/settings` | Admin | Zod | Yes | get/update | VERIFIED (auth) |
| * | unknown route | — | — | — | 404 | VERIFIED |

Unknown routes and unknown slugs both return **404** with the standard error envelope. Admin routes without a valid cookie return **401**; invalid input returns **400** with field-level errors.

---

## 13. Security Audit

**Result: PROBLEM (one critical secret-handling issue); otherwise GOOD.**

| Control | Status | Evidence |
|---|---|---|
| Helmet security headers | VERIFIED | `app.ts` `app.use(helmet())` |
| CORS restricted + credentialed | VERIFIED | Allowlist from `FRONTEND_URL`; rejects others |
| Rate limiting | VERIFIED | `apiLimiter` 300/15min on `/api`; `strictLimiter` 20/15min on auth + lead capture |
| Zod validation on writes | VERIFIED | Every POST/PUT route uses `validate(schema)` |
| Request body size limit | VERIFIED | 1 MB JSON/urlencoded |
| SQL injection | PROTECTED | Prisma parameterized queries only; no raw SQL |
| XSS (frontend) | PROTECTED | React escaping; blog content rendered via safe custom markdown (no `dangerouslySetInnerHTML` on user content) |
| Auth cookie httpOnly/secure | VERIFIED | Confirmed live |
| Password hashing | VERIFIED | bcrypt 12 rounds |
| Stack traces hidden in prod | VERIFIED | `errorHandler` returns generic message when `isProd` |
| Prisma error leakage | PROTECTED | P2002/P2025 mapped; generic otherwise |
| Mass assignment | LOW RISK | Writes pass through Zod schemas that strip unknown keys; admin can set `published`/`featured`/`order` by design |
| IDOR | LOW RISK | Admin-only mutations behind `requireAdmin`; public reads are published-only |
| Unrestricted file upload | N/A | No file upload endpoint exists (resume is a URL field) |
| CSRF | PARTIAL | `sameSite` cookie mitigates; but Bearer fallback + `sameSite:none` in prod means no CSRF token — acceptable for a JSON API with credentialed CORS allowlist, but note below |

**Findings:**
- **CRITICAL (C1):** real credentials in `backend/.env.example` (see §21).
- **MEDIUM (M1):** email HTML injection — unescaped `lead.name`/`lead.message`/etc. interpolated into notification HTML in `email.service.ts`. A crafted message could inject markup/links into the admin's email. Escape user input before templating.
- **LOW:** no CSRF token. With `sameSite:'none'` in production (required for cross-site Vercel↔Render cookies) the sameSite protection is weakened; the credentialed-CORS allowlist is the primary defense. Consider a CSRF token or `sameSite:'strict'`/same-site deployment if feasible.
- **LOW:** admin dashboard `recentLeads` returns full lead records to any authenticated admin — expected for an admin tool.

No secrets are printed in this report.

---

## 14. UI/UX Audit

**NOT VERIFIED IN BROWSER** (no visual/browser automation was run). Assessment is from code + design tokens.

- **Design language:** deep-purple brand system (`--primary:#6d22e6`), layered purple-tinted shadows, gradient meshes, generous spacing scale, fluid `clamp()` typography (Plus Jakarta Sans). Reads as **modern, premium, technology-focused** in code.
- **Consistency:** a shared UI kit (`Button`, `Card`, `Badge`, `Input`, `SectionHeading`, `Modal`, `ContentCard`) and section components enforce consistent buttons/cards/spacing.
- **Navigation/footer:** `Navbar` with mega-menu + `MobileMenu`; `Footer` with company/services/solutions/legal columns. Skip-link (`#main`) present for a11y.
- **CTA placement:** consistent `DetailCTA`/`CTASection`/`TrainingCTA` blocks with links to `/contact`.
- **Empty space / balance:** cannot be judged without rendering.

**Areas that may look thin/repetitive (from content, not layout):**
- Portfolio section renders an empty state (no projects) — will look unfinished until content is added.
- Industry detail pages share identical `technologies` chips and a near-identical templated FAQ — may read as repetitive across the 12 pages.

Rating: **GOOD (structure) / NEEDS IMPROVEMENT (verify visually + industries/portfolio content).**

---

## 15. Design System Audit

**Result: GOOD.** `globals.css` (420 lines) contains **only** design tokens, reset, base typography, utilities, and a11y helpers — component styling is correctly isolated in `*.module.css`.

- Comprehensive CSS custom properties: brand palette, surfaces, text, borders, state colors, gradients, 7-step shadow scale, radius scale, spacing scale (4px base), typography scale, font weights, line heights, layout widths.
- **Central theming is achievable** — colors/spacing/typography are all tokenized and referenced via `var()`.
- Only **4** `!important` declarations (minimal, likely a11y/utility resets).
- No dark-mode theme is defined (acceptable for this marketing site; not a defect).
- Hardcoded colors do appear inside module files in places (typical for CSS Modules) but the core palette is tokenized.

Rating: **GOOD.**

---

## 16. Responsive Audit

**NOT VERIFIED IN BROWSER.** No breakpoint-by-breakpoint visual testing (320/375/390/430/768/1024/1440/1920) was performed.

From code: fluid typography via `clamp()`, a dedicated `MobileMenu`, CSS-module grids, container-width tokens, and `next/image` with `sizes` suggest a responsive-ready implementation. Horizontal-overflow, table reflow (admin `DataTable` on mobile), and hero scaling should be **verified visually** before launch. Admin tables in particular are the most likely to overflow on narrow viewports.

Rating: **NEEDS IMPROVEMENT (verify in browser).**

---

## 17. Performance Audit

**Result: GOOD.** Build succeeded; bundle sizes are healthy.

- **Shared First Load JS: 87.4 kB** — good for a Next.js app.
- Largest route `/` at 137 kB First Load (framer-motion on the client Hero); most pages 88–107 kB.
- Correct **Server Components** for data pages; `'use client'` limited to interactive components.
- **SSG** for all detail pages (services/solutions/industries/blog/portfolio) via `generateStaticParams`; **ISR** `revalidate: 300s` on API reads — good caching balance.
- `next/image` optimization with `sizes`; fonts via `next/font` (self-hosted, `display: swap`).
- No obvious duplicate/redundant API calls; admin dashboard batches counts with `Promise.all`.

**Notes:** framer-motion adds client JS to the Hero; consider lazy/reduced-motion if needed. Build emitted `ECONNREFUSED` warnings when the API was briefly unreachable during static generation — harmless because `getJson` returns `null` and pages fall back, but for a fully-populated production build the API must be reachable at build time (or rely on ISR to fill in).

Rating: **GOOD.**

---

## 18. SEO Audit

**Result: GOOD.**

- **Metadata:** `buildMetadata()` produces title (templated `%s | Globalantic`), description, **canonical** (`alternates.canonical`), robots, OpenGraph, and Twitter card on every marketing page; detail pages use per-record `seoTitle`/`seoDescription`/`ogImage`. `metadataBase` set in root layout.
- **Structured data (JSON-LD):** Organization (site-wide), BreadcrumbList (detail/list pages), Service (service detail), Article (blog detail), Course (training). **VERIFIED.**
- **Sitemap:** `app/sitemap.ts` merges static routes + dynamic services/solutions/industries/portfolio/blog from the API (null-safe). **VERIFIED.**
- **Robots:** `app/robots.ts` allows `/`, disallows `/admin`, references sitemap. **VERIFIED.**
- **OG image:** generated 1200×630 branded image via `opengraph-image.tsx` (edge runtime).
- **Heading hierarchy:** section components use `SectionHeading`; detail pages have a single H1 via `DetailHero`.

**Issues:**
- **Duplicate Organization JSON-LD (L1):** emitted by root `layout.tsx` *and* again on home/about/contact pages — redundant (not harmful, but should be single-sourced).
- **Templated industry content (M5):** near-identical taglines/FAQs/technologies across 12 industry pages risk being seen as thin/duplicate content by search engines.
- Legal pages are indexable (acceptable).

Rating: **GOOD** (minor cleanups).

---

## 19. Accessibility Audit

**Result: GOOD (code-level) / NOT FULLY VERIFIED (no automated a11y/contrast run).**

- Semantic landmarks: skip-link + `<main id="main">` in marketing layout.
- Forms: `aria-invalid`, `role="alert"` on errors, associated labels via the `Field`/`Input` components, `noValidate` with programmatic validation.
- Status regions: `role="status"` on loading spinner and form success panels.
- Icons: decorative hero mockup marked `aria-hidden`.
- Links use `rel="noopener noreferrer"` on external share links.

**To verify before launch:** color contrast of muted text tokens (`--text-muted:#8a8a99` on white is ~2.9:1 — likely **fails WCAG AA** for normal text), keyboard focus-visible styles across all interactive elements, mobile-menu focus trapping, and `DataTable` header semantics. Contrast on muted text is the most likely concrete WCAG failure → **LOW/MEDIUM.**

Rating: **GOOD structure; verify contrast + keyboard.**

---

## 20. Content Audit

**Result: GOOD (neutral, honest) with completeness gaps.**

Scanned seed data and frontend for: lorem ipsum, TODO, FIXME, "Coming Soon", demo, sample, test, placeholder, undefined, dummy, fake, example.com — **no matches** in source or seed content.

- **Services (14):** unique, hand-written `overview/problem/solution/features/deliverables/benefits/useCases/faqs` per service. The 6-step `process` block is shared across all services (reasonable for a standard delivery process).
- **Solutions (10):** unique and substantive.
- **Industries (12):** overviews/challenges/solutions are unique, **but** `tagline`, `features` (= first 4 solutions), `technologies` (identical `['React','Next.js','Node.js','PostgreSQL']` for all 12), and the single `faq` are **mechanically templated** — the clearest "same template, name swapped" case → **M5.**
- **Portfolio:** **0 projects seeded** — no fabricated clients/metrics/testimonials (because there is no content at all) → content gap **M6.**
- **Blog:** 2 clean, coherent, non-promotional articles; author `Globalantic` (no fake human names); dates set at seed time; **10 categories but only 2 posts** (8 empty) → **L3.**
- **No fake statistics or unsupported claims** ("500+ clients", "99% satisfaction", etc.) anywhere; the decorative "99.9% uptime" in the Hero is inside an `aria-hidden` mock UI, not a public claim.
- **Site settings** seed leaves `phone`, `whatsapp`, and all social URLs **empty** → footer social links and a contact phone number are absent until configured → **L6.**

This matches the recorded expectation that Globalantic content be **real/neutral and never fabricated**.

---

## 21. Environment / Secret Audit

**Result: CRITICAL.** No secret *values* are reproduced below.

| Secret type | Location | Risk | Action |
|---|---|---|---|
| Supabase DB password (in `DATABASE_URL`/`DIRECT_URL`) | `backend/.env.example` | CRITICAL | Rotate the Supabase DB password; replace with a placeholder in `.env.example` |
| Resend API key | `backend/.env.example` | CRITICAL | Revoke/rotate the key in Resend; placeholder only |
| Cloudinary API secret + key | `backend/.env.example` | HIGH | Rotate Cloudinary credentials; placeholder only |
| Seed admin password | `backend/.env.example` (`SEED_ADMIN_PASSWORD`) | HIGH | Remove real password; use a placeholder; change the seeded admin password |
| JWT secret | `backend/.env.example` shows a placeholder ("replace-with-a-long-random-string") | OK | Ensure a strong unique value is set only in `.env` |
| `backend/.env`, `frontend/.env.local` | present on disk | — | Correctly git-ignored (`.env`, `.env.local` excluded); values not printed |
| Seed fallback password | `prisma/seed.ts` `'ChangeMe123!'` | LOW | Fallback only; ensure env is set in prod |

**Root cause:** `.gitignore` correctly ignores `.env`/`.env.local` but **force-includes `.env.example`** (`!.env.example`). Because `.env.example` was filled with *real* values instead of placeholders, committing it would leak live credentials. **This is the single most urgent item.** `.gitignore` is otherwise correct (ignores `node_modules`, `.next`, `dist`, `.env*`, build artifacts). Note: the project is not currently a git repository, so nothing has been pushed yet — rotate and sanitize **before** `git init`/first push.

---

## 22. Error Handling Audit

**Result: GOOD.**

- **Frontend:** `app/error.tsx` (reset boundary), `app/not-found.tsx` (full 404 with nav), `app/loading.tsx` (accessible spinner). Forms show inline field + server errors; API reads fall back to graceful empty states.
- **Backend:** central `errorHandler` maps `ApiError`, `ZodError` (→ 400 with field errors), Prisma `P2002` (→ 409), `P2025` (→ 404), and unknown (→ 500 generic in prod, detailed in dev). `notFoundHandler` returns a clean 404. `asyncHandler` prevents unhandled-rejection crashes.
- **No raw stack traces** are returned in production. **VERIFIED.**

**Gap:** admin **list-load failures render as empty lists** (no error banner) — a network/500 looks like "no records" (M3). Dashboard has no error state either.

---

## 23. Code Quality Audit

**Result: GOOD.** `noImplicitReturns`, `strict` mode on both projects; lint clean.

- TypeScript is strict; `any` is rare and localized (the content factory uses deliberate loose typing with a documented rationale; Zod `z.array(z.any())` for JSON fields; a few `as never` casts for Prisma enum status writes).
- No unused variables flagged by lint. One **unused import** (`PageHero` in `training/page.tsx`) — L8.
- Functions/components are appropriately sized; naming is clear and consistent.
- No React anti-patterns or `useEffect` data-fetching misuse found.
- `console.log`/`console.error` used intentionally (with eslint-disable) for server lifecycle/logging — acceptable; a structured logger would be a nice-to-have for production.

Files that *could* be simplified (not required): `CmsManager.tsx` (large but cohesive), the repeated create/update object literals in `seed.ts`.

---

## 24. Dependency Audit

**Result: GOOD.** No unused, duplicate, or abandoned packages identified; versions are current.

- **Frontend:** next, react, react-dom, lucide-react, framer-motion, react-hook-form, zod, @hookform/resolvers — all used. framer-motion is the heaviest (client Hero); justified.
- **Backend:** @prisma/client, bcryptjs, cookie-parser, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken, resend, zod — all used.
- Cloudinary is referenced in env/config but there is **no Cloudinary SDK dependency and no upload code** — config is aspirational/unused (not a bug; images are URL fields).
- No automated `npm audit` was run in this pass; recommend running it in CI. No pinned exact versions (all `^`) — fine for an app, lockfiles present.

---

## 25. Build / Test Results

| Command | Result |
|---|---|
| `backend: npm run build` (tsc) | **PASS (exit 0)** |
| `backend: npm run lint` (eslint) | **PASS (exit 0)** |
| `frontend: npm run typecheck` (tsc --noEmit) | **PASS (exit 0)** |
| `frontend: npm run build` (next build) | **PASS (exit 0)** — 69/69 pages generated |
| Live API smoke test (all GET endpoints, auth, admin, 404, 400) | **PASS** |

There is **no automated test suite** (no unit/integration/e2e tests, no `test` script). This is a gap for long-term maintenance → **LOW/MEDIUM (L/M).**

The `next build` printed `ECONNREFUSED` while the API was momentarily unreachable during static generation — non-fatal (graceful null fallback); the build completed successfully.

---

## 26. Production Readiness

| Environment | Verdict |
|---|---|
| **Development** | **READY** — builds, lints, runs, connects to Supabase, full flow works. |
| **Staging** | **READY after**: (1) rotate + sanitize secrets in `.env.example` (C1), (2) set strong `JWT_SECRET`/`SEED_ADMIN_PASSWORD` in real env. |
| **Production** | **NOT READY until**: C1 resolved; Resend custom domain verified (H2); recommended: server-side admin protection (H1), escape email HTML (M1). Nice-to-have: portfolio content (M6), industries content de-duplication (M5), automated tests, `npm audit` in CI. |

Do **not** treat "build passes" as production-ready — the secret exposure and email-delivery items are launch blockers regardless of a green build.

Checklist: Env config ⚠️ (secrets) · Database ✅ · Auth ✅ (server) / ⚠️ (frontend guard) · Email ⏳ (pending domain) · Security ✅ except C1/M1 · SEO ✅ · Performance ✅ · Error handling ✅ · Logging ⚠️ (console only) · CORS ✅ · Deployment configs ✅ (Vercel/Render-ready) · Build ✅ · API ✅ · Admin ✅ (wiring).

---

## 27. Critical Issues

### [CRITICAL] Live secrets committed in `.env.example`
**Location:** `backend/.env.example`
**Category:** Security
**Problem:** The example env file contains what appear to be **real** credentials — Supabase database password (in `DATABASE_URL`/`DIRECT_URL`), a Resend API key, a Cloudinary API key + secret, and a real seed admin password — instead of placeholders. `.gitignore` force-includes this file (`!.env.example`).
**Impact:** If the repository is pushed/shared, these credentials leak, allowing full database access, email sending under your account, and admin login. This is the highest-severity finding.
**Evidence:** `backend/.env.example` lines for `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`, `SEED_ADMIN_PASSWORD` contain concrete values (not shown here).
**Recommended Fix:** Rotate every exposed credential at its provider (Supabase DB password, Resend key, Cloudinary secret) and change the seeded admin password; replace all values in `.env.example` with obvious placeholders; keep real values only in the git-ignored `.env`. Do this before `git init`/first push.
**Status:** NOT FIXED

---

## 28. High Priority Issues

### [HIGH] No server-side protection for `/admin` routes
**Location:** `frontend/app/admin/*`, `frontend/components/admin/useAuthGuard.ts`; no `frontend/middleware.ts`
**Category:** Security / Auth
**Problem:** Admin route protection is client-only (`useAuthGuard` calls `/api/auth/me` on mount and redirects). There is no Next.js middleware or server guard, so admin page HTML/shell is served before the client redirect runs.
**Impact:** Defense-in-depth gap and brief UI exposure. Data remains safe because the backend enforces `requireAuth`+`requireAdmin` on `/api/admin/*` (verified), so this is not a data breach — but the admin UI should not render for unauthenticated users.
**Evidence:** `useAuthGuard.ts` client redirect; `app/admin/layout.tsx` sets only metadata; no `middleware.*` exists.
**Recommended Fix:** Add `frontend/middleware.ts` matching `/admin/:path*` that checks the auth cookie (or calls `/auth/me`) and redirects unauthenticated requests server-side.
**Status:** NOT FIXED

### [HIGH] Email not production-deliverable (Resend test sender / unverified domain)
**Location:** `backend/.env.example` (`RESEND_FROM_EMAIL`), `backend/src/services/email.service.ts`
**Category:** Email / Config
**Problem:** The default sender is `onboarding@resend.dev` (Resend's shared test domain). Resend delivers from the test domain only to the account owner, so acknowledgement emails to leads/applicants will not be delivered.
**Impact:** Contact/training acknowledgements and admin notifications to other addresses silently do not arrive. Code is correct; configuration is incomplete.
**Evidence:** `RESEND_FROM_EMAIL="Globalantic <onboarding@resend.dev>"`; `email.service.ts` uses `env.resendFromEmail`.
**Recommended Fix:** Verify a custom domain in Resend and set `RESEND_FROM_EMAIL` to e.g. `Globalantic <no-reply@globalantic.com>`; then test real delivery.
**Status:** PENDING EXTERNAL CONFIGURATION

### [HIGH] (Rolls up from C1) Rotate credentials before any push
Covered by CRITICAL C1 — listed here for the fix-order emphasis: credential rotation is both critical and time-sensitive.
**Status:** NOT FIXED

---

## 29. Medium Priority Issues

### [MEDIUM] Email HTML injection (unescaped user input)
**Location:** `backend/src/services/email.service.ts` (`sendContactNotification`, `row()`, message block)
**Problem:** `lead.name`, `lead.message`, and other user fields are interpolated into email HTML without escaping.
**Impact:** A crafted submission can inject markup/links into the admin notification email (phishing surface in your inbox).
**Recommended Fix:** HTML-escape all user-provided values before templating.
**Status:** NOT FIXED

### [MEDIUM] Admin CMS sections lack pagination and search
**Location:** `frontend/components/admin/CmsManager.tsx`
**Problem:** Services/solutions/industries/portfolio/blog admin lists fetch and render the entire table with no search/filter/pagination.
**Impact:** Degrades and eventually breaks as content grows.
**Recommended Fix:** Add server-side pagination + search (the backend `listAll` already accepts `search`/`published` filters).
**Status:** NOT FIXED

### [MEDIUM] Admin list-load failures render as empty state
**Location:** `CmsManager.tsx`, `contacts/training/careers/newsletter/page.tsx`, `dashboard/page.tsx`
**Problem:** A failed fetch sets rows to `[]` (or zeros), indistinguishable from genuinely empty data; no error banner.
**Impact:** Outages/500s look like "no records"; admins may not notice failures.
**Recommended Fix:** Track and surface a load-error state distinct from empty.
**Status:** NOT FIXED

### [MEDIUM] Newsletter admin cannot update subscriber status
**Location:** `frontend/app/admin/dashboard/newsletter/page.tsx`
**Problem:** UI supports list + delete only; there is no way to mark a subscriber UNSUBSCRIBED (status is display-only). The backend exposes no newsletter status route either.
**Impact:** Unsubscribe/status management must be done manually in the DB.
**Recommended Fix:** Add a status-update endpoint + UI, or document delete-only behavior intentionally.
**Status:** NOT FIXED

### [MEDIUM] Industry content is templated (near-duplicate)
**Location:** `backend/prisma/data/industries.ts` (`build()` helper)
**Problem:** All 12 industries share an identical `technologies` array, an auto-generated tagline pattern, `features` copied from `solutions.slice(0,4)`, and one boilerplate FAQ with only the sector name swapped.
**Impact:** Thin/duplicate content across 12 pages — weaker UX and SEO.
**Recommended Fix:** Author unique technologies/features/FAQs per industry.
**Status:** NOT FIXED

### [MEDIUM] Portfolio has no content
**Location:** `backend/prisma/seed.ts` (no `seedPortfolio`), `PortfolioProject` model
**Problem:** Zero portfolio projects are seeded; `/portfolio` and `/portfolio/[slug]` render empty states / 404.
**Impact:** A core marketing section is empty; no case studies to show.
**Recommended Fix:** Add real portfolio records via the admin CMS (the CRUD is fully wired). No fabricated projects were added — consistent with the neutral-content requirement.
**Status:** NOT FIXED

### [MEDIUM] No automated tests
**Location:** repo-wide
**Problem:** No unit/integration/e2e tests or `test` script.
**Impact:** Regressions can ship undetected.
**Recommended Fix:** Add API integration tests (auth, validation, CRUD) and a few frontend smoke tests.
**Status:** NOT FIXED

---

## 30. Low Priority Issues

- **[LOW] Duplicate Organization JSON-LD** — emitted in root `layout.tsx` and again on `/`, `/about`, `/contact`. Single-source it. (`app/layout.tsx`, `(marketing)/page.tsx`, `about`, `contact`) — **Status: NOT FIXED**
- **[LOW] Dedicated publish endpoints unused** — admin toggles publish via `PUT {published}`; `PATCH /:id/publish|unpublish` routes are never called (dead endpoints). Pick one. (`CmsManager.tsx`, `admin.routes.ts`) — **Status: NOT FIXED**
- **[LOW] Only 2 blog posts across 10 categories** — 8 empty categories. Add posts or trim categories. (`prisma/data/blog.ts`, `reference.ts`) — **Status: NOT FIXED**
- **[LOW] Frontend does not enforce admin role** — any authenticated user passes the client guard (backend `requireAdmin` still enforces). (`AdminShell.tsx`, `useAuthGuard.ts`) — **Status: NOT FIXED**
- **[LOW] Site settings seed leaves phone/whatsapp/social empty** — footer social links and contact phone are absent until configured. (`prisma/seed.ts` `seedSettings`) — **Status: NOT FIXED**
- **[LOW] NewsletterForm has no real client-side email validation** — relies on backend (`noValidate` + no zod). (`components/forms/NewsletterForm.tsx`) — **Status: NOT FIXED**
- **[LOW] Login returns JWT in response body** in addition to the httpOnly cookie (frontend ignores it). Remove to reduce token surface. (`controllers/auth.controller.ts`) — **Status: NOT FIXED**
- **[LOW] Unused import `PageHero`** in `training/page.tsx`. — **Status: NOT FIXED**
- **[LOW] Muted-text contrast likely fails WCAG AA** (`--text-muted:#8a8a99` on white ≈ 2.9:1). Verify/darken. (`app/globals.css`) — **Status: NOT FIXED**
- **[LOW] No CSRF token** — with `sameSite:'none'` in prod, credentialed-CORS allowlist is the sole CSRF defense. (`app.ts`, `auth.controller.ts`) — **Status: NOT FIXED**
- **[LOW] `next/image` domains limited to cloudinary + unsplash** — CMS images from other hosts would fail to render. (`next.config.mjs`) — **Status: NOT FIXED**
- **[LOW] Console-only logging** — no structured logger for production. (`backend/src/*`) — **Status: NOT FIXED**

---

## 31. Recommended Fix Order

1. **Rotate and sanitize all secrets** in `backend/.env.example` (C1) — before any git push. Change the seeded admin password.
2. **Verify a Resend custom domain** and update `RESEND_FROM_EMAIL` (H2); then test real email delivery.
3. **Add `frontend/middleware.ts`** to protect `/admin/*` server-side (H1).
4. **Escape user input in email templates** (M1).
5. **Add admin load-error states** and **pagination/search** to CMS lists (M3, M2).
6. **Author unique industry content** and **add real portfolio projects** via the admin CMS (M5, M6).
7. **Wire newsletter status** or document delete-only (M4).
8. **Add an automated test suite** + `npm audit` in CI (M/L).
9. **SEO/a11y polish:** de-duplicate Organization JSON-LD, fix muted-text contrast, add blog posts (L1, contrast, L3).
10. **Cleanups:** remove unused publish endpoints or switch to them, drop token-in-body, remove unused import, fill site settings (L2, L7, L8, L6).
11. **Verify responsive layouts in a browser** across the target breakpoints (esp. admin tables and hero).

---

*End of audit. No project files were modified during this audit; this report is the only file created.*
