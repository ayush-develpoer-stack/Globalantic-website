# Training Module — Pre-implementation Audit

**Date:** 2026-10-15 · **Scope:** everything the training ecosystem needs (public site, student portal, trainer portal, admin training management, payments, referrals). This audit is based on the code itself; the earlier docs were only used for cross-reference.

## 1. How the repository is actually laid out

The repository uses npm workspaces and Turborepo. It is not under git, and the folder is synced by OneDrive. The apps sit at the root, not under `apps/`. Decision D-1 in `CURRENT_PROJECT_AUDIT.md` was to keep that layout, so this work keeps it:

| Prompt target | Real path | State before this work |
|---|---|---|
| `apps/training` | `training/` (port 3001) | Placeholder: one static page and a 7-line token CSS file |
| `apps/intern` | `intern/` (3002) | Placeholder |
| `apps/admin` | `admin/` (3004) | Placeholder. The working admin (CMS and leads) lives in `frontend/app/admin` |
| `apps/trainer` | `trainer/` (3005) | Placeholder |
| backend | `backend/` (Express 4, Prisma 5.22, Zod, JWT cookie) | Working: CMS, lead capture, admin login |
| shared | `packages/{auth,config,types,ui,utils,validation}` | Stubs only. `types` and `auth` use role names (`INTERN`, `SUPER_ADMIN`, …) that do not exist in the DB |

## 2. Findings by area

| Area | Status | Evidence |
|---|---|---|
| Prisma schema | **Partial** | 14 models. The only training model is `TrainingApplication`, a lead form with no course, batch or user link. `Role` is `ADMIN \| EDITOR` only |
| Migrations | Complete for the current schema | `20260921043321_init`. `prisma migrate status` against Supabase on 2026-10-15 reported **up to date** (DB reachable) |
| Courses / batches / enrollment / attendance / assignments / results / certificates | **Missing** | No models, routes or UI |
| Student accounts | **Missing** | `User` exists for admins only. There is no register, email-verification or password-reset route |
| Auth | **Partial, with a security gap** | bcrypt(12), httpOnly cookie, `secure` in production, `strictLimiter` on login. **But:** the JWT is stateless (7d), so logout only clears the cookie and a stolen token stays valid. There is no account status/suspension, and `requireAdmin` is a single role check with no granular permissions |
| CORS | OK | Allow-list from `FRONTEND_URL`. Portals on other ports were not allowed in dev |
| Rate limiting | Partial | Global 300/15 min. A strict 20/15 min on login and forms. Nothing per account |
| Payments | **Missing** | Razorpay variables are listed in `turbo.json` only. No code, no models, no keys in `.env` |
| Referral | **Missing** | No code: a search for `referr` matches only `noreferrer` |
| Notifications / email | Partial | Resend wrapper with HTML templates. It is a no-op (with a warning) when `RESEND_API_KEY` is unset |
| File upload | Missing | Cloudinary variables exist, but no upload code does |
| Theme | **Complete in `frontend/` only** | Semantic tokens, no-flash script, provider and toggle, contrast checker. The portals had a hard-coded light palette |
| API client / services | Complete in `frontend/` only | `lib/api/http.ts` plus mock/api services. Not shared |
| Tests | Partial | backend: 1 file (validation for lead filters). frontend: node:test suites. No DB-backed tests and no local DB |
| Docs | Many, mostly accurate for the CMS. Training docs describe plans, not code |

## 3. Security observations relevant to training

1. **`backend/.env.example` contained the same live values as `.env`** (DATABASE_URL, RESEND_API_KEY, CLOUDINARY_API_SECRET, SEED_ADMIN_PASSWORD). It has now been sanitised to placeholders (see IMPLEMENTATION_STATUS). **The credentials still need rotating**, because they may have been synced or shared via OneDrive.
2. Stateless JWT with no revocation: fixed by adding a server-side `Session` table (see SECURITY.md).
3. `next@14.2.x` in all six apps has published critical advisories, fixed only in Next ≥ 15.5.x (React 19). This is a major upgrade, so it was **not** done here. It still needs your approval (D-3).
4. No ownership model existed, because there were no student or trainer resources yet.

## 4. Constraints taken from earlier sessions

- One solo maintainer, so no new infrastructure: no Redis, queues or SDK-heavy integrations. Razorpay is called over plain HTTPS and verified with Node `crypto`.
- Never fabricate business data. Real fees are not confirmed (D-9), so the public site shows real API data and genuine empty states. A demo seed exists **only** for local throwaway databases and refuses to run anywhere else.
- Never expose backend secrets to the frontends.

## 5. Plan derived from this audit

1. Additive Prisma migration: new enums and models, plus nullable or defaulted new columns on `users`. No drops and no renames.
2. Backend training domain: services, then controllers, then routes. RBAC permission map, ownership checks, audit log, payment provider abstraction, idempotent webhook, referral engine.
3. Shared packages: `@globalantic/types` (DTOs and enums), `@globalantic/api-client` (fetch client and typed endpoints), `@globalantic/ui` (tokens, theme and primitives).
4. Build the four apps on those packages.
5. DB-backed tests on an **embedded throwaway Postgres** (`embedded-postgres`, dev-only). They never touch Supabase.
6. Documentation.
