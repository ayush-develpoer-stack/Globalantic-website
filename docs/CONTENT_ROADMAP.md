# Content roadmap

Rules for every item: written or reviewed by someone who knows the subject, factual, no invented
clients/results/prices, published through the CMS approval flow (editor drafts → admin publishes).
Quality over volume: **2–4 articles a month** is plenty for a team of one or two.

## How a post earns its place

1. It answers a question a real prospect asks (sales calls, WhatsApp chats, enquiry messages).
2. It links to the one service page it supports (tag the post with the service slug, e.g. `crm-development` — the "Related services" block appears automatically).
3. It has an author. If Ayush writes or reviews it, set Author = `Ayush Ahirwar`; the post then links to the founder entity on `/about#founder`.
4. It gets an SEO title (≤ 60 characters before the brand) and a description (120–160 characters) in the CMS.
5. It is updated (not duplicated) when facts change — the page shows "Updated <date>" automatically.

## Priority 1 — pages that already exist (do these first)

| Item | Why | Effort |
|---|---|---|
| Run `prisma/seed-services.ts` on production (fills new SEO titles; see implementation report) | Better titles on all 19 service pages without touching CMS edits | 5 min |
| Publish 2–3 real portfolio projects (with client approval where named) | Service pages show matching projects automatically; proof is the biggest conversion gap | per project 1–2 h |
| Confirm/refresh the `/training` offer text ("Limited Seats", "Launch offer — 50% off") | Stale offers hurt trust and can mislead | 10 min |
| Enrich the 12 industry pages: replace the shared FAQ with 2–3 sector-specific questions; add a real example where one exists | Template pages look near-duplicate; unique answers make each page worth indexing | 30 min each |
| Founder: when you're ready, give a short verified bio and profile links (LinkedIn etc.) | Then add them to the About page and `sameAs` (code supports it via site settings for the company; founder links need a small code change) | — |

## Priority 2 — articles (suggested order; one per row)

Each supports a service page; "Type" says what shape answers the question best.

| # | Working title | Supports | Type |
|---|---|---|---|
| 1 | How much does a business website cost in India? What changes the price | web-development | Cost explainer (ranges only if you approve them; otherwise the factors) |
| 2 | Custom CRM vs Zoho/HubSpot: when building your own makes sense | crm-development | Comparison |
| 3 | What to prepare before you ask for a software quote (checklist) | software-development, get-a-quote | Checklist |
| 4 | Website vs web application: which one does your business need? | web-application-development | Definition + decision guide |
| 5 | AEO and GEO explained: how answer engines and AI assistants read your site | aeo, geo | Explainer (honest: nothing is guaranteed) |
| 6 | Connecting WhatsApp enquiries to a CRM: options and trade-offs | crm-development, api-integration | Implementation guide |
| 7 | Android, iOS or both? Choosing a first mobile app approach | mobile-app-development | Decision guide |
| 8 | Practical AI automation for small businesses: 6 tasks worth automating first | ai-solutions | List with examples |
| 9 | ERP for a growing manufacturer: modules to start with | erp-development | Guide |
| 10 | Technical SEO checklist for a new website launch | seo, web-development | Checklist |
| 11 | What website maintenance should include (and what it shouldn't cost you in downtime) | website-maintenance | Explainer |
| 12 | Payment gateway integration for Indian e-commerce stores: what to plan | ecommerce-development | Implementation guide |

Training-site content (separate audience; publish on the training site or the main blog with a link):

| # | Working title | Supports |
|---|---|---|
| T1 | What you learn in a full stack internship: a week-by-week outline | `/training`, courses |
| T2 | How to build a portfolio that gets interviews (for freshers) | courses |
| T3 | How certificate verification works (and how employers can check one) | `/certificates/verify` |

## Priority 3 — when there is evidence

- Case studies (problem → approach → what was delivered; results only if measured and approved).
- A Bhopal page — only with genuinely local content (see keyword map trigger).
- Pricing/approach page — only with approved numbers.

## Calendar (first 3 months)

| Month | Publish | Maintain |
|---|---|---|
| 1 | Articles 1, 3; portfolio project 1 | Production SEO fill, verify Search Console, submit sitemaps |
| 2 | Articles 2, 4; T1 | Enrich 4 industry pages; check Search Console queries per page |
| 3 | Articles 5, 6; portfolio project 2 | Enrich 4 more industry pages; update titles where queries differ from the map |

Review every quarter: pages with impressions but low CTR → rewrite title/description; pages with
no impressions after 3 months → improve or merge, don't multiply.
