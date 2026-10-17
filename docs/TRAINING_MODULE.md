# Training Module — Architecture & Flows

## Layout (existing monorepo; apps stay at the root, decision D-1)

| App | Path | Dev port | Audience | Talks to |
|---|---|---|---|---|
| Public training site | `training/` | 3001 | everyone (SEO, SSR) | `/api/training/*`, `/api/auth/*`, student apply |
| Student / intern portal | `intern/` | 3002 | STUDENT | `/api/training/student/*` |
| Admin (training) | `admin/` | 3004 | ADMIN, FINANCE | `/api/training/admin/*` |
| Trainer portal | `trainer/` | 3005 | TRAINER | `/api/training/trainer/*` |
| API | `backend/` | 4000 | — | PostgreSQL via Prisma |
| Corporate site + CMS admin | `frontend/` | 3000 | unchanged | `/api/*`, `/api/admin/*` |

Shared packages (TypeScript source, consumed via `transpilePackages`):
- `@globalantic/types`: enums, DTOs and the `Permission` union (drift-tested against Prisma).
- `@globalantic/api-client`: the only HTTP client (`api()`), typed endpoint functions, `ApiError`, `fieldErrorMap`.
- `@globalantic/ui`: design tokens (`styles/globals.css`, copied from the main site), no-flash theme, primitives, `PortalShell`, `RequireSession`, `LoginForm`, formatting and hooks.
- `@globalantic/auth`: portal-to-role map (UI gating only).

There is no business logic in the UI. Amounts, statuses, eligibility and permissions are decided in `backend/src/services/*`.

## Backend structure
```
backend/src
  lib/        permissions, audit, counters, crypto, identity (email/phone normalisation), pagination
  middleware/ auth (session-backed), rate limits, validation
  services/   catalog, admission, payment(+gateway), referral, learning (trainer), student,
              certificate, admin-training, notification (+after-commit emails), auth, training-email
  routes/     training.public, student, trainer, admin.training, auth (+ existing CMS routes)
  validators/ training.ts (Zod)
```

## Admission → payment → enrollment
1. The visitor browses `/courses` and a course page, then picks a batch with seats, status and deadline from the API.
2. `/register?ref=CODE` → `POST /auth/register` returns a generic 202 and sends a verification email. Duplicates are silently refused, and the owner is emailed.
3. They verify their email via the link, then sign in.
4. `/apply?batch=ID` → `POST /training/student/applications`. The server checks a verified email, the batch exists and is OPEN, the deadline, seats, and that there is no duplicate for that batch or course. It snapshots the fee from the DB and sends a notification and email.
5. An admin reviews: under review, then approve (reserves a seat; zero-fee enrolls now) or reject with a reason.
6. The student pays in the portal: `payments/order` → Razorpay Checkout → `payments/verify` (HMAC check plus provider re-fetch). Webhooks are processed in parallel and idempotently.
7. The verified payment creates the invoice/receipt, enrollment ENROLLED, referral progress, and a notification and email.
8. Learning follows: timetable, attendance, assignments, assessments and results, feedback, announcements.
9. A certificate is issued by an admin only when eligible: completed, attendance at or above the course minimum, every FINAL passed, fee settled. It is publicly verifiable by code.

## Notifications
In-app `notifications` rows are always written in the same transaction as the event. An email copy (Resend) is sent **after commit**, best-effort. Without `RESEND_API_KEY` emails are skipped with a warning, and in dev the verification/reset token is printed to the API console.

## Theme
Every app imports `@globalantic/ui/styles/globals.css`. The tokens are identical to the main site, with light and dark values. `ThemeScript` sets `data-theme` before first paint; `ThemeProvider` follows the OS until the user chooses, then persists the choice in `localStorage` (`globalantic-theme`). Components use semantic variables only.

## Running locally
```bash
npm install
npm --workspace backend run dev:db -- --seed      # embedded Postgres + [DEMO] data (local only)
# in another terminal (PowerShell: $env:DATABASE_URL="..."):
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54320/globalantic_dev npm --workspace backend run dev
npm run dev:training   # :3001
npm run dev:intern     # :3002
npm run dev:admin      # :3004
npm run dev:trainer    # :3005
```
The demo accounts are `admin@`, `finance@`, `trainer@`, `student@` and `student2@example.test`, all with password `DemoPass123`. They exist **only** in the local database.

## Configuration
Backend: `JWT_SECRET`, `DATABASE_URL`/`DIRECT_URL`, `HASH_SALT`, `FRONTEND_URL` (every portal origin), `TRAINING_URL`, `INTERN_PORTAL_URL`, `COOKIE_DOMAIN`, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`/`RESEND_FROM_EMAIL`.

Apps (public values only): `NEXT_PUBLIC_API_URL`, plus portal URLs (`NEXT_PUBLIC_TRAINING_URL`, `NEXT_PUBLIC_INTERN_PORTAL_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TRAINER_URL`). See each app's `.env.example`.
