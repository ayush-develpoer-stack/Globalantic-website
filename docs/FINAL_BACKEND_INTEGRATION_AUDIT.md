# Final Backend Integration Audit

**Started:** 2026-10-15. This audit is based on the code: page inventory per app, route inventory, and a grep sweep. Earlier docs were not trusted.
**Database:** Supabase still has only `init`. `20261015090000_training_platform` and `20261016090000_employee_portal_and_files` are pending approval. All verification uses an embedded local PostgreSQL with every migration applied.

## 1. Baseline (before this pass)
| App | Screens | Data source |
|---|---|---|
| frontend (site + legacy CMS admin) | 18 site pages; CMS admin: dashboard, services, solutions, industries, portfolio, blog, contacts, training leads, careers, newsletter, settings | Real API by default (mock only with an explicit `NEXT_PUBLIC_DATA_SOURCE=mock`); browser-verified 2026-10-15 |
| training | 23 routes | Real API |
| intern | 22 routes | Real API |
| trainer | 13 routes | Real API (assigned-batch checks on the server) |
| employee | 11 routes | Real API |
| admin | 31 routes | Real API |

Sweep:
- No TODO/FIXME.
- No direct `fetch` in components (all go through `@globalantic/api-client` or `frontend/lib/api/http.ts`).
- No localStorage CRUD.
- No hard-coded colours outside the required `themeColor` meta.

## 2. Gaps found against the requested scope
| # | Requested | Found in code | Classification |
|---|---|---|---|
| G1 | Validation errors → **422** | Zod and service field errors return **400** | Missing (status contract) |
| G2 | Admin dashboard: user / student / employee / trainer counts, leads, pending referrals, recent activity | Training-only stats | Partially connected |
| G3 | Users: details, edit allowed fields, admin-triggered secure password reset, **assign permissions** | List + role change only | Missing backend |
| G4 | Roles & permissions: load permission catalogue, edit grants, remove safely | Static map only; read-only matrix | Missing backend |
| G5 | Student admin notes | none | Missing backend + DB |
| G6 | Course / CMS image upload | URL text fields only | Missing backend (public image storage) |
| G7 | Admissions: "request more information" | none | Missing backend + DB |
| G8 | Employees: activate/deactivate by HR | Only ADMIN via the training endpoint | Missing authorization path |
| G9 | Trainers: profile update, workload view | List + assignments only | Partially connected |
| G10 | Referrals: list codes with clicks | Only aggregate click count | Partially connected |
| G11 | Reports by type with **server-side date filters**; exports audited | One summary report, no date filters, exports not audited | Partially connected |
| G12 | Audit: login success/failure, logout, permission denials, data exports, webhook signature failures | Not logged | Missing |
| G13 | Server-side sorting on tables | Fixed ordering only | Missing |
| G14 | CMS FAQs management | Public read only; no admin CRUD | Missing backend + UI |
| G15 | CMS "Pages" | No model or UI | Not present in the product; documented, not invented |

The resolution of each gap is recorded in §3 at the end of this pass.

## 3. Resolution (verified 2026-10-15)
| # | Resolution | Evidence |
|---|---|---|
| G1 | `ApiError.validation` + Zod errors → **422**. Malformed or tampered requests stay 400. The main site's mock layer mirrors 422. | 140/140 backend tests (validation assertions updated); main-site tests 43/43 |
| G2 | `GET /api/platform/overview`, permission-aware. Admin dashboard rebuilt on it. | Test (ADMIN/FINANCE/HR sections). Browser: real counts, e.g. ₹1,000 this month, 2 students |
| G3 | User detail, name/phone edit (409 on phone clash), admin-initiated reset **link**, suspend/reactivate, role change | Tests. Browser: `/users/[id]` renders role vs effective permissions and actions |
| G4 | Individual grants (`user_permission_grants`), non-grantable set, permission catalogue. Roles stay fixed by design. | Tests (escalation blocked, immediate effect, revocation, audit) |
| G5 | Internal notes (`user_notes`); subjects get 403 | Test; admin student page panel |
| G6 | Public `COURSE_IMAGE` / `CMS_IMAGE` storage + `/api/files/public/:id`. Course form and CMS editors upload images. | Test. **Browser: course image upload → 201, field filled, preview loaded from `/files/public/…`** |
| G7 | `REQUEST_INFO` review action + student `/respond` | Test. **Browser: admin sees the request, student sees the notice, response submitted, admin sees the response** |
| G8 | `PATCH /api/hr/employees/:id/status` (HR), sessions revoked | Test; admin employee page action |
| G9 | Trainer workload in `/trainers`; profile edits via `/users/[id]` | Test; browser render |
| G10 | `GET /referrals/codes` + admin "Codes" tab | Test; build |
| G11 | `GET /api/platform/reports/:type?from&to&export=true`, bounded to 2000 rows, exports audited | Test (date filter, 403 per type, `report.exported`); browser render |
| G12 | Audit: login success/failed/blocked (email hash for unknown accounts), logout, `security.forbidden`, webhook signature failures, exports, grants, edits | Test |
| G13 | Whitelisted `sort=field:dir` on 7 lists; sortable headers with `aria-sort` | Test (422 on non-whitelisted fields). **Browser: header click → `sort=title:asc`, aria-sort ascending** |
| G14 | `/api/admin/faqs` CRUD + legacy CMS "FAQs" page | Test. **Browser: Create FAQ → 201, listed** |
| G15 | No "Pages" model exists; not invented. Documented as a product gap. | — |

### Screen status after this pass
**Connected to the real API:** every screen in training, intern, trainer, employee, admin and the legacy CMS.
- Every endpoint behind them is covered by the backend API tests.
- Browser-verified (rendered and/or driven with real data, across this and earlier passes): the main site + CMS (contact form, admin login, leads, services, FAQs), training public pages, the intern dashboard / applications / referrals / attendance / payments / info-request response, the trainer dashboard / attendance / report, the employee portal, and admin dashboard / users / user detail / employees / leave / reports / trainers / applications / courses (image upload, sorting).
- Not individually clicked in a browser: some secondary admin actions (e.g. grant/revoke dialogs, payout dialog, referral code toggles). Their endpoints are API-tested.
- No screen uses mock data unless `NEXT_PUBLIC_DATA_SOURCE=mock` is set explicitly.

**Requires environment configuration:** payments (Razorpay keys), email (Resend domain), `UPLOAD_DIR` + `PUBLIC_API_URL` in production. (The Supabase migrations were applied 2026-10-15.)
