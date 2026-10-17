# Portfolio Implementation Report (2026-10-17)

## Summary
- All eight real projects are stored in the existing `portfolio_projects` table and served by the existing `/api/portfolio` API. They are managed in the existing admin under Website → Projects.
- No new model or API was needed. Two columns were added: `coverImage` and `coverImageAlt`.
- All eight were **seeded on production (Supabase) and published on 2026-10-17**, with the owner's approval.
- They show category-specific "Project image coming soon" covers until screenshots are uploaded.

## The eight projects: what was verified
Each live site was read on 2026-10-17. Only visible functionality is described. Client-side figures were deliberately left out: ratings, review counts, "500+ trips", "5000+ customers", investment returns, AMFI/BSE badges.

| # | Slug | Category · Industry | Link (as supplied) | Globalantic credit on the site | Description basis |
|---|---|---|---|---|---|
| 1 | `maharaj-tours-and-travels-website` | Travel & Tourism Website · Travel & Tourism | https://maharajtourandtravels.com/ | "Developed by Globalantic" | Verified: fleet with per-km rates, tours and temple tours, booking form, call and WhatsApp, contact form, blog |
| 2 | `maharaj-car-rental-bhopal-landing-page` | Car Rental & Lead Generation · Travel & Tourism | https://maharajtourandtravels.com/car-rental-bhopal/index.html | none on the page | Verified: price packages, fleet, outstation routes, booking form, pre-filled WhatsApp links, FAQ. Presented as a landing page **within** project 1 |
| 3 | `ideal-hair-website` | Business Website · Beauty & Personal Care | https://idealhair.in/ (supplied as `http://`; verified 301 → https) | "Powered by Globalantic" | Verified: shop with category filters and cart, login and registration, services, gallery, WhatsApp |
| 4 | `news-sukh-dukh-news-platform` | News & Publishing Platform · News & Media | https://newssukhdukh.in/ | "Develop by Globalantic" | Verified: Hindi news, category navigation, article cards, curated sections, search, policy pages. Technologies **Next.js** and **Cloudinary** verified from asset URLs |
| 5 | `nakul-pathology-lab-crm` | Healthcare CRM / Business Software · Healthcare | https://crm.nakulpathologylab.in/ | none (login page only) | **Minimal by owner's choice.** Only the page title "Nakul Pathology Lab \| CRM" is public. The login page was not bypassed and no patient data was accessed |
| 6 | `nakul-pathology-lab-website` | Healthcare Website · Healthcare | https://nakulpathologylab.in/ | none on the page | Verified: tests and packages, online booking with home sample collection, online report access, FAQ |
| 7 | `nexgen-technologies-website` | IT & Digital Solutions Website · IT Services | https://nexgentechnologie.com/ | none on the page | Verified site structure. Its own figures were not reused (they are inconsistent between sections; see below) |
| 8 | `investor-goal-website` | Financial / Business Website · Financial Services | https://investorgoal.in/ | "Designed & Developed by Globalantic" | Verified: service pages, SIP calculator, enquiry and callback forms, blog, FAQ. **No** returns or regulatory claims were repeated |

**Ownership:** the owner confirmed on 2026-10-17 that all eight are Globalantic work. Projects 2, 5, 6 and 7 carry no Globalantic credit on their own pages.

**Client names:** each record stores `client`, but the existing public rule hides it until `clientApproved` is ticked in admin. It was left **unticked**, because client approval to be named was not confirmed. The project titles themselves name the business, as the public sites do.

**Related projects:** the two Maharaj entries share the industry *Travel & Tourism*, and the two Nakul entries share *Healthcare*. The detail page lists "Related projects" by industry, and the descriptions state the relationship.

### Things the owner may want to tell those clients (seen on their sites; not fixed here)
- **investorgoal.in:** the process section contains Lorem-style placeholder text, and its counters show 0 / 0%.
- **nexgentechnologie.com:** client and project figures contradict each other (100+ vs 30+ clients, 250+ vs 50+ projects, 5+ vs 2+ years), and some service links use two different paths.
- **The car-rental page and nakulpathologylab.in:** neither has a Globalantic credit, if you want one.

## Website features (frontend)
- **Cards:** `PortfolioCard` uses `coverImage`, then `images[0]`, then a **category placeholder** (`ProjectPlaceholder`).
  - The placeholder has a distinct SVG motif and colour per family: travel, healthcare, media, commerce, finance, software, web.
  - It shows a visible "Project image coming soon" label and keeps a fixed aspect ratio, so there's no layout shift.
- **Listing (`/portfolio`):** category chips, text search, an empty state with "Clear filters", and an aria-live result count. Every card stays in the server-rendered HTML.
- **Detail (`/portfolio/[slug]`):**
  - "Visit live site" link (https only).
  - Cover image or a large placeholder.
  - Features, technologies, related projects, and breadcrumbs with BreadcrumbList JSON-LD.
  - CreativeWork JSON-LD and the OG image only when a real image exists.
  - Unique title, description and canonical.
- **Images:** relative upload paths (`/api/files/public/<id>`) resolve against the API origin (`mediaUrl()` in `frontend/lib/images.ts`).
- **Sitemap:** published, non-archived projects only.

## Admin: how to upload or replace a project image
1. Admin portal → **Website → Projects**, then open the project.
2. Under **Cover image**, click upload and choose a screenshot (JPEG, PNG or WebP). It is stored through the existing secure file service with purpose `CMS_IMAGE` and saved as `/api/files/public/<id>`.
3. Fill in **Alt text**. It is required when a cover is set; describe what the screenshot shows.
4. Save. The site shows the image immediately. Remove or replace it at any time, with no code change.

A save on top of someone else's newer edit is refused (409) with a "reload" message, instead of overwriting their work.

## Related fixes made during this work
- **The broken live row** (title and slug were an upload URL, category "Trump India 100% Tariff", created 2026-10-17 05:38 UTC) was **unpublished**, not deleted, with the owner's approval. An audit-log entry records it. Fix or delete it in admin.
- **Root cause, absolute URLs:** with `PUBLIC_API_URL` unset, uploads made through a local API store `http://localhost:4000/...` URLs in production rows. The admin now stores relative paths. **Set `PUBLIC_API_URL` in production.**
- **Root cause, URL in the title:** the row most likely came from the main site's legacy embedded admin (`/admin/dashboard/portfolio`), where an image URL can be pasted into Title. The API now **rejects titles that are URLs** (422) for projects and posts (`backend/src/validators/index.ts`, test `content-seed.test.ts`).

## Files
- **Data and seed:** `prisma/data/portfolio-real.ts`, `prisma/seed-portfolio-blog.ts` (create-only, idempotent, `--dry` supported).
- **Schema:** `prisma/schema.prisma` and migration `20261022090000_admin_notifications_and_media` (`coverImage` and `coverImageAlt` columns).
- **Backend:** `validators/index.ts` (cover fields, title guard, `expectedUpdatedAt`) and `controllers/content.controller.ts` (publish events, 409 on stale save).
- **Admin:** `admin/lib/ProjectEditor.tsx`, `upload.tsx`, `GalleryField.tsx`, `cms.tsx`.
- **Frontend:**
  - Components: `PortfolioCard`, `PortfolioGrid`, `ProjectPlaceholder`.
  - Pages: `app/(marketing)/portfolio/[slug]/page.tsx`.
  - Libraries: `lib/portfolio.ts`, `lib/images.ts`, `app/sitemap.ts`.
- **Tests:**
  - `backend/tests/content-seed.test.ts` (5): data passes the CMS validators, no unverified claims, seed is idempotent and never overwrites edits, client stays hidden, URL titles are rejected.
  - `frontend/tests/portfolio-blog.test.ts`: placeholder per category for all 8, cover and alt fallback, related projects, filter and search, `mediaUrl`, sitemap.
