# Sales Engine & CRM

How website visitors become leads and how the team works them. Written 2026-10-16.

## Visitor side (frontend/)

| Piece | Where |
|---|---|
| WhatsApp button, floating action, pre-filled messages | `components/marketing/WhatsApp.tsx`, `lib/config.ts` (`whatsappUrl`, `whatsappMessage`) |
| Multi-step enquiry form (service, budget, timeline, description, contact, consent) | `components/forms/ContactForm.tsx` |
| Service landing CTA strip and "Discuss your project" section | `components/marketing/ServiceCtaStrip.tsx`, `ServiceEnquiry.tsx` |
| Quote page with FAQ | `app/(marketing)/get-a-quote/page.tsx` |
| CTA bands | `components/sections/CTASection.tsx` (home, list pages, blog posts), `components/detail/DetailCTA.tsx` (solutions, industries) |
| First-touch attribution (landing page, referrer, UTM) | `lib/attribution.ts`, `components/marketing/AttributionCapture.tsx` (sessionStorage; sent only with an enquiry) |
| Anonymous CTA / WhatsApp click counter | `trackClick` → `POST /api/track` (no cookies or identifiers) |

WhatsApp number: `917697845157` (override with `NEXT_PUBLIC_WHATSAPP`). A `wa.me` link only opens a chat.
**WhatsApp messages are not synced to the CRM.** Staff record those conversations as manual leads
(source `manual_whatsapp`) or log them as a WHATSAPP activity.

## Server side (backend/)

- `POST /api/contact` → `services/crm.service.ts#createEnquiry`. It does server-side validation, spam checks
  (honeypot, minimum fill time, link count) and rate limiting (`formLimiter`). Repeat enquiries within 90 days are linked to the
  first open lead. New leads are assigned by rule and get a follow-up date 24 h out. The lead is stored first; then the
  acknowledgement email goes to the enquirer and an alert goes to `ADMIN_EMAIL` plus the owner, with in-app notifications.
- `/api/crm/*` (permission `leads.manage`: ADMIN, SALES or a grant). ADMIN sees all leads. Other staff see only their own
  leads and unassigned ones. Assignment rules and manual reminder runs are admin-only.
- Stages: New → Contacted → Qualified → Proposal sent → Negotiation → Won / Lost.
- Reminders and stale-lead alerts: `POST /api/crm/reminders/dispatch` with header `x-cron-secret: $CRON_SECRET`
  (call it daily from any scheduler). Admins can also run it from the CRM. It is idempotent for about 20 h per lead.

## Admin (admin/ → Sales CRM)

Leads list (stats, search, filters, CSV export), lead detail (pipeline, owner, follow-up, notes, consultation and call
log, timeline, repeat enquiries), manual lead, funnel and sources report, assignment rules.

## Funnel measurement

Visitor → CTA click → Enquiry → Qualified → Consultation → Proposal → Customer. CTA clicks, WhatsApp clicks and
everything from Enquiry onwards are measured. **Visitors and page views are not measured**, because no analytics
provider is configured, and the report says so instead of showing a number.

## Configuration

| Variable | App | Purpose |
|---|---|---|
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | backend | Acknowledgement and alert emails (logged and skipped when unset) |
| `ADMIN_EMAIL` | backend | Receives every new-lead alert |
| `ADMIN_PORTAL_URL` | backend | Links in alerts and reminders |
| `BUSINESS_WHATSAPP` | backend | wa.me link in acknowledgement emails |
| `CRON_SECRET` | backend | Enables the reminder dispatch endpoint |
| `NEXT_PUBLIC_WHATSAPP` | frontend | Overrides the WhatsApp number |
| `NEXT_PUBLIC_BOOKING_URL` | frontend | Optional booking link on the enquiry confirmation (hidden when unset) |

## Deploy order

The migration `20261019090000_sales_crm` is additive: new enum values, nullable or defaulted columns and new tables.
**Run `npm run prisma:deploy` before deploying this backend code.** Enquiry creation writes the new columns and
fails until the migration is applied.

## Local verification

`DEV_DB_NAME=globalantic_e2e npm run dev:db` creates a fresh UTF-8 local database. Older dev databases are WIN1252
and reject ₹ budgets. To get marketing pages there too, also run `prisma/seed.ts` against it (set `SEED_ADMIN_*` to test values).
