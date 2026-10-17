# Scalability, Security & Testing — Progress Checkpoint

Last updated 2026-10-16. Status: **phase 1 (audit) and the baseline load test are done; remediation has not started**, apart from two small fixes listed below.

The work was paused when the SEO/AEO/GEO request arrived. Resume from "Next steps" below.

## Environment of every measurement here
These are local measurements, not production capacity:
- **Machine:** Windows laptop, 8 logical CPUs, 7.8 GB RAM (about 1.8 GB free during tests).
- **Database:** embedded PostgreSQL 17 on the same machine, with synthetic data (20,000 `SYN-` leads, 50 `load*@example.test` users).
- **API:** compiled API (`node dist/server.js`), a single process, Prisma pool `connection_limit=10`. The API, the database and the load generator (autocannon 7.15) share the same CPU.
- **Not measured:** the network, TLS and the Supabase pooler.

**Nothing below supports any production capacity claim.** It only ranks the bottlenecks.

## Findings so far

### Critical (security)
1. **Next.js 14.2.35 in all six web apps.**
   - Advisories: two *critical* unauthenticated RCE advisories (GHSA-p293-qw3h-jr36 for Windows-hosted servers; GHSA-2xp9-vwfh-vxw4 for Image Optimization with AVIF), plus about ten *high* ones (SSRF, DoS, middleware bypass).
   - There is no patched 14.x release; the fix is ≥ 15.5.24 (current 15.5.28).
   - The upgrade means React 19, async `params`/`searchParams`/`cookies()`, and fetch caching defaults to review in every app. **This is the first remediation item.**
2. `backend/.env.example` → `SEED_ADMIN_PASSWORD` held a 24-character non-placeholder value. It is now replaced with a placeholder. **If that value was ever a real account password, rotate it.**
   - The `DATABASE_URL`/`DIRECT_URL` examples are placeholders, and the other secrets are empty.

### Baseline load results (local)
| Scenario | Conns | Req/s | p50 | p99 | Notes |
|---|---|---|---|---|---|
| `GET /health` (warm) | 20 | 667 | 11 ms | 3.4 s | no DB |
| `GET /api/services` (warm) | 20 | 174 | 76 ms | 7.9 s | the first cold run was 12 req/s (Windows Postgres spawns a process per new connection) |
| `GET /api/services/:slug` (warm) | 20 | 520 | 24 ms | 8.5 s | |
| `GET /api/blog` | 20 | 174 | 31 ms | 4.2 s | |
| `GET /api/crm/leads?page=1` (20k leads) | 20 | 25 | 2.1 s | 9.1 s | **slow**: count + sort + per-row `_count` |
| `GET /api/crm/summary` (20k leads) | 5 | 3 | 7.9 s | 8.8 s | **O(N)**: loads every lead and its activities into memory |
| `GET /api/admin/contacts` (legacy, unpaginated) | 5 | 3 | 7.2 s | 10.5 s | **returns all 20k rows; API RSS 104 → 613 MB** |
| Login burst ×50 (bcrypt cost 12) | 50 | 2.2 logins/s | 20.5 s | 22.3 s | **bcryptjs is pure JS on the event loop**: a login burst stalls every other request |

Unexplained so far: about 8 s p99 tails, plus exactly one socket error per connection in some runs. These may be local artefacts (the sampler spawning PowerShell every 2 s, CPU sharing, or connection teardown). They need re-checking with external sampling before being treated as product behaviour.

**Rate limits work and the internal token does not bypass them:** 30 contact posts from one IP gave 20×201 and 10×429; 25 wrong logins gave 9×401 and 16×429.

### Architecture risks (from code review)
- **Global read limit per IP is a scalability bug.** The global per-IP read limit (`apiLimiter`, 300 requests / 15 min) also applies to SSR/ISR calls from the Next.js servers, which come from a few hosting egress IPs. Under traffic that throttles everyone.
  - **Fixed (API side):** an optional `INTERNAL_API_TOKEN` (≥ 32 chars, constant-time compare). Calls carrying `X-Internal-Token` skip *only* the global read limiter.
  - **Still to do:** send the header from server-side fetches in `frontend/lib/api/http.ts` and `packages/api-client`, server only and never in the browser.
- **Rate-limit counters live in process memory.** With more than one API instance the limits multiply and reset on deploy. A shared store is needed first (Postgres-backed for login/forms is enough; Redis only if measured).
- **Uploads need a single persistent disk.** Uploads (`UPLOAD_DIR`) sit on one disk, which blocks horizontal scaling of the API. Move them to object storage (Cloudinary is already planned, or S3-compatible storage) before adding instances.
- **After-commit side effects run in process.** Emails, receipt PDFs and certificate emails run fire-and-forget: they are lost if the process dies between commit and send. Failures are logged in `email_logs`, not retried. Recommendation: a Postgres-backed outbox/jobs table (`FOR UPDATE SKIP LOCKED` worker), with no new infrastructure.
- **Every authenticated request reads the session from the DB.** That's a primary-key lookup, which is fine now. Revisit with a short-lived cache only if it shows up in measurements.
- **Unbounded reads:** 113 `findMany` calls have no `take`; most are bounded by a parent. The ones that grow with the data:
  - the legacy `/api/admin/{contacts,careers,training,newsletter}` lists;
  - `crm.summary`;
  - announcement fan-out (`learning.service.ts:370`).
- **Graceful shutdown waits forever.** `server.close()` has no timeout, and there are no `unhandledRejection` or `uncaughtException` handlers.
- **Logging and monitoring are thin.** There is no request ID, no structured JSON logging and no metrics endpoint. `/health` exists and checks the DB.

## Already done in this phase
- `INTERNAL_API_TOKEN` read-limit bypass for trusted server-to-server calls (`backend/src/middleware/rateLimit.middleware.ts`, `backend/src/config/env.ts`).
- Placeholder for `SEED_ADMIN_PASSWORD` in `backend/.env.example`.

## Next.js 15 upgrade — status (2026-10-16, interrupted by low memory)
The user chose the upgrade before the SEO work.
- **Installed:** `next@15.5.27`, `react`/`react-dom@19.2.8`, `@types/react@19.2.18`, `@types/react-dom@19.2.7`, `eslint-config-next@15.5.27` in all six apps; `@globalantic/ui` peers `next >=15.5.24`, `react >=19`.
  - A stale lockfile entry `apps/website` (extraneous) and the lock entries of the upgraded packages were removed so npm could resolve them.
  - Backup of the previous lockfile: session scratchpad `package-lock.before-next15.json`.
- **Audit:** `npm audit --omit=dev` shows no critical issues. 1 moderate and 1 high remain, both from the `postcss` bundled in Next (build-time CSS processing; the fix is Next 16, a major). The `source-map-js` advisory was fixed with `npm audit fix`.
- **Code changes:**
  - 13 server pages moved to async `params`/`searchParams` (7 in frontend, 6 in training);
  - `JSX` → `React.JSX` in `HeroVisual.tsx`;
  - `outputFileTracingRoot` set in `frontend/next.config.mjs`, because of the stale `frontend/package-lock.json`;
  - internal `<a href>` → `<Link>` in the industries page and three form components (the Next 15 build lint flagged them).
- **Verified:**
  - `tsc --noEmit` passes in all six apps;
  - `next lint` passes in all six apps (one pre-existing warning in `intern/app/(portal)/exams/attempts/[id]/take/page.tsx`);
  - frontend `npm test` passes 57/57.
- **NOT yet verified:** production builds of the six apps on Next 15, and browser checks. The first frontend build failed only on the lint error above (now fixed); the rebuild was stopped by the system for low memory.
- **Your dev servers (3000–3005, API :4000) were stopped with your permission** for the install. Restart them with the usual `npm run dev:*` commands; they now run Next 15.

**Update (later 2026-10-16, SEO session):** production builds now pass on Next 15.5.27 for `frontend` (77 pages), `training` and `trainer`, with browser/crawl checks (see `SEO_IMPLEMENTATION_REPORT.md`). `intern`, `employee` and `admin` are typecheck-only so far.

## Next steps (in order)
1. **Next.js 15.5.x upgrade:**
   - one app at a time (frontend → training → intern → admin → employee → trainer);
   - React 19, codemods for async request APIs, an explicit fetch cache policy;
   - typecheck, lint, tests and a build per app, then browser checks.
2. **Send `X-Internal-Token` from server-side fetches:**
   - from `frontend/lib/api/http.ts` and `packages/api-client`, only when `typeof window === 'undefined'`;
   - set `INTERNAL_API_TOKEN` in Vercel and the API host.
3. **Hard caps and pagination on the legacy admin lists**, with the embedded admin updated to match.
4. **CRM performance:**
   - rewrite `crm.summary` with SQL aggregates (groupBy + one funnel query);
   - EXPLAIN `crm/leads` and add a composite index for (`duplicateOfId`, `createdAt`);
   - replace the per-row `_count` with a single grouped query.
5. **Move password hashing off the event loop:** native `bcrypt` (libuv thread pool) or a worker thread, keeping existing hashes valid. Then measure the login burst again.
6. **Observability:**
   - request ID middleware with an `X-Request-Id` response header;
   - JSON logs with secrets and PII redacted;
   - a `/ready` endpoint and a shutdown timeout;
   - process-level error handlers;
   - a token-protected `/metrics` endpoint (Prometheus text format).
7. **Durable outbox for emails, receipts and certificates**, with retries and a failed-job view.
8. **Shared rate-limit store**, then object storage for uploads. These unblock running more than one API instance.
9. **Re-run the same load scenarios after each change** and record the before/after comparison in `docs/TESTING_AND_LOAD_RESULTS.md`.
10. **Write the final reports:** `ARCHITECTURE_AUDIT.md`, `SECURITY_AUDIT.md`, `SCALABILITY_PLAN.md`, `TESTING_AND_LOAD_RESULTS.md`, `DEPLOYMENT_AND_RECOVERY.md`.

**Load-test harness (local only):** `scratchpad/load/run.mjs` (autocannon). It needs the local dev DB on port 54320, synthetic data, and the API on `:4100` with `INTERNAL_API_TOKEN=load-test-internal-token-0123456789abcdef`.
