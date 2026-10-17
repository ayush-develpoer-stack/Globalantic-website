# Blog Implementation Report (2026-10-17)

The existing blog backend (`blog_posts`, `blog_categories`, `/api/blog`, `/api/admin/blog`, `cms.manage` / `cms.publish`) was **extended, not duplicated**.

## Public routes (main site, Next.js App Router)
| Route | Behaviour |
|---|---|
| `/blog` | Featured (latest) article, cards with cover or placeholder, excerpt, category, author, date and reading time from the database. GET search `?q=` (results are noindex), category chips, pagination `?page=` (page 2+ is its own canonical), empty states |
| `/blog/[slug]` | Article: readable typography, cover with `coverImageAlt`, breadcrumbs plus BreadcrumbList JSON-LD, BlogPosting JSON-LD (dates = DB `publishedAt` / `updatedAt`; author = organisation name; image only if real), tags linking to tag pages, related posts (same category, then shared tags), share links (X, LinkedIn, WhatsApp, copy link — plain URLs, no third-party scripts), back link. Missing, unpublished or scheduled posts return a **real 404** |
| `/blog/category/[slug]` | Category archive. 404 for unknown or empty categories. In the sitemap |
| `/blog/tag/[slug]` | Tag archive. 404 when no published post has the tag. **noindex** and not in the sitemap, to avoid thin duplicate pages (owner can change this) |
| `/blog/preview/[id]` | Draft preview: forwards the visitor's own cookies to `GET /api/admin/blog/:id`, which needs a session with `cms.manage`. Shows a "Draft preview — not published" banner. `force-dynamic`, `no-store`, robots noindex/nofollow, `X-Robots-Tag` + `Cache-Control: private, no-store`, `Disallow: /blog/preview` in robots.txt, never in the sitemap. Signed-out visitors see "Sign in to the admin to preview" with no data |

**Content rendering is safe.** `frontend/lib/markdown.ts` parses Markdown into tokens that React renders as escaped text, with no `dangerouslySetInnerHTML`. Links are limited to https, site paths, mailto and #anchors; `javascript:`, `data:` and `//host` links stay plain text.

**Also fixed:** every JSON-LD block (26 files, 39 sites in the main site and the training app) used `JSON.stringify` inside `<script>`. A CMS title containing `</script>` could have injected script, which is stored XSS. They all use `jsonLd()` now (`frontend/lib/json-ld.ts`, `training/lib/json-ld.ts`), which escapes `<`, `>`, `&` and U+2028/U+2029. Test: `frontend/tests/json-ld.test.ts`.

## Admin capabilities (admin portal → Website → Blog)
- **Editing and publishing:** create, edit, publish and unpublish. Publishing needs `cms.publish`; editors only save drafts.
- **Archiving:** archive and restore. Scheduling uses a future `publishedAt`.
- **Fields:** title, slug (uniqueness check and format validation), excerpt, Markdown body, cover image (secure upload, stored as a relative path), **cover alt text** (new), category, tags, author, publication date, SEO title and description, canonical URL.
- **Previews:** "Preview on site" opens the real article layout through `/blog/preview/<id>`; it is disabled while there are unsaved changes. The modal is still available as "Quick preview".
- **List:** search (now debounced), status filter (draft, published, scheduled, archived), category filter, pagination (filter changes now reset to page 1).
- **Concurrent edits:** the editor sends the `updatedAt` it loaded. A save on top of a newer change returns **409** with a reload prompt, and nothing is overwritten. Saves without the token behave as before.
- **Timestamps and audit:** `publishedAt` and `updatedAt` are tracked, and create, update, publish, unpublish, archive and delete are recorded in the audit log.
- **Notifications:** publishing a draft creates a "content" notification for staff with `cms.publish`. An editor's attempt to publish creates an "awaiting approval" notification.
- **Permissions:** enforced on the server (`cms.manage`, plus `cms.publish` for live changes). Titles that are URLs are rejected (422).

## Initial content
Six **draft** articles were seeded on production on 2026-10-17. They are unpublished: `published=false` and `publishedAt` is null, so `/api/blog/<slug>` returns 404 publicly.

1. How to Choose the Right Website Development Approach for Your Business
2. Custom Software vs Off-the-Shelf Software: How to Decide
3. How a CRM Can Improve Lead Management
4. Practical Uses of AI Automation in Small Businesses
5. Essential Features of a Modern Business Website
6. Website SEO: Technical Foundations and Content Strategy

Each one starts with the note **"Draft for review — not published…"**, which has to be deleted before publishing. They contain no statistics, studies, client results or ranking guarantees; a test enforces this. The two existing published posts from 2026-09-21 are unchanged.

## SEO
- Unique title, description and canonical per post, category page and listing page, using the existing `buildMetadata` helpers.
- BlogPosting structured data matches the visible content and uses database dates.
- The sitemap includes public posts (`lastModified` = `updatedAt`) and category pages that have posts. Drafts, scheduled and archived posts, previews, tag pages and admin URLs are excluded.
- Indexing still follows the existing `isIndexable()` gate.
- Rankings, traffic and AI-search citations cannot be guaranteed, and none are claimed.

## Files
- **Frontend:**
  - Pages: `app/(marketing)/blog/{page,[slug]/page,category/[slug]/page,tag/[slug]/page,preview/[id]/page}.tsx`.
  - Components: `components/blog/{ArticleView,ArticleContent,BlogListing,BlogCard,CopyLinkButton}`.
  - Libraries: `lib/{markdown,blog,blog-data,json-ld}.ts`, `app/sitemap.ts`, `app/robots.ts`, `next.config.mjs` (preview headers).
- **Admin:** `admin/lib/BlogEditor.tsx`, `admin/lib/CmsList.tsx`.
- **Backend:** `validators/index.ts` (`coverImageAlt`, `expectedUpdatedAt`, title guard), `controllers/content.controller.ts`.
- **Data:** `prisma/data/blog-drafts.ts`.
- **Tests:**
  - `frontend/tests/portfolio-blog.test.ts`: search, tags, related posts, pagination, public-post rules, Markdown safety, sitemap and robots.
  - `frontend/tests/json-ld.test.ts`.
  - `frontend/tests/seo.test.ts`: robots list updated.
  - `backend/tests/notifications.test.ts`: stale-save 409.
  - `backend/tests/content-seed.test.ts`.
