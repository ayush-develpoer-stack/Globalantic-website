# GLOBALANTIC PLATFORM ARCHITECTURE

**Document type:** Phase 1 design artifact (analysis + target architecture)
**Status:** Proposal for review. **No code, schema, env, or existing app has been changed to produce this document.**
**Date:** 2026-09-26

This document turns Globalantic from a single IT-services website into a multi-portal digital ecosystem, **built on top of the existing audited codebase** (Next.js frontend + Express/Prisma/Supabase backend), without rebuilding what already works.

---

## 1. What already exists (Phase 1 analysis)

From the completed audit (`FULL_WEBSITE_AUDIT.md`), the current system is:

```
frontend/   Next.js 14 App Router, TypeScript, CSS Modules
            - (marketing) route group: public IT-services website (VERIFIED, builds)
            - app/admin: client-rendered CMS dashboard (VERIFIED wiring)
            - lib/api.ts (server reads), lib/client-api.ts (client mutations, httpOnly cookie)
backend/    Express + TypeScript
            - JWT auth (bcrypt-12, httpOnly cookie, requireAuth/requireAdmin) — VERIFIED live
            - content.factory pattern for CRUD, Zod validation, Helmet, CORS allowlist, rate limiting
            - Resend email (best-effort), centralized error handling
prisma/     schema.prisma with 14 models, Supabase (pooled + direct URLs) — connectivity VERIFIED
```

**Reusable as-is (do not rebuild):** JWT/auth middleware, cookie model, Zod validation layer, error middleware, rate limiting, Helmet/CORS, the content factory, the Resend service, the Prisma singleton, the marketing website, and the existing admin CMS for website content.

**What must be added:** more roles (RBAC), user profiles, an LMS (courses/batches/attendance/assignments/tests), fees + Razorpay payments, certificates, an intern portal, an employee/HR portal, a management admin, notifications, documents, audit logging, and password reset.

### Key architectural decisions carried forward
- **One centralized backend + one Supabase database** for all portals (no per-portal DB).
- **Centralized JWT auth with httpOnly cookies + RBAC** (extend the existing, proven auth — do not replace it).
- **Backend authorization on every protected resource** (never rely on frontend route guards alone — a gap flagged in the audit that we fix here).
- **Never trust the frontend for payment success** — Razorpay is verified server-side via webhook + signature.
- **Solo-developer constraint:** no microservices, no Kubernetes, no Redis unless required, no heavy LMS/ERP frameworks. Prefer Next.js + Node/Express + Prisma + Supabase + JWT + Resend + Razorpay + Cloudinary.

---

## 2. Subdomain map (target)

| Subdomain | App | Audience | Purpose |
|---|---|---|---|
| `globalantic.com` / `www.` | `website` (existing frontend) | Public | IT services, solutions, industries, portfolio, blog, about, careers, contact. Training appears as a **secondary** offering with an "Explore Globalantic Training" link → training subdomain. |
| `training.globalantic.com` | `training` | Public / prospective students | Programs, Full-Stack internship, curriculum, fees, admissions, FAQ, apply, pay, student login. Dedicated education branding. |
| `intern.globalantic.com` | `intern` | Interns (role `INTERN`) | Dashboard, course/LMS, class schedule, attendance, assignments, tests, results, fees & payments, receipts, certificates, announcements, support, profile. |
| `employee.globalantic.com` | `employee` | Employees (role `EMPLOYEE`) | Dashboard, profile, attendance (check-in/out), leave, tasks, projects, documents, payslips, performance, announcements, support. |
| `admin.globalantic.com` | `admin` | Staff (`SUPER_ADMIN`, `ADMIN`, `HR`, `FINANCE`, `COUNSELLOR`, and `TRAINER` until a trainer app exists) | Central management: admissions, users, courses, batches, attendance, fees/payments, certificates, HR, reports, website CMS, settings, audit log. |
| `trainer.globalantic.com` | `trainer` *(deferred)* | Trainers (role `TRAINER`) | Trainer dashboard: batches, schedules, mark attendance, assignments, tests, grading. **Implemented first as a role-gated area inside `admin`**, kept architecturally ready to split into its own app later. |

Domains are configured via env, never hardcoded (see §7).

---

## 3. Recommended repository architecture

The current repo is `frontend/` + `backend/`. Two viable ways to host six front-ends:

**Option A — Monorepo with multiple Next.js apps (recommended).**
```
globalantic/
├── apps/
│   ├── website/     ← the existing frontend, moved here nearly unchanged
│   ├── training/
│   ├── intern/
│   ├── employee/
│   ├── admin/       ← existing app/admin extracted + expanded
│   └── trainer/     ← deferred (role-gated in admin until then)
├── backend/         ← existing Express API, extended (unchanged structure)
├── packages/
│   ├── ui/          ← shared design-system components (extracted from components/ui)
│   ├── types/       ← shared API/domain types (from frontend/types + backend)
│   ├── auth/        ← shared client auth helpers (useAuthGuard, client-api)
│   ├── validation/  ← shared Zod schemas (mirrors backend validators)
│   ├── config/      ← siteConfig, domain env resolution, design tokens
│   └── utils/
├── prisma/          ← single schema.prisma (moved from backend/prisma) + migrations
└── docs (*.md)
```
Tooling: **Turborepo + npm workspaces** (lightweight; no new runtime infra). Each app deploys independently to Vercel; backend to Render/Railway; DB stays on Supabase.

- **Pros:** clean separation, independent deploys, small per-app bundles (public site never ships admin/HR code), better security isolation, shared code via packages.
- **Cons:** one-time migration (move `frontend` → `apps/website`, hoist `prisma`, extract packages incrementally), slightly more tooling.

**Option B — Single Next.js app with host-based (subdomain) routing.**
One app, `middleware.ts` inspects the `Host` header and rewrites to route groups `(website)`, `(training)`, `(intern)`, etc.
- **Pros:** zero migration, one deploy.
- **Cons:** the public marketing site bundles admin/HR/LMS code and shares one security surface and one deploy; route organization grows complex; harder to reason about per-portal auth. Not ideal for six distinct audiences.

**Recommendation:** **Option A (Turborepo monorepo)**, executed incrementally so nothing breaks:
1. Add Turborepo + workspaces at the root; move `frontend/` → `apps/website/` (path move only, no logic change).
2. Hoist `backend/prisma` → root `prisma/` (Prisma supports this via `schema` path; keep `DATABASE_URL`/`DIRECT_URL` unchanged).
3. Scaffold `apps/training`, `apps/intern`, `apps/employee`, `apps/admin` one at a time (per implementation phase), extracting shared code into `packages/` only when a second app actually needs it (avoid premature abstraction).

This honors "extend, don't rebuild" and "don't over-engineer": the existing website and API move essentially intact, and shared packages are extracted lazily.

> This repository-architecture choice is the one foundational decision worth confirming before migration begins (see the question posed after this document). Everything downstream assumes Option A.

---

## 4. Central data-flow

```
 globalantic.com   training.globalantic.com   intern.…   employee.…   admin.…   trainer.…
   (website)            (training)             (intern)   (employee)   (admin)   (deferred)
        \____________________\___________________|____________|__________/________/
                                        |
                         HTTPS (fetch, credentials: 'include')
                                        |
                          Central Node.js + Express REST API
                    Helmet · CORS allowlist · rate limit · Zod · JWT · RBAC
                                        |
                                     Prisma
                                        |
                              Supabase PostgreSQL
                                        |
                External services (backend-only): Resend · Razorpay · Cloudinary
```

- All six front-ends are thin: they read via server components / API and mutate via credentialed `fetch`. None touches the DB or external secrets directly.
- The API enforces **authentication + role + ownership** on every protected route.
- Razorpay/Resend/Cloudinary keys live only on the backend.

---

## 5. Centralized authentication & RBAC

Extends the existing auth (does not replace it).

- **Login** (`POST /api/auth/login`) verifies email/phone + password + **account status** + role, issues a JWT, and sets the httpOnly cookie. JWT payload gains `role` (already present) and we stop returning the token in the body (audit L7).
- **Cookie across subdomains:** set `Domain=.globalantic.com`, `Secure`, `HttpOnly`, `SameSite=Lax` (all portals are same-site under one parent domain, so `Lax` works and is safer than `None`). One login is valid across all `*.globalantic.com` portals; the **portal each user may enter is decided by role**, not by a separate cookie.
- **Per-portal access:** each portal calls `GET /api/auth/me`; the backend returns the user + role; the portal allows entry only for its permitted roles, and the API independently rejects cross-portal data access (e.g. an `EMPLOYEE` hitting intern endpoints → 403).
- **Server-side guard (fixes audit H1):** each Next.js portal adds `middleware.ts` that checks the cookie and redirects unauthenticated users before rendering — defense in depth on top of the API checks.
- **RBAC model:** roles on `User.role` (expanded enum) plus an optional fine-grained `Permission` layer for staff. Ordinary admins cannot self-escalate to `SUPER_ADMIN` (enforced server-side). See `ROLE_PERMISSION_MATRIX.md`.
- **Ownership checks:** every intern/employee resource query is scoped to `userId = req.user.sub` unless the caller has an authorized staff role. This is mandatory (audit + §45 of the brief).

---

## 6. Payment flow (Razorpay, backend-verified)

```
Intern/Applicant → "Pay Now"
      → backend POST /api/payments/order  (creates Razorpay order, stores PaymentOrder=CREATED)
      → Razorpay Checkout (frontend, test mode first)
      → Razorpay webhook → backend POST /api/payments/webhook
             · verify X-Razorpay-Signature (HMAC-SHA256 with webhook secret)
             · idempotency guard (ignore duplicate paymentId/event)
             · update Payment=SUCCESS/FAILED, PaymentOrder status
             · update Fee balance / Admission status → CONFIRMED
             · generate Invoice/receipt
             · Resend email (payment success + receipt)
             · on admission confirmation: auto-create Enrollment + intern account activation email
```
**Never** mark a payment successful from the frontend callback; the webhook + signature verification is the source of truth. Statuses: `CREATED → PENDING → SUCCESS | FAILED | REFUNDED`.

---

## 7. Domain & environment configuration

No production URLs are hardcoded. New public env vars (per app, and mirrored where needed):
```
NEXT_PUBLIC_MAIN_DOMAIN
NEXT_PUBLIC_TRAINING_DOMAIN
NEXT_PUBLIC_INTERN_DOMAIN
NEXT_PUBLIC_EMPLOYEE_DOMAIN
NEXT_PUBLIC_ADMIN_DOMAIN
NEXT_PUBLIC_TRAINER_DOMAIN
NEXT_PUBLIC_API_URL
```
Backend gains: `COOKIE_DOMAIN` (e.g. `.globalantic.com`), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, plus the existing Resend/Cloudinary keys. CORS `FRONTEND_URL` becomes the comma-separated list of all portal origins (the code already supports a comma-separated allowlist).

> Audit reminder: the real secrets currently sitting in `backend/.env.example` must be rotated and replaced with placeholders before any of this is pushed.

---

## 8. Email (Resend) & notifications

- Extend the existing `email.service.ts` with reusable templates: admission received/approved, payment success/failed, fee reminder, class reminder, certificate issued, employee onboarding, leave approval, task assignment, **password reset**, account activation.
- Add a lightweight in-app `Notification` model (read/unread) alongside email. WhatsApp/SMS kept future-ready but not built now.
- Escape user input in email HTML (audit M1).

---

## 9. Design system per portal

Shared brand tokens (the existing `globals.css` variables) via `packages/config`, but distinct layouts:
- **website:** premium corporate IT (existing).
- **training:** premium education/career.
- **intern:** clean student dashboard (sidebar + cards; mobile bottom-nav where useful).
- **employee:** professional HR dashboard.
- **admin:** dense SaaS admin (tables, filters, charts where useful).
Components use CSS Modules; shared primitives live in `packages/ui`. Every portal is responsive (320→1920) — a known audit gap to verify in-browser.

---

## 10. Implementation sequencing (maps to the brief's phases)

Phase 1 (this doc + `ROLE_PERMISSION_MATRIX.md` + `SCHEMA_EXTENSIONS_PROPOSAL.md` + `ONLINE_WORKFLOW.md`) → 2 monorepo scaffolding → 3 schema extension (after approval) → 4 RBAC auth → 5 training site → 6 admission → 7 Razorpay → 8 intern portal → 9 LMS → 10 attendance → 11 assignments/tests → 12 fees/invoices/certificates → 13–16 employee portal → 17 admin management → 18 notifications → 19 reports/export → 20 security/audit logs → 21 subdomains → 22 responsive → 23 testing → 24 deploy. Each phase ends with `lint` + `build` (both apps) and real flow testing — no feature is "done" because the UI exists.

---

## 11. What this plan deliberately avoids

Microservices, Kubernetes, message queues, Redis, event sourcing, and third-party LMS/ERP/HRMS platforms — none are needed for this scope and all add solo-maintenance burden. The whole system stays on the current, understandable stack.
