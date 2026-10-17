# SEO / AEO / GEO audit — 2026-10-16

Scope: every public app in the monorepo and the backend that feeds it. Domains are taken from the
code (`packages/config/src/index.ts`, each app's config), not assumed:

| App | Production domain | Purpose | Indexable? |
|---|---|---|---|
| `frontend/` | `https://globalantic.com` | Company site (IT & digital services) + embedded CMS at `/admin` | Yes, except `/admin` |
| `training/` | `https://training.globalantic.com` | Public course catalogue, admissions, student sign-up | Catalogue/info pages only |
| `intern/` | `https://intern.globalantic.com` | Student/intern portal | No (private) |
| `employee/` | `https://employee.globalantic.com` | Employee portal | No (private) |
| `admin/` | `https://admin.globalantic.com` | Management system (CRM, admissions, HR, documents) | No (private) |
| `trainer/` | `https://trainer.globalantic.com` | Trainer portal | No (private) |
| `backend/` | `NEXT_PUBLIC_API_URL` (set per deployment) | JSON API + public CMS image store | No (data, not pages) |

Approved facts used (from the user, 2026-10-16): company name, founder **name and title only**
(Ayush Ahirwar, Founder), location **city only** (Bhopal, India), phone/WhatsApp `+91 76978 45157`,
email `hello@globalantic.com`. No street address, map, registration number, reviews, awards or
client results exist in the code or were supplied, and none were added.

## What was already in good shape

- Server-rendered pages (App Router, server components) — all content is in the HTML.
- `buildMetadata()` with canonical + Open Graph + Twitter on every main-site page; generated OG image.
- Organization, WebSite, Service, BreadcrumbList, FAQPage (visible FAQs only), BlogPosting, CreativeWork JSON-LD.
- Rich, distinct service pages (problem/solution, deliverables, audience, process, tech, FAQs, enquiry form, WhatsApp).
- `robots.ts`, `sitemap.ts`, `llms.txt`; 404 via `notFound()`; campaign landing pages default to `noindex`.
- Lead attribution (landing page, referrer, UTM) stored on every CRM lead; anonymous CTA/WhatsApp click counter.
- Portals already had `robots: noindex` metadata.

## Issues found (prioritised)

Severity: **P1** = harms indexing or misrepresents the business; **P2** = clear ranking/CTR loss; **P3** = polish.

| # | Sev | Area | Issue | Status |
|---|---|---|---|---|
| 1 | P1 | Staging | No staging protection. A Vercel preview (or any non-production deployment) served `index, follow` and a production-style robots.txt/sitemap → duplicate copies of the site could be indexed. | **Fixed** — `isIndexable()` (both public apps): only the production deployment is indexable; previews get `noindex` + `Disallow: /`. |
| 2 | P1 | Training site | `training.globalantic.com` had **no robots.txt, no sitemap, no canonical tags** and no structured data. | **Fixed** — robots, sitemap (static pages + every published course), canonicals, Course/EducationalOrganization/Breadcrumb schema. |
| 3 | P1 | Training site | `/register` was indexable; filtered catalogue URLs (`/courses?mode=…`) were indexable duplicates; certificate-lookup URLs (`/certificates/verify?code=…`, which show a student's name) were indexable. | **Fixed** — register/apply/status/password pages `noindex, nofollow`; filtered views `noindex, follow` with canonical `/courses`; looked-up certificate URLs `noindex`. |
| 4 | P1 | Structured data | Organization `address.streetAddress` was "Bhopal, India" (and would have published whatever street address is typed into site settings) — wrong property, and against the "city only" decision. | **Fixed** — `addressLocality: Bhopal, addressRegion: Madhya Pradesh, addressCountry: IN` only. |
| 5 | P1 | Titles | Blog posts rendered "… \| Globalantic Blog \| Globalantic" (seed/CMS SEO titles end in "Globalantic Blog"; the brand check only looked at the last word). | **Fixed** — `brandTitle()` keeps any title that already contains the brand. Unit-tested. |
| 6 | P2 | Private portals | intern/employee/admin/trainer relied on per-page metadata only; no robots.txt (404), no header-level protection (a page that forgot metadata, or a PDF/route handler, could be indexed). | **Fixed** — `X-Robots-Tag: noindex, nofollow, noarchive` on every response + robots.txt. |
| 7 | P2 | API | API JSON responses and private file downloads had no robots directive. | **Fixed** — `X-Robots-Tag: noindex, nofollow` on the API except the public CMS image store. |
| 8 | P2 | Sitemap | Every URL had `lastModified: now` (tells crawlers everything changed on every request); blog posts with an external canonical were listed. | **Fixed** — real `updatedAt` for content, no date for static pages, external-canonical posts excluded. |
| 9 | P2 | Entity / GEO | No founder entity anywhere; Organization had no `founder`/`knowsAbout`; About page had no factual company summary. | **Fixed** — About page "Globalantic in brief" facts list, `#founder` card (name + title only), Person schema, Organization `founder` + `knowsAbout`, FAQ (visible) about the company; llms.txt lists founder and WhatsApp. |
| 10 | P2 | Titles | Generic titles on index pages ("Services", "Blog", "Contact"…), generic service SEO titles ("Web Development Services \| Globalantic") that ignore the main search intent. | **Fixed** — intent-based titles for index pages; per-service SEO titles/descriptions in `prisma/data/seo.ts` (applied to production with the fill-only script, see report). |
| 11 | P2 | Blog | No `og:type=article`/published time, no visible "updated" date, no author→entity link, no links from posts to the related service pages. | **Fixed** — article OG data, `<time>` published/updated, founder-authored posts link to `/about#founder`, "Related services" block from tags. |
| 12 | P2 | CMS workflow | Any EDITOR could publish directly — no review before publication. | **Fixed** — new `cms.publish` permission (ADMIN, or granted per user). Editors write drafts; publishing, unpublishing, archiving and edits to live content need a publisher. |
| 13 | P2 | Measurement | Lead channel (organic search vs AI assistant vs paid vs social) and landing page were stored but not reported. | **Fixed** — CRM report "By channel" and "By landing page" (with won counts). |
| 14 | P2 | Measurement | No Search Console / Bing verification hook; no analytics provider. | **Partly fixed** — env-driven verification meta tags. Analytics provider is a decision for you (see `SEARCH_MEASUREMENT_SETUP.md`). |
| 15 | P3 | Accessibility/HTML | Every FAQ accordion used ids `faq-panel-0…`; two accordions on one page produced duplicate ids. | **Fixed** — `useId()`. |
| 16 | P3 | Schema | Index pages (services/solutions/industries) had no ItemList. | **Fixed**. |
| 17 | P3 | Duplicate intent | Main-site `/training` (6-month full-stack internship with fees) and the training site overlap in topic but not in content. No cross-link from the main page to the catalogue. | **Fixed (link)** — `/training` links to the training site's course catalogue. Content is distinct, so no canonical change. |
| 18 | P3 | Content | The 12 industry pages are generated from one template; their single FAQ ("Do you build custom software for X?") is identical in wording across pages. | **Open — content decision.** See `CONTENT_ROADMAP.md` (enrich or consolidate; do not add more). |
| 19 | P3 | Content | Main-site `/training` shows "Limited Seats" and "Launch offer — 50% off". These are business claims outside SEO scope. | **Open — please confirm they are current**; stale offer text hurts trust. |
| 20 | P3 | Location | Only Bhopal is a verified location. No location pages exist, and none were created (one city, no address, no unique local content yet). | **By design** — see roadmap and GBP steps. |
| 21 | P3 | Portfolio / proof | Portfolio has no published projects in seed data; no case studies to link from service pages. | **Open — needs real, approved projects.** Service pages already show projects automatically once published. |
| 22 | P1 | Status codes | Found while verifying: unknown slugs under every dynamic section (`/services/x`, `/blog/x`, …) returned **HTTP 200** with noindex (soft 404), caused by the root `app/loading.tsx` Suspense boundary. | **Fixed** — boundary removed; all six sections now return 404. The crawler checks this. |
| 23 | P2 | Social sharing | Found while verifying: **no page had `og:image`** (page-level `openGraph` replaced the root file-based image). Shared links had no preview image. | **Fixed** on both public sites. |
| 24 | P2 | Brand | The generated OG image used a "G" text placeholder instead of the real logo. | **Fixed** — real `logo.svg` on both sites; logo test extended. |
| 25 | P3 | Training titles | The training home page had no brand in its title (Next's title template doesn't apply to the root page). | **Fixed**. |

## What was deliberately not done

- No location/city pages, no "near me" pages, no industry×service doorway pages.
- No `aggregateRating`, `review`, `award` or `LocalBusiness` address schema (nothing verified to support it).
- No `sameAs` profile links (none confirmed; the schema emits only https links an admin enters in settings).
- No auto-generated articles. The content roadmap lists topics for a human to write and approve.
- No promise of rankings or AI citations anywhere in copy or schema.
