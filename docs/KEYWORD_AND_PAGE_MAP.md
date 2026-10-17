# Keyword & page map

One primary search intent per URL, so pages don't compete with each other. Keyword phrases are
**intent groups, not measured volumes**: no keyword tool or Search Console data was available.
Once Search Console has 4–8 weeks of data, replace the "secondary" column with the real queries
each page receives (Performance → Pages → Queries) and adjust titles.

Location: only Bhopal, India is verified. "Bhopal" appears in the home title, About and
Organization data — not stuffed into every service title. Add city modifiers to a page only
after Search Console shows local queries for it.

## globalantic.com — services (`/services/[slug]`, CMS-managed)

| Page | Primary intent | Secondary intents | Search title (`prisma/data/seo.ts`) | Funnel |
|---|---|---|---|---|
| `/services/web-development` | website development company / services | business website design, SEO-friendly website, website redesign, Next.js website | Website Development Services — Fast, Mobile-First, SEO-Ready | Enquiry |
| `/services/web-application-development` | web application development | customer portal, SaaS development, dashboard development, booking system | Web Application Development — Portals, Dashboards & SaaS | Enquiry |
| `/services/software-development` | custom software development | business software, internal tools, workflow automation software | Custom Software Development for Your Business Processes | Enquiry |
| `/services/mobile-app-development` | mobile app development | Android app development, iOS app, cross-platform app, React Native | Mobile App Development — Android & iOS Apps | Enquiry |
| `/services/ai-solutions` | AI development / AI automation for business | AI chatbot development, document processing, business process automation | AI Development & Business Automation Services | Enquiry |
| `/services/crm-development` | custom CRM development | CRM software for sales team, lead management system, WhatsApp CRM | Custom CRM Development — Leads, Customers & Sales Pipeline | Enquiry |
| `/services/erp-development` | custom ERP development | inventory management software, ERP for manufacturing, multi-branch ERP | Custom ERP Development — Inventory, Finance, HR & Operations | Enquiry |
| `/services/ecommerce-development` | e-commerce website development | online store development, payment gateway integration, B2B ordering | E-commerce Website Development — Online Stores with Payments | Enquiry |
| `/services/ui-ux-design` | UI/UX design services | app UI design, dashboard design, design system | UI/UX Design Services — Websites, Apps & Dashboards | Enquiry |
| `/services/api-integration` | API development & integration | payment/CRM integration, REST API development, third-party integration | API Development & Integration Services | Enquiry |
| `/services/cloud-services` | cloud hosting & deployment | DevOps services, server setup, backups and monitoring | Cloud Hosting, Deployment & DevOps Services | Enquiry |
| `/services/website-maintenance` | website maintenance services | website support, security updates, monthly maintenance | Website Maintenance & Support Services | Enquiry / retainer |
| `/services/seo` | SEO services | technical SEO audit, on-page SEO, local SEO | SEO Services — Technical SEO, Content & Local Search | Enquiry |
| `/services/aeo` | answer engine optimization | FAQ/structured data optimisation, featured snippets | AEO — Answer Engine Optimization Services | Enquiry |
| `/services/geo` | generative engine optimization | AI search visibility, brand accuracy in AI assistants | GEO — Generative Engine Optimization Services | Enquiry |
| `/services/digital-marketing` | digital marketing for lead generation | digital marketing agency, performance marketing | Digital Marketing Services for Lead Generation | Enquiry |
| `/services/social-media-marketing` | social media marketing services | Instagram marketing, LinkedIn content, social media management | Social Media Marketing — Content & Campaign Management | Enquiry |
| `/services/google-meta-ads` | Google Ads / Meta Ads management | PPC management, Facebook ads, lead generation ads | Google Ads & Meta Ads Management | Enquiry |
| `/services/branding` | branding services | logo design, brand identity, brand guidelines | Branding Services — Logo, Identity & Brand Guidelines | Enquiry |

Legacy short URLs (`/services/ai-automation`, `/services/web-app-development`, `/services/api-development`,
`/services/maintenance`) 308-redirect to the canonical pages above.

## globalantic.com — other pages

| Page | Primary intent | Notes |
|---|---|---|
| `/` | IT / software / app / AI development company (Bhopal, India) | Title: "Globalantic — Web, Software, App & AI Development Company in Bhopal, India" |
| `/services` | IT services overview | Hub; ItemList of all services |
| `/solutions` + 10 × `/solutions/[slug]` | ready-to-adapt systems (CRM, ERP, LMS, booking, SaaS, dashboards, internal tools) | Product-style intent; link to the matching service page (e.g. CRM solution ↔ CRM development) |
| `/industries` + 12 × `/industries/[slug]` | "software for <industry>" | Template-generated; enrich before promoting (see roadmap) |
| `/portfolio` + `/portfolio/[slug]` | proof / case studies | Only real, approved projects (client name shown only when `clientApproved`) |
| `/blog` + posts | informational (guides, comparisons, costs explained) | Each post links to 1–4 related services via tags = service slug |
| `/about` (+ `#founder`) | "Globalantic", "who founded Globalantic", "Ayush Ahirwar" | Entity page: facts list, founder card, company FAQ |
| `/contact`, `/get-a-quote` | navigational / transactional | WhatsApp, phone, email, enquiry form |
| `/training` | full stack development internship (Bhopal/online) | Main-site programme page; links to the training site catalogue |
| `/careers` | jobs at Globalantic | |
| `/lp/[slug]` | paid campaigns | `noindex` unless the CMS marks one indexable; never in the sitemap |

## training.globalantic.com

| Page | Primary intent | Indexing |
|---|---|---|
| `/` | software development training & internships | index |
| `/courses` | course catalogue | index; filtered views `noindex, follow` → canonical `/courses` |
| `/courses/[slug]` | "<course name> course / training" | index; Course schema with fee offer and scheduled batches |
| `/programs/training`, `/programs/internship`, `/programs/certificate` | programme-type intent | index |
| `/batches` | upcoming batches | index; individual `/batches/[id]` `noindex, follow` (short-lived; course page is canonical) |
| `/fees`, `/learning-modes`, `/faq`, `/referral`, `/contact`, `/privacy`, `/terms` | informational | index |
| `/certificates/verify` | verify a Globalantic certificate | landing indexed; any looked-up result `noindex` |
| `/login`, `/register`, `/apply`, `/application-status`, `/forgot-password`, `/reset-password`, `/verify-email` | — | `noindex, nofollow` |

Overlap rule: the main site describes *that training exists* and the one flagship programme; the
training site owns course-level intent. Don't copy course descriptions onto the main site.

## Never indexed

`/admin/**` on the main site; every page of intern / employee / admin / trainer portals; the API.

## Gaps considered and not built (yet)

| Candidate | Why not now | Trigger to build |
|---|---|---|
| "Web development company in Bhopal" (location page) | One verified city and no address; the home/About pages already carry it. A separate page would mostly duplicate them. | Search Console shows Bhopal queries landing on generic pages, and there is unique local content (local projects, meeting info). |
| White-label / agency development page | Not confirmed as an offered service (only "agencies needing a development partner" as an audience). | You confirm the offer, terms and process. |
| Pricing / cost pages | No approved prices. | Approved price ranges or a published pricing approach. |
| Service × industry pages | Would be thin and repetitive (doorway risk). | Never as a template; only as a real case study. |
