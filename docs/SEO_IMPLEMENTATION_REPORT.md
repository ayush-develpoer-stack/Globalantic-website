# SEO / AEO / GEO implementation report — 2026-10-16

Companion docs: `SEO_AUDIT.md` (findings), `KEYWORD_AND_PAGE_MAP.md`, `CONTENT_ROADMAP.md`,
`SEARCH_MEASUREMENT_SETUP.md`. Nothing here touched Supabase or production; **no database migration**
was needed.

## 1. Changes by area

### Main site — `frontend/` (globalantic.com)
| Change | Files |
|---|---|
| Staging protection: `isIndexable()` — only the production deployment (`VERCEL_ENV=production`, or `ALLOW_INDEXING=true`) is indexable; previews get `noindex` and `robots.txt: Disallow: /` | `lib/seo.ts`, `app/robots.ts`, `app/layout.tsx` |
| `brandTitle()`: brand exactly once (fixes "… \| Globalantic Blog \| Globalantic") | `lib/seo.ts` |
| **Every page now has an `og:image`/Twitter image.** Before, none had one: a page-level `openGraph` replaces the root `opengraph-image` in Next's metadata merge | `lib/seo.ts` |
| OG image shows the **real logo** (it used a "G" text placeholder); the logo test now covers OG images | `app/opengraph-image.tsx`, `tests/logo.test.ts` |
| **Real 404s for unknown slugs.** `/services/x`, `/blog/x`, `/industries/x`, `/solutions/x`, `/portfolio/x`, `/lp/x` returned HTTP 200 + noindex (soft 404) because the root `app/loading.tsx` Suspense boundary commits the status before `notFound()` runs. The spinner was removed (pages are pre-rendered; a backup is in the session scratchpad) | `app/loading.tsx` (deleted) |
| Organization schema: city-only address (`addressLocality`), `founder`, `knowsAbout`, logo `ImageObject`; settings street address no longer published in schema | `lib/seo.ts`, `lib/config.ts`, `app/(marketing)/layout.tsx` |
| About page: "Globalantic in brief" facts list, `#founder` card (Ayush Ahirwar, Founder — nothing more), visible company FAQ + FAQPage, Person schema | `app/(marketing)/about/*` |
| Blog posts: `og:type=article` + published/modified time, `<time>` published/updated dates, founder-authored posts link to `/about#founder` (Person `@id`), keywords/section in schema, "Related services" internal links from tags | `app/(marketing)/blog/[slug]/*` |
| Intent-based titles: home, services, solutions, blog, contact, quote, industries, portfolio, about; shorter training description | page files |
| Per-service SEO titles/descriptions (19 services) | `prisma/data/seo.ts` (+ mock copy) |
| ItemList schema on services/solutions/industries index pages | index pages |
| Sitemap: real `updatedAt` only, no fake "now", excludes external-canonical posts, `revalidate=3600` | `app/sitemap.ts`, `types/index.ts` |
| robots: removed the non-standard `host` line; admin disallowed; `X-Robots-Tag: noindex` on `/admin/**` | `app/robots.ts`, `next.config.mjs` |
| llms.txt: founder, city, WhatsApp link, link to the training site | `app/llms.txt/route.ts` |
| Search Console / Bing verification via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_BING_SITE_VERIFICATION` | `app/layout.tsx` |
| `/training` links to the training site's course catalogue (`NEXT_PUBLIC_TRAINING_URL`) | `app/(marketing)/training/*`, `lib/config.ts` |
| Accordion ids unique per instance (`useId`) | `components/detail/Accordion.tsx` |
| `id` prop on `SectionHeading` and `Card` | `components/ui/*` |
| Reusable crawler: `node scripts/seo-check.mjs <url>` | `scripts/seo-check.mjs` |

### Training site — `training/` (training.globalantic.com)
| Change | Files |
|---|---|
| New `lib/seo.ts`: `pageMeta()` (self-canonical, OG/Twitter, robots), `privateMeta()`, `isIndexable()`, Course / EducationalOrganization / Breadcrumb / FAQ schema | `lib/seo.ts` |
| robots.txt and sitemap.xml (static pages + every published course, paged from the API; static pages still listed if the API is down) | `app/robots.ts`, `app/sitemap.ts` |
| Canonical on every public page; branded home title | all public `page.tsx` |
| `noindex, nofollow`: login, register, apply, application-status, forgot/reset password, verify-email | those pages |
| `noindex, follow`: filtered/searched `/courses?…` (canonical `/courses`), batch pages, certificate lookups with a query (they show a student's name) | `courses/page.tsx`, `batches/[id]`, `certificates/verify` |
| Course schema from real catalogue data: fee offer (INR), syllabus, skills, prerequisites, batches as `CourseInstance` (mode, dates, venue only if offline, trainer names) | `courses/[slug]/page.tsx` |
| OG image with the real logo; default OG image on every page | `app/opengraph-image.tsx` |

### Private portals — `intern/`, `employee/`, `admin/`, `trainer/`
`X-Robots-Tag: noindex, nofollow, noarchive` on every response, plus a robots.txt that does **not**
block crawling (so crawlers can see the noindex). Existing noindex metadata kept.

### Backend
| Change | Files |
|---|---|
| `X-Robots-Tag: noindex, nofollow` on API responses (public CMS images excluded) | `src/app.ts` |
| **Editorial approval**: new `cms.publish` permission (ADMIN automatically; grant it per user via Admin → Users). Editors (`cms.manage`) write drafts; publish/unpublish/archive/restore, editing or deleting live content, and setting `published`/`publishedAt`/`indexable` need `cms.publish`. An editor's "publish" request saves a draft with the message "Saved as a draft. A publisher (admin) must review and publish it." | `src/lib/editorial.ts`, `src/lib/permissions.ts`, `src/routes/admin.routes.ts`, `src/controllers/content.controller.ts`, `src/controllers/cms.controller.ts`, `packages/types`, `docs/ROLE_PERMISSION_MATRIX.md` |
| CRM summary: `byChannel` (Organic search / AI assistant / Paid / Social / Email / Campaign / Referral / Direct) and `byLandingPage`, each with won counts | `src/lib/channel.ts`, `src/services/crm.service.ts` |
| Admin portal: "By channel" and "By landing page" cards on Leads → Funnel & sources | `admin/app/(portal)/leads/reports/page.tsx` |
| Seeds: new service SEO copy; `prisma/seed-services.ts` fills SEO title/description **only** where empty or still the old auto-generated default | `prisma/seed.ts`, `prisma/seed-services.ts` |

## 2. Verification (all run on 2026-10-16, on this machine)

| Check | Result |
|---|---|
| `tsc --noEmit` — frontend, training, intern, employee, admin, backend (trainer via its build) | pass |
| `next lint` — frontend, training, trainer | 0 warnings/errors |
| Frontend unit tests (`npm test`, includes the new `tests/seo.test.ts`) | **64/64** |
| Backend: full suite on embedded Postgres | all files pass. `admissions` failed once on a 20 s transaction timeout while the machine was loaded, then **9/9** when rerun alone (known flake) |
| Backend `cms` (rewritten for the approval flow) / `crm` (+ channel tests) / `contracts` / `permissions` | 5/5, 8/8, pass, pass |
| **Production build, Next 15.5.27** — frontend (77 pages), training (18 routes), trainer | pass. This also clears the "production builds not verified" item from the Next 15 upgrade for these three apps |
| Crawl of the frontend build (`scripts/seo-check.mjs`, mock data, canonical `https://globalantic.com`) | **57 pages, 99 internal links, 0 errors.** Checked: 200 status, unique titles, descriptions, self-canonicals, one H1, OG tags, valid JSON-LD, FAQ answers visible on the page, img alt, broken links, sitemap ↔ robots, 404 + soft-404 per section, `/admin` noindex |
| Crawl of the training build (local API + seeded DB) | **16 pages, 23 links, 0 errors**; private pages noindex; sitemap lists both published courses |
| Preview build (`VERCEL_ENV=preview`) | `robots.txt: Disallow: /`, pages `noindex` — pass |
| Redirect `/services/ai-automation` → 308 `/services/ai-solutions` | pass |
| `X-Robots-Tag` on the API, `/admin/login` and the trainer portal | pass |
| OG images (both sites) rendered and inspected | real logo, 1200×630 |
| Mobile, 390 px emulation (About, blog post, `/training`) | no horizontal overflow; the new sections stack correctly |

Not verified: other portals' production builds (intern, employee, admin — typecheck only); the live
production site; Google's Rich Results Test (needs a public URL — run it after deploy). The last two
About-page CSS tweaks (founder card alignment, section background) were made after the screenshots.

Remaining crawl warnings are content, for the CMS: blog post "How to Choose the Right Tech Stack…" has an
80-character SEO title; `industries/manufacturing` has a 45-character description; the demo course descriptions are placeholders.

## 3. To deploy (in this order)

1. **Backend** (no migration): deploy the code. From then on editors can't publish; give trusted editors `cms.publish` in Admin → Users if wanted. Migrations 20261019/20/21 are still pending on Supabase from earlier work; this change doesn't depend on them.
2. **Frontend and training** on Vercel. Make sure `NEXT_PUBLIC_SITE_URL=https://globalantic.com` (frontend) and `NEXT_PUBLIC_TRAINING_URL=https://training.globalantic.com` (both apps) are set for Production. Optional: the verification tokens.
3. **Portals**: redeploy to pick up the header.
4. **Service SEO copy on production** (your approval needed; it writes to Supabase):
   `cd backend && npx tsx ../prisma/seed-services.ts --dry`, check the list, then run it without `--dry`. It changes only `seoTitle`/`seoDescription` that are empty or still the old default.
5. After deploy: `node frontend/scripts/seo-check.mjs https://globalantic.com --private /admin/login`, then the same for the training site. Then submit both sitemaps (see `SEARCH_MEASUREMENT_SETUP.md`).

## 4. Needs you (external accounts or content decisions)

- Search Console (DNS TXT) and Bing Webmaster; submit both sitemaps.
- Analytics: pick Cloudflare Web Analytics / Plausible (cookie-less), or GA4 with a consent banner.
- Google Business Profile: only if eligible as a service-area business; address hidden.
- Founder bio and profile URLs, when you want them published.
- Company social profile URLs in Admin → Site settings (they become `sameAs`).
- Real portfolio projects (client approval if named), enrich the industry pages, and confirm the `/training` offer text.
- Articles from `CONTENT_ROADMAP.md`, written and reviewed by people.

No ranking, traffic or AI-citation outcome is promised. These changes remove technical barriers and make
the facts consistent; results depend on content, competition and time. Measure them with Search Console
and the CRM channel report.
