# Backend Connection Audit

## Update 2026-10-17 — connection audit after the second "Service temporarily unavailable" report
Root cause and fixes: `ROOT_CAUSE_AND_FIXES.md`. Endpoint results: `API_ENDPOINT_TEST_REPORT.md`. Variables: `ENVIRONMENT_CONFIGURATION.md`.

### Request-flow map
```
Main site (frontend/, Next 15)    services/* -> lib/api/http.ts --------------\
Training, intern, employee,       @globalantic/api-client (packages/) --------+--> NEXT_PUBLIC_API_URL (dev http://localhost:4000/api)
admin, trainer portals            (server components forward the Cookie)      |
                                                                              v
backend/src/server.ts -> app.ts: helmet -> CORS allow-list (FRONTEND_URL; any localhost in dev)
  -> /api/payments/razorpay/webhook (raw body, HMAC) -> json/cookie parsers -> apiLimiter
  -> routers: /api/auth, /api/training/{student,trainer,admin,public}, /api/exams/{student,admin},
     /api/crm, /api/programs/{student,admin,public}, /api/documents, /api/employee, /api/hr,
     /api/platform, /api/files[/public], /api (public site), /api/admin (CMS)
  -> middleware: requireAuth (JWT cookie + sessions row) -> permission checks -> zod validate
  -> controllers -> services -> Prisma (config/database.ts) -> Supabase Postgres (DATABASE_URL)
                                     \-> Resend (email), Razorpay REST, local UPLOAD_DIR
  -> errorHandler: ApiError / Zod 422 / P2002 409 / P2025 404 / P1001.. & P2021/P2022 503 / 500
Health: /health/live (process), /health (DB + schema version, 503 if either is not ready)
```

### Findings
| Layer | Status |
|---|---|
| Frontend base URLs | ✅ All 6 apps use `NEXT_PUBLIC_API_URL` = `:4000/api` in dev, and the backend runs on 4000. A production build without the variable fails with a clear message, never calls localhost. There is no duplicate hard-coded URL outside the config fallbacks |
| API clients | ✅ Two clients (main site and shared package). Both: credentials included, 15 s timeout, distinct messages for network, timeout and server errors, one GET retry on 502–504, no retry of writes. Kept as they are |
| CORS / auth / cookies | ✅ Verified locally: login sets the cookie, `/auth/me` returns 200, logout leads to 401, a student hitting an admin route gets 403 |
| Database connectivity | ✅ Supabase is reachable |
| **Database schema** | 🔴 **3 migrations behind**: 23 of 83 models fail with P2021/P2022, giving 503 on services, blog, portfolio, settings, programs, landing pages, contact/CRM and payments |
| Health endpoint | 🔴→✅ It reported healthy despite the drift. It now checks the schema version |
| Public deployment | 🟡 `api.globalantic.com` does not resolve. `globalantic.com` is an older static site on Hostinger |

---

## Original audit (2026-10-15)

**Date:** 2026-10-15. The audit looked at the actual code (grep sweep for mock, fixtures, TODO/FIXME, placeholder, console.log, localStorage CRUD, direct fetch), then checked behaviour against a running API.

**Verification environment:** local embedded PostgreSQL with all migrations applied plus the production content seed (`prisma/seed.ts`). The API ran on :4100 and the apps on 31xx, in headless Microsoft Edge. Supabase was **not** used: at the time the training and employee migrations were not applied there (they were applied 2026-10-15; see DEPLOYMENT.md).

Legend: ✅ connected and verified · 🟡 requires external configuration · 🔴 blocked

## Sweep results
| Search | Finding | Action |
|---|---|---|
| TODO / FIXME | none | — |
| `console.log` | `backend/src/server.ts` startup messages only | kept (operational) |
| Mock / fixtures | `frontend/lib/mock/*`, used by `frontend/services/*` (main site) | **Default changed to the real API.** Mock now runs **only** with `NEXT_PUBLIC_DATA_SOURCE=mock` (explicit local demo). Before, dev silently used mock data. |
| Swallowed errors | `contentService.safe()` returned `null` on any failure | Now logs non-404 failures on the server, so outages are visible. Pages still degrade gracefully. |
| Direct `fetch` in components | none. All portals use `@globalantic/api-client`; the main site uses `lib/api/http.ts` | — |
| localStorage-only CRUD | none (localStorage only for theme and a referral-code convenience) | — |
| Placeholder apps | `employee/` was an empty shell with **no backend** | **Built** (backend + portal + HR admin) |
| File uploads | none existed | **Built:** private storage with ownership checks |
| `npm run prisma:seed` | **broken** (`bcryptjs` / `dotenv` not resolvable from `prisma/`) | Fixed; verified by seeding the local DB |

## Module status

### Main website (`frontend/`)
| Feature | Status | Evidence |
|---|---|---|
| Services, solutions, industries, portfolio, blog, FAQs, settings | ✅ | Pages rendered DB content in API mode (`/services/web-development` → "Web Development" from DB) |
| Contact form | ✅ | Browser submit → `POST /api/contact` **201**; the lead appears in CMS admin |
| Training lead / careers / newsletter forms | ✅ (same service and endpoints; API tests) | Not individually clicked in the browser |
| CMS admin login, dashboard, leads, CMS lists | ✅ | Browser: `/api/auth/login` 200, `/api/admin/dashboard` 200, `/api/admin/contacts` 200 showing the new lead, `/api/admin/services` 200 |
| Site settings (SEO defaults) | ✅ | Existing `/api/admin/settings`; `/api/settings` public |

### Training website, student portal, trainer portal, admin training
All four apps call the real API exclusively (connected in the previous session; see TESTING.md).

| Feature | Status |
|---|---|
| Courses, batches, availability, registration, admission, login, profile, enrollment, fees, invoices, payment status, notifications, referral dashboard | ✅ (API tests + browser checks) |
| Payments (Razorpay) | 🟡 needs keys. The flow is tested with real HMAC and a provider double. Without keys it returns **503**, never a fake success. |
| Email (Resend) | 🟡 needs a verified domain; in-app notifications work without it |
| **New: assignment file upload** (student) / **download** (assigned trainer) | ✅ API tests (ownership, type sniffing); UI compiled. Not clicked in a browser. |
| **New: admission supporting document** | ✅ API tests; UI compiled. Not clicked in a browser. |

### Employee portal (`employee/`) — new
| Feature | Status | Evidence |
|---|---|---|
| Profile (emergency contact editable only), password change | ✅ | API tests + browser |
| Attendance check-in / check-out, monthly history | ✅ | API (live): check-in 201; dashboard shows "Present · In 2:32 pm" |
| Leave apply / cancel / status | ✅ | API (live): leave 201; it appears in admin Leave as Pending |
| Tasks (status only), projects (members only), work updates | ✅ | API tests |
| Documents (download own visible docs) | ✅ | API tests |
| HR requests, company announcements | ✅ | API tests |

### Admin (`admin/`)
| Feature | Status |
|---|---|
| Courses, batches, trainers, students, admissions, enrollments, fees, invoices, payments, referrals, certificates, support, announcements, audit log | ✅ (previous session) |
| **New:** employees (create via invite, edit, attendance correction, documents with private upload), leave approvals, projects and tasks, work updates, HR requests, company announcements | ✅ API tests; browser render of employees, leave, users and reports |
| **New:** users and roles (role change with escalation guards), roles/permission matrix, reports summary (CSV export) | ✅ API tests + browser render |
| Notifications | ✅ system-generated per event; staff broadcast via announcements |
| System settings | ✅ site settings in the CMS admin; referral settings in admin → Referrals |

## Remaining items
| Item | Classification |
|---|---|
| Supabase lacks migrations `20261015090000_training_platform` and `20261016090000_employee_portal_and_files` | ✅ Resolved 2026-10-15: all migrations applied on Supabase after a backup and rehearsal (see DEPLOYMENT.md, incident). |
| Razorpay keys, Resend domain, `UPLOAD_DIR` persistent storage in production | 🟡 external configuration |
| Credential rotation (old `.env.example` values) | 🔴 security risk until rotated |
| Next.js 14 advisories | 🔴 security risk; upgrade needs approval |
| Employee payroll / payslip generation | Missing by design. Payslips can be uploaded as documents (category PAYSLIP); no payroll engine. |
| Main-site page titles repeat the brand ("Services \| Globalantic \| Globalantic") | Minor SEO bug, not changed |
