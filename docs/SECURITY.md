# Globalantic — Security

**Updated:** 2026-10-15 (training platform). Each control below is verified by the backend test suite unless marked otherwise. See `TESTING.md`.

## Preserved controls
- **Helmet** security headers. **CORS** allow-list from `FRONTEND_URL` (comma-separated) with credentials. Outside production any `http://localhost:<port>` origin is also accepted so all portals work in dev.
- **Zod** validation on every write and on list query strings. Unknown keys are stripped, so clients cannot inject `status`, `amountPaise`, `studentId` and similar fields. Bodies are limited to 1 MB.
- **bcrypt** (12 rounds). Prisma parameterised queries. The few `$queryRaw` calls use tagged templates (parameterised) for row locks and counters.
- Central error handler: no stack traces or Prisma internals in responses (tested).

## Authentication & sessions (new)
| Control | Implementation | Test |
|---|---|---|
| Server-side sessions | JWT carries `sid`. `requireAuth` loads the `Session` row and rejects it if revoked, expired, the user is suspended or soft-deleted, or the session is missing. The role comes from the DB. | auth.test `logout revokes…`, `forged / tampered tokens…`, `role changes apply immediately` |
| Logout | Revokes the session (a copied token stops working) | ✓ |
| Suspension / password reset / password change | Revoke all (other) sessions | ✓ |
| Cookie | `globalantic_token`, httpOnly, `Secure` in production. `SameSite` comes from `COOKIE_SAMESITE`, default **`lax`**: correct when the API and portals share a site (`api.`/`training.`/`admin.globalantic.com`) and it blocks cross-site form-POST CSRF. Use `none` only if the API is hosted on a different site; `none` forces `Secure`. `COOKIE_DOMAIN=.globalantic.com` shares the cookie across subdomains. | cookie flags asserted |
| JWT | HS256 pinned (`algorithms: ['HS256']`) | — |
| Brute force / abuse | **Separate** limiter instances (separate counters): `loginLimiter` 20/15 min per IP, `loginAccountLimiter` 10/15 min per account, `authFlowLimiter` 10/15 min (register, verify, resend, forgot/reset/change password; use it for any future OTP endpoint), `formLimiter` 20/15 min (public forms), `lookupLimiter` 60/15 min (referral and certificate lookups), `apiLimiter` 300/15 min. | hardening.test |
| Login response | Only `{id,name,email,role,emailVerified}`. The session token is **not** in the body (cookie only). | hardening.test |
| Timing | Unknown emails still run a bcrypt compare against a dummy hash | — |
| Account enumeration | Login errors are generic. Register, forgot-password and resend always return the same response. The real owner is emailed instead ("you already have an account" / "phone already linked"). | auth.test `registration does not reveal…`, `password reset…` |
| One-time tokens | 32-byte random. Only the SHA-256 hash is stored. Single-use, consumed atomically. Verify: 24 h, reset: 1 h, invite: 24 h. | replay tests |
| Email verification required | Before applying for admission | ✓ |

## Authorization
See `ROLE_PERMISSION_MATRIX.md`. All routes are protected on the server: `requireAuth` plus `requirePermission`, with ownership checks inside the services. IDOR attempts return 404 (tested for applications, payments, invoices, attendance, assignments, certificates, trainer batches).

## Payments
- Amounts are always read from the DB fee snapshot. The client never sends an amount (any extra fields are stripped, and this is tested).
- Checkout signature uses HMAC-SHA256(`order_id|payment_id`, key secret) with a **constant-time compare**, **plus** a re-fetch of the payment from Razorpay (status, amount, currency, order id must match).
- Webhook: HMAC over the **raw body** (`express.raw` is registered before the JSON parser). The event id is stored with a unique constraint, so replays are ignored and tampered bodies are rejected (tested). Permanent rejections are recorded. Transient failures delete the event row so the provider retries.
- `providerOrderId` and `providerPaymentId` are unique. One code path (`markPaidTx`) runs under a row lock (`SELECT … FOR UPDATE`), so checkout and webhook races are idempotent. A second paid payment for the same application is flagged `DUPLICATE_PAYMENT_REFUND_REQUIRED` and never enrolls or rewards twice.
- An invoice or receipt is created only after verified payment. Refunds void the invoice and cancel unpaid referral rewards.
- No simulated success: without Razorpay keys every payment call returns 503.
- Offline payments need the ADMIN-only `payments.record_offline` permission, a reference and a reason. They are audited and their referral reward always goes to manual review.
- Secrets never reach the browser: only `keyId` and `orderId` are returned. Provider error bodies are not forwarded or logged.

## Referral programme
See `REFERRAL_SYSTEM.md`. Self-referral (same account, canonical email alias, or same phone), duplicate rewards (unique constraints plus `ON CONFLICT DO NOTHING`), reward approval by the referrer, client-set amounts, and approval inside the refund window are all blocked and tested.

## Error responses
- Malformed JSON → 400, body too large → 413, CORS-rejected origin → 403, Prisma query-shape errors → 400, database unreachable or schema not migrated → 503. Unexpected errors → 500 "Something went wrong". Details are logged on the server only, in every environment.
- `GET /health` = readiness (runs `SELECT 1` with a 3 s timeout; 200 or 503; no connection details). `GET /health/live` = liveness (no DB).

## Input & output safety
- Links (materials, submissions, thumbnails) must be `https://`. `javascript:`, `data:` and `http:` are rejected (tested).
- Email templates HTML-escape user input via `esc()`. This also fixes the earlier audit finding M1 for the existing contact/training emails.
- Post-login redirects accept only internal paths (`safeNext`) to prevent open redirects.
- Trainer CSV export neutralises spreadsheet formula injection.
- IPs are stored only as keyed hashes (`HASH_SALT`).

## Proxy / IP trust
`app.set('trust proxy', 1)`: `req.ip` comes from the right-most `X-Forwarded-For` entry added by **one** proxy hop. Keep exactly one trusted proxy in front of the API (Render/Railway/Nginx). Otherwise per-IP rate limits and the referral IP signals can be spoofed.

## Known risks / open items
1. **Rotate credentials.** `backend/.env.example` previously contained the same live values as `.env` (DATABASE_URL, RESEND_API_KEY, CLOUDINARY_API_SECRET, SEED_ADMIN_PASSWORD). It now contains placeholders, but the old values must be **rotated**: they were stored in a OneDrive-synced folder.
2. **Next.js 14.2.x advisories** (all six apps). Fixed only in Next ≥ 15.5 (React 19). This is a major upgrade that needs approval.
3. The per-account login limiter can be abused to lock a known account out for 15 minutes (accepted trade-off). It is in-memory, so with several API instances use a shared store.
4. File uploads are **not** implemented. Materials and submissions are https links. Cloudinary signed uploads are a follow-up.
5. Postgres RLS is not enabled on Supabase. All access goes through the API with the service connection string, which therefore must stay secret.

## File uploads (added 2026-10-15) — `backend/src/services/file.service.ts`
- **Type from content, not names:** magic-byte detection; allow-list PDF / PNG / JPEG / WEBP. Executables, HTML, SVG and anything else → 400, whatever the extension or `Content-Type` (tested with an `.exe` renamed to `.pdf`).
- **Size:** `UPLOAD_MAX_BYTES` (5 MB) enforced by the body parser (413) and re-checked.
- **Safe names:** files are stored under a random 128-bit hex key (`UPLOAD_DIR/ab/<key>`, mode 600). The client file name is display-only: path segments and control/reserved characters are stripped, and the extension is replaced by the detected type.
- **Private:** never served statically. `GET /api/files/:id` re-checks ownership or a relationship (assigned trainer, HR, admissions permission) on every request; anything else gets 404. Responses are `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`.
- **Attachment integrity:** a file can only be attached by its uploader, for its declared purpose, and once (tested). A SHA-256 is stored for every file.
- Production refuses uploads (503) until `UPLOAD_DIR` is configured. Use a persistent, backed-up disk. Not yet implemented: antivirus scanning, retention clean-up of unattached uploads.

## Employee data
`/api/employee/*` is scoped to the caller. Teammates are exposed only as names and roles within shared projects. HR-only endpoints need `employees.*` permissions. HR cannot approve their own leave or answer their own HR request. Attendance corrections, profile changes and document visibility changes are audited with a reason. Role changes (`/api/platform/users/:id/role`) can never grant ADMIN, change an ADMIN, change one's own role or convert a student, and they revoke the user's sessions.

## Mock data
The main site uses mock fixtures **only** when `NEXT_PUBLIC_DATA_SOURCE=mock` is set explicitly. The default is the real API in every environment.

## Final integration pass (2026-10-15)
- **Individual permission grants** (`user_permission_grants`):
  - ADMIN only (`users.manage`); only for EDITOR, FINANCE and HR accounts; never for oneself.
  - Never grantable: `users.manage`, `referrals.settings`, `payments.record_offline`, `audit.read` and portal permissions. Unknown or ineligible stored values are ignored at check time (`effectivePermissions`).
  - Grants load with the session on every request, so revocation is immediate.
  - Every grant and revocation is audited with a reason.
- **Security audit events:**
  - sign-in success, failure and blocked (unknown accounts are recorded by email *hash* only);
  - logout;
  - every permission denial (`security.forbidden`, with the missing permission and route);
  - invalid webhook signatures;
  - report exports (`report.exported`, with type, range and row count; never the data);
  - role changes, grants, user edits, admin-initiated password resets and note changes.
- **Admin password resets** send the normal single-use reset link. Admins never see or set passwords, can optionally revoke all sessions, and cannot reset other ADMIN accounts.
- **Public images:** only the `COURSE_IMAGE` / `CMS_IMAGE` purposes, images only (PNG/JPEG/WEBP, magic-byte checked), uploaded by `training.courses.manage` / `cms.manage`. Served from `/api/files/public/:id` with nosniff and a sandbox CSP. Private purposes always 404 there. Course image fields accept only https URLs or this API's public image URLs (`PUBLIC_API_URL`).
- **Validation errors** now return 422 with field errors; internals are never included.
