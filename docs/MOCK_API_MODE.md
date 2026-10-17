# Mock API mode (frontend)

`frontend/` can run with **no backend**. Every data access goes through one service layer, and each service has two interchangeable implementations: **mock** (in-memory fixtures) and **api** (the Express REST API). Components never import fixtures and never call `fetch` directly.

```
Component / page
   │  calls
   ▼
hooks/useServiceQuery, hooks/useListParams      ← loading / error / retry, URL-synced filters
   │  call
   ▼
services/*.service.ts  ──► mock impl ──► lib/mock/store.ts (in-memory) ◄── lib/mock/fixtures/*
                       └─► api impl  ──► lib/api/http.ts ──► NEXT_PUBLIC_API_URL
   (both throw lib/api/errors.ServiceError; both validate with lib/validation/*)
```

## Choosing the mode

| Variable | Values | Default |
|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `mock`, `api` | `mock` in `next dev`; **`api` in production builds** |
| `NEXT_PUBLIC_API_URL` | e.g. `https://api.globalantic.com/api` | `http://localhost:4000/api` |
| `NEXT_PUBLIC_MOCK_SCENARIO` | `normal`, `empty`, `error`, `slow` | `normal` |

Production defaults to `api`, so a deployment can't ship mock data by accident. A mock-mode production build has to be requested explicitly with `NEXT_PUBLIC_DATA_SOURCE=mock`. Only `NEXT_PUBLIC_*` variables are read, and no backend secret is referenced anywhere in `frontend/` (see `lib/api/config.ts`).

## What the mock layer does

| Concern | Behaviour |
|---|---|
| Public content | Services (14), solutions (10), industries (12), blog posts (2), technologies, FAQs and site settings come from `lib/mock/fixtures/content/*`. Those files are verbatim copies of `prisma/data/*`, which stays the source of truth; re-copy them when the seed changes. The portfolio is intentionally empty, with no fabricated projects. |
| Leads | `lib/mock/fixtures/leads.ts` holds 14 contacts, 12 training applications, 6 career applications and 13 subscribers. All of them are **fictional**: invented names, `example.com` addresses (RFC 2606) and 555 phone numbers. IDs and timestamps are fixed, so renders are deterministic. |
| Store | `lib/mock/store.ts` is a single in-memory database per JavaScript runtime. In the browser it **lasts for the tab**: it survives client-side navigation, a full reload resets it, and nothing is written to storage. Every read returns a deep copy, so UI code can't mutate the store by accident. |
| Validation | Writes run the same zod schemas as the forms (`lib/validation/*`), which mirror `backend/src/validators/index.ts`. Invalid input rejects with `ServiceError(400, fieldErrors)`, in the same shape the API uses. |
| API rules reproduced | Unique slugs (409 with a `slug` field error), 404 for unknown ids, blog `publishedAt` set or cleared on publish/unpublish, newsletter re-subscribe returns "You are already subscribed.", and login fails with the generic "Invalid email or password". |
| Latency | Browser calls wait 350 ms (2 s in the `slow` scenario). Server rendering has no delay. |
| Scenarios | `empty` makes every admin list and the dashboard return no rows. `error` makes admin reads fail like a network error, which shows the error state and its retry button. Scenarios **don't** affect writes, so validation behaves normally. |
| Auth | One fictional demo account (`lib/mock/fixtures/users.ts`), shown on the login page **only in mock mode**. The session is a `sessionStorage` flag, kept for the tab. It unlocks only the in-browser mock store and is not a real credential. |
| Cross-screen effects | A contact, training, career or newsletter form submitted in the same tab appears immediately in the admin inbox and the dashboard counts. |

### Switching scenarios without rebuilding (manual QA)

In the browser console on any page:

```js
localStorage.setItem('globalantic.mockScenario', 'error');  // or 'empty' | 'slow' | 'normal'
location.reload();
localStorage.removeItem('globalantic.mockScenario');        // back to the env default
```

This override is read only by the mock layer and has no effect in API mode.

## Service catalogue

| Service | File | Functions | API endpoints used in API mode |
|---|---|---|---|
| Public content | `services/content.service.ts` (accessed via `lib/api.ts`) | `getServices`, `getService(slug)`, `getSolutions`, … `getSettings` | `GET /services`, `/services/:slug`, … `/settings` (ISR 300 s). Each resolves to `null` on failure, so pages show their fallback. |
| Forms | `services/forms.service.ts` | `submitContact`, `submitTraining`, `submitCareer`, `subscribeNewsletter` | `POST /contact`, `/training/apply`, `/careers/apply`, `/newsletter` |
| Auth | `services/auth.service.ts` | `login`, `logout`, `me` | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (a 401 from `me()` means signed out) |
| CMS | `services/admin/cms.service.ts` | `list(resource, query)`, `get`, `create`, `update`, `remove`, `setPublished` | `GET/POST /admin/:resource`, `GET/PUT/DELETE /admin/:resource/:id`, `PATCH /admin/:resource/:id/publish|unpublish` |
| Leads | `services/admin/leads.service.ts` | `list(kind, query)`, `updateStatus(kind, id, status)`, `remove(kind, id)` | `GET /admin/:kind?search&status`, `PUT /admin/:kind/:id`, `DELETE /admin/:kind/:id` |
| Dashboard | `services/admin/dashboard.service.ts` | `get()` | `GET /admin/dashboard` |
| Settings | `services/admin/settings.service.ts` | `get()`, `update(input)` | `GET/PUT /admin/settings` |

All list functions take a `ListQuery` (`search`, `status`, `sort`, `direction`, `page`, `pageSize`) and return `Paginated<T>` (`items` plus `meta: { page, pageSize, total, totalPages }`).

## Switching to the real API

1. Set `NEXT_PUBLIC_DATA_SOURCE=api` and `NEXT_PUBLIC_API_URL` (production builds default to `api` already).
2. Make sure the backend's `FRONTEND_URL` CORS allow-list includes the site origin, because the client sends cookies with `credentials: 'include'`.
3. No component or page changes are needed: every API implementation already exists and calls the endpoints listed above.
4. **Known API gaps the adapter works around** (remove each workaround when the backend gains the feature):
   - The admin list endpoints don't paginate or sort (backend issue GA-012), so the API adapter fetches the filtered list and applies `lib/query.ts` paging and sorting on the client. When the backend supports `?page&limit&sort`, replace those adapter lines with query parameters and return the server's `meta`.
   - Subscribers have no status endpoint, so the newsletter inbox is list and delete only in both modes.
   - The login response includes the JWT in its body (backend issue GA-007). The adapter ignores it and relies on the httpOnly cookie.
5. To remove the mock code completely later, delete `lib/mock/` and the `mock` objects in `services/*`. Nothing else imports them except the login page's mock-only demo hint.

## Tests

`npm --workspace frontend test` runs 40 unit tests with Node's built-in runner (Node ≥ 22.18; verified on 24.12). They cover the query engine, validation parity, every mock service including its error paths, the scenarios, the theme pre-paint script, the post-login redirect guard and the HTTP client's error mapping. See `docs/FRONTEND_PROGRESS.md` for the exact results.
