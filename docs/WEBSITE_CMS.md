# Website CMS (blog, projects, services, landing pages, site settings)

Written 2026-10-16. Migration `20261021090000_cms_campaigns_and_site` (additive).

## Where it lives
- Admin portal → **Website**: Blog, Projects, Services, Landing pages, Site settings.
- API: the existing `/api/admin/{blog,portfolio,services,solutions,industries}` routes, now guarded by `cms.manage`, so ADMIN and EDITOR can use them.
  - `/api/admin/settings` and `/api/admin/faqs` stay ADMIN-only.
  - The embedded admin at `frontend/app/admin` keeps working: lists return a plain array unless `?page=` is given.

## Rules
| Content | Visible on the public site when |
|---|---|
| Blog post | `published` **and** not archived **and** (`publishedAt` empty or in the past). A future date means the post is scheduled. |
| Project | `published` and not archived. Client name and outcome are shown only when **Client approved** is ticked. |
| Landing page (`/lp/[slug]`) | `published`, not archived, and its service is published. Pages are noindex unless marked indexable. |

- Archiving unpublishes. An archived item must be restored (as a draft) before it can be published again.
- Unpublishing keeps the original publication date.
- Slugs: lowercase letters, numbers and single hyphens, unique. The admin form checks availability as you type.
- Images: `https://` URLs or files uploaded through the CMS (`/api/files/public/<id>`).
- Every create, update, publish, archive and delete is written to the audit log.

## Services
`prisma/data/services.ts` holds the original 14 services. `prisma/data/services-extra.ts` adds Web Application Development, API Integration, Website Maintenance, AEO and GEO, plus each service's hero style, audience and industries.

The seed **only creates missing services and fills empty new fields**. It never overwrites edits made in the CMS.
To add the 5 new services to production after the migration, run only `npx tsx ../prisma/seed-services.ts --dry` (from `backend/`), check the output, then run it without `--dry`.

**Do not run the full `prisma:seed` on production.** It creates `admin@globalantic.com` with a default password if that account is missing, and overwrites solutions, industries and other content.

## Google Maps
Site settings → *Google Maps link* (`https://maps.app.goo.gl/…`) and *embed src* (`https://www.google.com/maps/embed?pb=…`). The embed needs no API key.

Leave both empty until the office address is verified. The contact page then shows no map.
