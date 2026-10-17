# Environment Configuration (2026-10-17)

Secrets live only in `backend/.env` (local) or the backend host's environment (production). The frontends read only `NEXT_PUBLIC_*` values, which are baked in at build time.

## Backend (`backend/.env`)
"Required in prod" means the server refuses to boot with `NODE_ENV=production` if the value is missing (`requiredStrict` in `backend/src/config/env.ts`).

| Variable | Required in prod | Local `.env` | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | set (Supabase pooler) | runtime queries |
| `DIRECT_URL` | for migrations | set | `prisma migrate deploy` |
| `JWT_SECRET` | **yes** | set | session tokens |
| `HASH_SALT` | **yes** | **missing** | hashing of IPs and identifiers. Prod boot fails without it |
| `NODE_ENV`, `PORT` | — | `development`, `4000` | |
| `FRONTEND_URL` | yes, in practice | `http://localhost:3000` | CORS allow-list (comma-separated). In production, list every portal origin |
| `TRAINING_URL`, `INTERN_PORTAL_URL`, `EMPLOYEE_PORTAL_URL`, `ADMIN_PORTAL_URL`, `PUBLIC_API_URL` | for emails and links | missing (dev defaults) | links in emails and PDFs |
| `COOKIE_DOMAIN`, `COOKIE_SAMESITE` | prod: `.globalantic.com`, `lax` | missing | one login across subdomains |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL` | for email | set | email. The sending domain must be verified in Resend |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | for payments | **missing** | without them, payment initiation returns 503 (never a fake success) |
| `UPLOAD_DIR`, `UPLOAD_MAX_BYTES` | for uploads | missing (dev default) | needs a persistent disk in production |
| `CRON_SECRET` | for CRM reminders | missing | protects the reminder endpoint |
| `BUSINESS_WHATSAPP` | optional | missing | |
| `CLOUDINARY_*` | optional | set | |
| `MIGRATIONS_DIR` | optional (new) | — | only if the deploy does not ship `prisma/migrations` at the repo root. Otherwise `/health` reports `schema:"unknown"` |

`backend/.env.example` now holds placeholders (checked 2026-10-17). Whether the credentials that used to appear there were rotated could not be verified from here. If they weren't, rotate them in Supabase, Resend and Cloudinary.

## Frontends
| App | Variable | Dev value (`.env.development`) | Production |
|---|---|---|---|
| all six | `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | `https://api.globalantic.com/api`. If missing, the clients show "not configured to reach the server" instead of calling localhost |
| frontend | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DATA_SOURCE` | `api` | `api` (mock only if explicitly `mock`) |
| training | `NEXT_PUBLIC_TRAINING_URL`, `NEXT_PUBLIC_INTERN_PORTAL_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TRAINER_URL`, `NEXT_PUBLIC_MAIN_SITE_URL` | localhost ports | the subdomains |
| frontend, training | `ALLOW_INDEXING` / `VERCEL_ENV` | — | controls robots/indexing (see SEO docs) |

All six apps' local values agree with the backend port (4000). There is no URL or port mismatch.

## External state verified on 2026-10-17
- Supabase: reachable. Its 3 pending migrations were **applied 2026-10-17** with the owner's approval; the schema now matches exactly (see `LOCAL_DATABASE_SCHEMA_AUDIT.md`).
- The only database configured anywhere is in `backend/.env`, and it is the shared Supabase project. Local development therefore reads and writes production data. For isolated work, use `npm run dev:db` and point a shell's `DATABASE_URL`/`DIRECT_URL` at it.
- `api.globalantic.com`: **does not resolve (NXDOMAIN).** The backend is not deployed publicly.
- `globalantic.com` / `www`: serve an older static HTML site from Hostinger (`server: hcdn`). It is not this repository's Next.js app and does not call this API.
