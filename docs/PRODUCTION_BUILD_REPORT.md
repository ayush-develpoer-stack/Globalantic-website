# Production Build & Verification Report (2026-10-17)

**Environment:** Windows 11, Node 24, npm workspaces (`package-lock.json`, npm 11) with turbo. Six Next.js 15.5 apps, an Express/Prisma backend, and packages `api-client`, `types`, `ui`, `config`. The machine has 7.8 GB RAM, and the owner's seven dev servers (API on :4000, apps on 3000–3005) were running throughout.

## Results: what was actually run
| Check | Command | Result |
|---|---|---|
| Prisma schema | `npx prisma validate` | ✅ valid |
| Prisma client | `npx prisma generate` | ✅ JS client regenerated. ⚠ EPERM renaming the engine DLL, because the owner's running API holds it; the engine version is unchanged, so this is harmless |
| Migration status (Supabase) | `prisma migrate status` | ✅ "Database schema is up to date!" (9 migrations) |
| Live schema vs code | `prisma migrate diff --from-url … --to-schema-datamodel` | ✅ empty migration |
| Backend typecheck / lint | `npm --workspace backend run typecheck` / `lint` | ✅ / ✅ |
| Typecheck + lint: frontend, training, intern, employee, admin, trainer | `npm --workspace <app> run typecheck` and `lint` | ✅ all 12 |
| Package typecheck: api-client, types, ui, config | `npm --workspace packages/<p> run typecheck` | ✅ all 4 |
| Backend tests, full suite | `npm --workspace backend test` (embedded Postgres, never Supabase) | **276 / 278 passed**; 2 failures, both fixed (see below) |
| Re-run of the files touched by the fix | `npm test -- endpoints-ops`, `npm test -- program` | ✅ 16/16, ✅ 7/7 |
| New notification tests | `npm test -- notifications` | ✅ 13/13 |
| New content and seed tests | `npm test -- content-seed` | ✅ 5/5 |
| Affected existing suites, re-run one by one | crm 8, payments 12, program 7, employee 7, cms 5, contracts 31, admissions 9, permissions 9, platform 3, hardening 21, endpoints-site 23, endpoints-ops 15, referral 10 | ✅ all passed |
| Frontend unit tests | `npm --workspace frontend test` | ✅ 77/77 (includes 12 portfolio/blog tests and the JSON-LD XSS test) |
| **Main-site production build** | `NEXT_DIST_DIR=.next-verify NEXT_PUBLIC_API_URL=http://localhost:4000/api npm --workspace frontend run build` | ✅ **compiled, typechecked, linted, and generated 80/80 pages**. The 8 real projects prerendered from Supabase; only the 2 published posts prerendered (drafts stay private); `/blog/category`, `/blog/tag` and `/blog/preview` are dynamic |
| Secret exposure | scanned `frontend/.next-verify/static` for the tails of the real `DATABASE_URL` / `JWT_SECRET` / `RESEND_API_KEY` / `CLOUDINARY_API_SECRET` values and for connection-string and Resend-key patterns | ✅ 0 matches |
| **Builds: training, intern, employee, admin, trainer** | same command per app | ⛔ **not completed.** The OS killed the build chain for low memory right after the main site finished. Not restarted, per the safety rule. Their typecheck and lint pass |
| Production-mode smoke test (`next start` + `node dist/server.js`) | — | ⛔ not run, for the same memory reason and because it must not use the production DB |

## Defects found during verification, all fixed
1. **Lesson completion and clock skew** (`backend/src/services/program.service.ts`). This predates this work, and the full suite exposed it under load.
   - The check compared the database's `openedAt` with the API server's clock.
   - When the clocks differed, a lesson with a 0-minute minimum was refused with 409.
   - **Fix:** 0-minute lessons are never blocked, and 5 s of skew is tolerated. Regression test added: `endpoints-ops`, "tolerates DB/API clock skew".
2. **Stored XSS through JSON-LD** (26 files, 39 call sites in `frontend/` and `training/`).
   - `JSON.stringify` inside `<script>` does not escape `</script>`.
   - **Fix:** a `jsonLd()` helper; test `frontend/tests/json-ld.test.ts`.
3. **URL saved as a portfolio title.** A live production row had an upload URL as its title.
   - **Fix:** the API rejects URL-like titles. The admin stores relative image paths. The row was unpublished with the owner's approval.
4. **Admin blog list.** A filter change didn't reset the page, and search fired on every keystroke. Fixed by the admin work.

## Database changes applied (with owner approval)
- Migration **`20261022090000_admin_notifications_and_media`** (additive) was applied to Supabase after a local test and a rehearsal against a copy of the live data. Backup: `~/.globalantic/backups/supabase-pre-migration-2026-10-17T06-22-36-673Z.json`.
- Content seed `prisma/seed-portfolio-blog.ts` (create-only), run after a dry run and a targeted backup at `~/.globalantic/backups/supabase-pre-content-seed-2026-10-17T07-07-57-974Z.json`:
  - 8 projects published;
  - 6 blog drafts, unpublished;
  - `secondaryEmail` set;
  - notification recipients set to both addresses.
- One junk portfolio row was unpublished (audited).
- Nothing was reset, dropped or deleted.

## Still required
1. **Build the five remaining apps and run the smoke tests** with the dev servers stopped (see "Commands" below).
2. **Production environment** (backend host):
   - `PUBLIC_API_URL=https://api.globalantic.com/api`
   - `MAIN_SITE_URL=https://globalantic.com`
   - `COOKIE_DOMAIN=.globalantic.com` (this also makes the blog preview work)
   - `CRON_SECRET`, plus a scheduler calling `POST /api/notifications/dispatch` and `POST /api/crm/reminders/dispatch`
   - `HASH_SALT` (production won't boot without it)
   - `RAZORPAY_*` (payments)
   - Optionally `BUSINESS_NOTIFICATION_EMAILS`. The admin setting already lists both addresses.
3. **Resend:** verify the sending domain (`RESEND_FROM_EMAIL`). Until then, emails are `FAILED` or `SKIPPED` and the business actions still succeed. No real email was sent during this work: tests use the outbox, and the owner's dev API was not asked to send.
4. **Not deployed:** `api.globalantic.com` does not resolve and globalantic.com still serves the old static site. Nothing was deployed or pushed; the repo is not under git.
5. **Content review:**
   - upload a screenshot and alt text for each of the 8 projects;
   - review, edit and publish the 6 drafts (delete their review note first);
   - tick "client approved" only when a client agrees to be named.

## Commands
Development (as the owner runs it now):
```bash
npm run dev:backend            # API :4000 (backend/.env -> Supabase; local == production data!)
npm run dev:frontend           # :3000; also dev:training :3001, dev:intern :3002, dev:employee :3003, dev:admin :3004, dev:trainer :3005
npm run dev:db                 # optional isolated embedded Postgres :54320 with [DEMO] data
```
Verification builds (close dev servers first; builds go to `.next-verify` and leave `.next` alone; restore `tsconfig.json` afterwards, because Next appends `.next-verify` to `include`):
```bash
for a in frontend training intern employee admin trainer; do
  NEXT_DIST_DIR=.next-verify NEXT_PUBLIC_API_URL=http://localhost:4000/api npm --workspace $a run build || break
done
npm --workspace backend run build      # tsc -> backend/dist
```
Production mode, locally, against the isolated database:
```bash
npm run dev:db                                                     # note the printed local URL
DATABASE_URL=<local url> DIRECT_URL=<local url> NODE_ENV=production JWT_SECRET=<any> HASH_SALT=<any> \
  PORT=4100 FRONTEND_URL=http://localhost:3100 node backend/dist/server.js
NEXT_DIST_DIR=.next-verify npx --workspace frontend next start -p 3100
curl http://localhost:4100/health      # expect database "up", schema "current"
```
Tests:
```bash
npm --workspace backend test           # or: npm --workspace backend test -- notifications
npm --workspace frontend test
```
