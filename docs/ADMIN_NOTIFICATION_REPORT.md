# Admin Notification Centre & Email Notifications (2026-10-17)

## How it works
1. **Recording.** A business event calls `recordAdminEvent()` inside the same database transaction as the change itself (`backend/src/services/admin-events.service.ts`). Callers that aren't in a transaction use `emitAdminEvent()`.
2. **One event per occurrence.** Each event is stored once in `admin_events` under a unique `dedupeKey` (e.g. `lead.created:<id>`, `payment.paid:<id>`). Retries, double submits and Razorpay webhook replays are no-ops (`INSERT … ON CONFLICT DO NOTHING`, so a duplicate never aborts the business transaction).
3. **Fan-out.** Each authorised staff member gets a row in the existing `notifications` table, linked by `eventId`, with `category` and `severity`, all in the same transaction. If the business change rolls back, so does the notification, so nothing is lost silently.
   - **Audience:** decided per category by permission. ADMIN holds every permission:
     - `lead` → `leads.manage`
     - `training` and `admission` → `training.admissions.read`
     - `program` → `programs.read`
     - `payment` → `payments.read`
     - `content` → `cms.publish`
     - `hr` → `hr.requests.manage` (leave requests use `leave.approve`, careers `employees.manage`)
     - `system` → `users.manage` (ADMIN only)
   - **Assigned leads** go only to their owner and the admins, following the CRM's own visibility rule.
4. **Realtime.** After commit, new rows are pushed to any open admin streams through an in-process event bus.
5. **Email.** After commit, the email (if any) goes to the business recipients, following the settings. The delivery state is tracked on the event.

### Realtime delivery mechanism (what it actually is)
- **Server-Sent Events:** `GET /api/notifications/stream`.
  - Authenticated by the existing session cookie (`requireAuth`); staff roles only.
  - Each user receives only their own rows.
  - The session is re-checked every 60 s, so a stream closes after logout, suspension or deletion.
  - Heartbeat every 25 s; `retry: 5000`.
  - Bounded to 3 streams per user (the oldest is closed) and 200 in total.
- **Missed-event recovery:** the browser's automatic reconnect sends `Last-Event-ID`, and a manual reconnect passes `?lastEventId=`. The server replays up to 50 newer notifications, then sends a `ready` frame with the unread count.
- **Fallback:** after 3 stream errors, or a 401/403, the admin UI polls `GET /api/notifications/unread-count` every 30 s (paused while the tab is hidden). It shows "Live updates paused — refreshing every 30s" and retries live every 5 minutes.
- **Not WebSockets.** SSE was chosen because the API runs as a persistent Node service (Render or Railway).
- **Limitation:** the bus is in-process. If the API ever runs as **several instances**, a user connected to instance A won't get live pushes for events recorded on instance B until their next reconnect or poll. The database stays the source of truth and nothing is lost. A shared pub/sub would be needed at that point; it isn't needed for a single instance.

## Events wired (only events that exist in the application)
| Event | Category · severity | Email |
|---|---|---|
| New website enquiry / lead (`crm.createEnquiry`) | lead · important (repeat enquiry: info) | Dedicated lead email (full enquiry) to the business recipients, plus the owner if assigned |
| Training application (legacy form) | training · important | Dedicated email |
| Career / internship application | hr · important (audience `employees.manage`) | Dedicated email |
| Admission application submitted or resubmitted | admission · important | Generic event email |
| Certificate-program registration | program · info | No (below the default minimum) |
| Payment verified (course or program) | payment · important | Dedicated payment alert with receipt details (`receipt.service`) |
| Duplicate payment captured (refund required) | payment · **critical** | Generic event email |
| Payment failed (checkout report or webhook) | payment · info | No |
| Refund recorded (webhook or finance) | payment · important | Generic event email |
| Payment dispute state change | payment · **critical** | Generic event email |
| Webhook rejected: invalid signature (deduplicated per hour) | system · important | No (in-app only) |
| Blog post or project published (first publication) | content · info | No |
| Editor requested publication (awaiting approval) | content · info | No |
| Leave request | hr · info (audience `leave.approve`) | No |
| HR request (payroll = important) | hr · info/important | Payroll only |
| Email delivery failure (any kind except notification emails; deduplicated per hour) | system · important | No (email is what is failing) |

- **Not wired:** blog comments (that feature doesn't exist) and failed scheduled jobs (the cron endpoints report errors to the caller; there is no job queue).
- **Previews:** notification bodies carry only what's needed: references, service and amount. They never include message text, leave reasons, email addresses, passwords, tokens or payment secrets. Tests check this for leads and leave.

## Email notifications
- **Recipients:** admin settings, then `BUSINESS_NOTIFICATION_EMAILS` (comma-separated), then `ADMIN_EMAIL`.
  - Production is set (2026-10-17) to **info@globalantic.com, info.globalantic@gmail.com**, editable in **Admin → Notifications → Settings**.
  - Every business email goes to both addresses in one message.
- **Preferences:**
  - email on/off;
  - minimum severity (default `important`);
  - muted categories (still shown in-app);
  - retention for read notifications (default 180 days).
  - Settings are ADMIN-only (`notifications.settings`), validated and audited (`notifications.settings_update`).
- **Delivery tracking:** `admin_events.emailStatus` moves through:
  - `QUEUED` once it's decided an email will be sent;
  - `SENT` when **Resend accepted it** (this is not proof of inbox delivery);
  - `FAILED` with the error;
  - `SKIPPED` when no provider or recipients are configured.
  - Every send is also recorded in `email_logs`. The legacy lead, training and career alerts now also use logged sending.
- **Retries:**
  - attempts are claimed atomically, so two dispatchers can't double-send;
  - capped at 5 attempts;
  - `POST /api/notifications/dispatch` (header `x-cron-secret: $CRON_SECRET`) retries FAILED or stuck QUEUED event emails and purges read notifications past retention.
  - Run it from a scheduler every 5–15 minutes.
- **Missing configuration:** the business operation still succeeds (the lead is saved and the notification created), and the email is marked `SKIPPED`. The settings page warns when `RESEND_API_KEY` is missing.
- **Templates:** branded with the existing `layout()`: event type, UTC timestamp, record type and id, and an "Open in admin" button (sign-in required).

## Admin UI (admin portal)
- **Header bell:** unread badge, panel with the latest 10, severity dot, category, relative time, mark all read; clicking marks read and navigates. Absolute links open the main-site embedded admin (legacy training and careers lists). Accessible: aria-label with the count, Escape, focus return; full width under 560px.
- **`/notifications`:** category and severity filters, unread toggle, server pagination (20), mark one or all, loading, empty and error states.
- **`/notifications/settings`:** recipients editor (max 10), email toggle, minimum severity, muted categories, retention, provider warning, and a "Recent notification emails" table (Queued / Accepted by provider / Failed / Skipped).
- **Website settings:** "Secondary email" field.

## API
`/api/notifications`, staff only:

| Endpoint | Purpose |
|---|---|
| `GET /` | `?category=&severity=&unread=&page=&pageSize<=50` |
| `GET /unread-count` | Unread count |
| `POST /read` | `{ids: uuid[] \| "all"}`, scoped to the caller |
| `GET /stream` | SSE |
| `GET` / `PUT /settings` | Settings (`notifications.settings`) |
| `GET /deliveries` | Recent notification emails (`notifications.settings`) |
| `POST /dispatch` | Cron (`CRON_SECRET`) |

## Database
Migration `20261022090000_admin_notifications_and_media`, **additive**:
- new table `admin_events`;
- new table `notification_settings`;
- `notifications` gains `category`, `severity` and `eventId` (unique per user + event);
- plus portfolio and blog image fields and `site_settings.secondaryEmail`.

How it was applied:
1. Tested on a throwaway database together with the existing suites.
2. Rehearsed against a copy of the live data, with a backup at `~/.globalantic/backups/supabase-pre-migration-2026-10-17T06-22-36-673Z.json`.
3. **Applied to Supabase on 2026-10-17** with the owner's approval.

Result: `migrate diff` against live is empty, and existing student and employee notifications are unaffected (they get the defaults `general` / `info`).

## Tests
`backend/tests/notifications.test.ts`, **13/13**:
- settings: ADMIN only, validated, audited;
- a lead goes to admin and managers, with one email to both addresses and no email address in the preview;
- an assigned lead doesn't leak to other salespeople;
- duplicate keys produce one event, copy and email;
- min severity and muted categories mean in-app only;
- list, filters, unread count and mark read are scoped to the caller;
- 401/403 access checks;
- **SSE live push, per-user scoping and Last-Event-ID replay**;
- cron: 404 without the secret, FAILED retry (attempts 1 → 2, SENT), the attempt cap, retention purge;
- leave notifies HR and admin but not sales, and doesn't expose the reason;
- content publish events happen once, and editors are excluded;
- stale save returns 409;
- secondary email is public and the update is audited.

Existing suites re-run green: crm, payments, program, employee, cms, contracts, admissions, permissions, platform, hardening, endpoints-site, endpoints-ops, referral.
