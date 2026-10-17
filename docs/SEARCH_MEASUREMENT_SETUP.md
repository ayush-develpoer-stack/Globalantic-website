# Search & measurement setup

What is measured today, and the external steps only you can do (they need your accounts).
No secrets are needed for any of this; verification tokens are public by design.

## 1. Already measured (no setup needed)

| Signal | Where | How |
|---|---|---|
| Enquiries (form submissions) | Admin → Leads | Every enquiry is a CRM lead with service, budget, timeline, message |
| First landing page, external referrer, UTM tags | Lead detail; Admin → Leads → Funnel & sources | Captured per browser session, sent only with an enquiry |
| **Channel** (Organic search / AI assistant / Paid / Social / Email / Referral / Direct) | Funnel & sources → "By channel" | Derived from referrer + UTM (`backend/src/lib/channel.ts`). Best effort: many apps hide referrers, so "Direct / unknown" also contains search/social visits |
| **Leads by landing page** (with won count) | Funnel & sources → "By landing page" | Query strings stripped, so UTM variants collapse to one row |
| CTA clicks, WhatsApp clicks | Funnel & sources → funnel | Anonymous counters (no cookies, no personal data). A WhatsApp click only opens a chat; it is **not** an enquiry and messages are not synced to the CRM |
| Qualified → consultation → proposal → customer | Funnel | From real stage changes on leads. Log WhatsApp/phone deals as manual leads (source `manual_whatsapp` / `manual_phone`) so they count |

Not measured: visitors/sessions and organic impressions — that needs Search Console (2) and,
optionally, an analytics tool (4).

## 2. Google Search Console (do this first)

1. Go to <https://search.google.com/search-console> → **Add property**.
2. Recommended: **Domain** property `globalantic.com` (covers `www`, `training.` and every subdomain). Verify with the DNS **TXT** record Google shows, added at your domain registrar / DNS host. Nothing to deploy.
   - Alternative (URL-prefix property per site): copy the token from the HTML-tag method and set
     `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token>` in the Vercel project of `frontend` (and of `training` for its own property), then redeploy. The tag is rendered only when the variable is set.
3. Sitemaps → submit `https://globalantic.com/sitemap.xml` and `https://training.globalantic.com/sitemap.xml`.
4. Check **Pages** (indexing) after a week: expected "Excluded by noindex" entries are login/register/apply pages, filtered `/courses?…` views, batch pages and `/lp/*`. Anything else excluded → investigate.
5. Do **not** add the intern/employee/admin/trainer portals as properties to "index" them; they are noindex on purpose.
6. Monthly: Performance → Pages → Queries. Update `KEYWORD_AND_PAGE_MAP.md` with real queries; rewrite titles of pages with impressions but low CTR.

## 3. Bing Webmaster Tools (also feeds Copilot/ChatGPT search results that use Bing)

1. <https://www.bing.com/webmasters> → **Import from Google Search Console** (fastest), or add the site and verify with
   `NEXT_PUBLIC_BING_SITE_VERIFICATION=<token>` (rendered as `msvalidate.01`).
2. Submit both sitemaps.

## 4. Analytics (optional — your decision)

The site has no analytics script, so there is nothing to consent to today. Options:

| Option | Consent banner? | Notes |
|---|---|---|
| **Cloudflare Web Analytics** or **Plausible** (recommended) | Generally not required — cookie-less, no personal data | One script tag; page views, referrers, top pages. Plausible is paid; Cloudflare's is free. |
| Google Analytics 4 | **Yes** (cookies; India DPDP Act and EU visitors) | Most detailed, but needs a consent banner and Consent Mode before the tag loads |

If you pick one, it's a small change: add the script in `frontend/app/(marketing)/layout.tsx`
behind an env variable (e.g. `NEXT_PUBLIC_ANALYTICS_DOMAIN`) so previews stay clean. Ask and it can be added.

## 5. Staging / preview safety (already automatic)

- On Vercel, only the **Production** environment is indexable (`VERCEL_ENV=production`). Preview deployments render `noindex` and `robots.txt: Disallow: /`.
- Self-hosting outside Vercel: production builds are indexable unless you set `ALLOW_INDEXING=false` (set it on any staging server).
- `NEXT_PUBLIC_SITE_URL` (frontend) and `NEXT_PUBLIC_TRAINING_URL` (training) must be the real `https://` origins in production — canonicals, sitemaps and schema are built from them.

## 6. UTM conventions (so channel reports stay clean)

Use lowercase, no spaces: `utm_source` = where (`google`, `meta`, `linkedin`, `newsletter`, `whatsapp_status`),
`utm_medium` = type (`cpc`, `paid_social`, `social`, `email`, `referral`), `utm_campaign` = `<service>-<month>` (e.g. `crm-nov26`).
Never tag internal links on the site itself (it would overwrite the real source).

## 7. Google Business Profile (eligibility check first)

Decision on 2026-10-16: publish city only, no street address. That fits a **service-area business**:

1. Eligibility: Google requires in-person contact with customers during stated hours (at their location or yours). If all work is remote, a profile may not be allowed — don't create one in that case.
2. <https://business.google.com> → add business "Globalantic" → category e.g. *Software company* / *Website designer*.
3. Choose **"I deliver goods and services to my customers"** and **do not** show a business address (hide address); set the service area (e.g. Bhopal, Madhya Pradesh — only areas you really serve).
4. Phone `+91 76978 45157`, website `https://globalantic.com`, hours you actually keep. Use exactly the same name/phone as the site (NAP consistency).
5. Verify (video/postcard as Google offers). Don't create duplicate or extra-location listings.
6. Reviews: ask real customers after delivery with the profile's review link. Never offer discounts or gifts for reviews, never write or buy reviews, and reply to every review (including negative) politely. Don't add review stars to the website's schema — Google ignores self-serving review markup for organisations.

After verification, if you later want the map or an address on the site, tell me and the
`mapUrl`/`mapEmbedUrl` settings already render it (address schema stays a separate decision).

## 8. Other profiles (GEO consistency)

When you create or confirm LinkedIn / Instagram / Facebook / X / YouTube company pages, enter their URLs in
Admin → Site settings. They then appear in the footer and as `sameAs` in the Organization schema.
Use the same description everywhere: *"Globalantic is an IT and digital solutions company in Bhopal, India,
building websites, software, mobile apps, AI solutions and business systems."*

## 9. Quick checks you can run yourself

```bash
# against a running build (local or production)
node frontend/scripts/seo-check.mjs https://globalantic.com --private /admin/login
node frontend/scripts/seo-check.mjs https://training.globalantic.com --private /login,/register,/apply
```
Then validate a few pages at <https://search.google.com/test/rich-results> and <https://validator.schema.org>.
