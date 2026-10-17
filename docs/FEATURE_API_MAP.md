# Feature → API map (page by page)

**Date:** 2026-10-15. Written after the "Service temporarily unavailable" incident (root cause in
[DEPLOYMENT.md](./DEPLOYMENT.md#incident-2026-10-15-service-temporarily-unavailable)).

All apps call the API through one client:
- `packages/api-client`: training, intern, trainer, employee and admin.
- `frontend/lib/api/http.ts`: main site and legacy CMS.

The base URL comes from `NEXT_PUBLIC_API_URL`. In development it defaults to `http://localhost:4000/api` (also set in each app's `.env.development`). A production build has **no** localhost fallback: if the variable is missing, every call fails with "not configured to reach the server".

Both clients have a 15 s timeout and a 60 s timeout for uploads. A `GET` is retried once after a network error or a 502/503/504. Writes are never retried, and that includes payments.

## Status legend
| Status | Meaning |
|---|---|
| **Connected** | Wired to the real API and covered by the backend API tests (embedded Postgres). Screens marked † were also driven in a browser against a local copy of the database. |
| **Fixed** | Was failing on the live Supabase database (503 from missing tables/columns) and now responds correctly after the migrations were applied on 2026-10-15. |
| **Blocked** | Code is wired, but it needs production configuration or credentials that are not present. |
| **Missing** | Not implemented. Nothing fakes it. |

"Live" means it was checked against the running API on :4000 backed by Supabase on 2026-10-15. Live checks were read-only: public GETs, 401 guards, and 422/400/403/404 responses. No authenticated write was run against Supabase, because that would put test data in the real database. Authenticated flows were verified on local database copies.

## Main site — `frontend/` (:3000)
| Page | API | Status |
|---|---|---|
| Home, About | `GET /services`, `/solutions`, `/industries`, `/technologies`, `/faqs`, `/settings` | Connected · live 200 |
| Services / Solutions / Industries / Portfolio (+ `[slug]`) | `GET /services[/:slug]`, `/solutions[/:slug]`, `/industries[/:slug]`, `/portfolio[/:slug]` | Connected · live 200 (portfolio has 0 rows) |
| Blog, Blog post | `GET /blog`, `/blog/:slug`, `/blog-categories` | Connected · live 200 |
| Contact | `POST /contact` | Connected † · live 422 on invalid input |
| Careers | `GET /careers`, `POST /careers/apply` | Connected |
| Training (marketing) | `POST /training/apply` | Connected |
| Newsletter (footer) | `POST /newsletter` | Connected |
| Privacy / Refund / Terms | static | — |
| CMS `/admin/login` | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | **Fixed** (login was 503: `users.status` column missing) † |
| CMS dashboard | `GET /admin/dashboard` | Connected † |
| CMS services/solutions/industries/portfolio/blog | `GET/POST/PUT/DELETE /admin/:resource`, `PATCH …/publish\|unpublish`, `POST /files?purpose=CMS_IMAGE` | Connected † (upload: see Blocked/UPLOAD_DIR) |
| CMS contacts/training/careers/newsletter | `GET /admin/:kind`, `PUT /admin/:kind/:id` | Connected † |
| CMS FAQs, Settings | `/admin/faqs` CRUD, `GET/PUT /admin/settings` | Connected † |

## Training site — `training/` (:3001)
| Page | API | Status |
|---|---|---|
| Home, Courses, Course detail | `GET /training/courses[/:slug]` | **Fixed** · live 200 (no courses published yet, so the list is empty) |
| Batches, Batch detail | `GET /training/batches[/:id]` | **Fixed** · live 200 |
| Fees, Learning modes, Programs, FAQ | course/batch data + `GET /faqs` | **Fixed** / Connected |
| Referral landing | `GET /training/referrals/program` (reward amount comes from the server, ₹2,000 by default), `POST /training/referrals/click`, `GET /training/referrals/validate/:code` | **Fixed** · live 200 (`rewardAmountPaise` 200000) |
| Register, Verify email, Login, Forgot/Reset password | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` | **Fixed**. A real student registered on live at 13:53 after the fix. Email delivery: Blocked (see below) |
| Apply, Application status | `POST /training/student/applications`, `GET …/applications` | **Fixed** † (local copy) |
| Certificate verify | `GET /training/certificates/verify/:code` | **Fixed** |
| Contact | `POST /contact` | Connected |

## Student / intern portal — `intern/` (:3002)
Every page needs a session. Live, without one, the portal redirects to `/login` (307) and the API returns 401.
| Page | API (`/training/student/…`) | Status |
|---|---|---|
| Dashboard, Profile | `dashboard`, `GET/PUT profile` | **Fixed** † |
| Applications (+ detail, withdraw, info-request reply) | `applications`, `applications/:id`, `…/withdraw` | **Fixed** † |
| Enrollments, Attendance, Timetable | `enrollments[/:id]`, `enrollments/:id/attendance`, `timetable` | **Fixed** † |
| Materials (links + downloadable files), Assignments (+ submit with file) | `materials`, `GET /files/:id`, `assignments[/:id]`, `assignments/:id/submission`, `POST /files` | **Fixed** † |
| **Internship exams** — list, detail/instructions, take (timer, autosave, offline copy), result, history | `/exams/student/exams[/:id]`, `…/exams/:id/start`, `…/attempts[/:id]`, `PUT …/attempts/:id/answers`, `POST …/attempts/:id/submit`, `…/attempts/:id/result` | **Connected** † (new 2026-10-15; see EXAM_MODULE.md) |
| Results, Feedback, Announcements, Notifications | `results`, `assessments`, `feedback`, `announcements`, `notifications`, `notifications/read` | **Fixed** † |
| Payments, Invoices | `payments`, `invoices[/:id]` | **Fixed** † (list/view) |
| Pay online | `payments/order`, `payments/verify`, `payments/failure`, webhook `/payments/razorpay/webhook` | **Blocked**: Razorpay keys are not configured. The server refuses the request; it never fakes a success |
| Certificates | `certificates[/:id]` | **Fixed** † |
| Referrals | `referrals` | **Fixed** † |
| Support | `GET/POST support` | **Fixed** † |

## Trainer portal — `trainer/` (:3005)
| Page | API (`/training/trainer/…`) | Status |
|---|---|---|
| Dashboard | `dashboard` | **Fixed** † |
| Batch: students, report | `batches/:id`, `…/students`, `…/report` | **Fixed** † |
| Attendance | `GET/PUT …/attendance`, `…/attendance/history` | **Fixed** † |
| Assignments (+ grading) | `…/assignments`, `assignments/:id`, `submissions/:id/grade` | **Fixed** |
| Assessments (+ results/publish) | `…/assessments`, `assessments/:id/results`, `…/publish` | **Fixed** |
| Materials (link or uploaded file), Announcements | `…/materials`, `materials/:id`, `POST /files?purpose=LEARNING_MATERIAL`, `…/announcements` | **Connected** (file upload added 2026-10-15; API-tested) |
| Student progress, feedback | `enrollments/:id/progress`, `…/feedback` | **Fixed** |

## Employee portal — `employee/` (:3003)
| Page | API (`/employee/…`) | Status |
|---|---|---|
| Dashboard, Profile | `dashboard`, `GET/PUT profile` | **Fixed** † |
| Attendance | `attendance`, `attendance/check-in`, `attendance/check-out` | **Fixed** † |
| Leave | `GET/POST leave`, `leave/:id/cancel` | **Fixed** † |
| Projects, Tasks | `projects[/:id]`, `tasks`, `tasks/:id/status` | **Fixed** † |
| Work updates, HR requests, Announcements | `work-updates`, `hr-requests`, `announcements` | **Fixed** † |
| Documents | `GET /files/:id` (private, ownership-checked) | **Fixed**. Production storage: Blocked (`UPLOAD_DIR`) |

## Admin portal — `admin/` (:3004)
| Page | API | Status |
|---|---|---|
| Dashboard | `GET /platform/overview`, `/training/admin/dashboard` | **Fixed** † |
| Users (+ detail: role, status, permissions, notes, password reset) | `/platform/users…`, `/platform/roles`, `/platform/permissions` | **Fixed** † (grant/revoke dialog API-tested only) |
| Staff, Trainers | `/training/admin/staff`, `/training/admin/trainers`, `PATCH /training/admin/users/:id/status` | **Fixed** † |
| Courses (+ new, modules, image) | `/training/admin/courses…`, `POST /files?purpose=COURSE_IMAGE` | **Fixed** † |
| Batches (+ new, schedules, trainers, report) | `/training/admin/batches…` | **Fixed** † |
| Applications (+ review, request info, verify docs, confirm, transfer, offline payment) | `/training/admin/applications…` | **Fixed** † |
| Students (+ detail, enrollment status, attendance) | `/training/admin/students…`, `/training/admin/enrollments…` | **Fixed** † |
| Certificates | `…/certificate-eligibility`, `…/certificate`, `/training/admin/certificates`, `…/revoke` | **Fixed** |
| Payments (+ detail, reconcile, refund record) | `/training/admin/payments…` | **Fixed** (records). Online gateway: Blocked |
| Referrals (settings, rewards, payout, fraud, codes, audit) | `/training/admin/referrals/…` | **Fixed** (payout dialog API-tested only) |
| Announcements, Support | `/training/admin/announcements`, `/training/admin/support` | **Fixed** |
| Reports | `/platform/reports/:type` (server date filters, CSV), `/platform/reports/summary` | **Fixed** † |
| Audit log | `/training/admin/audit` | **Fixed** |
| Employees, Leave, Projects, Work updates, HR requests, Company announcements | `/hr/…` | **Fixed** † |
| Roles | `/platform/roles`, `/platform/permissions` | **Fixed** |
| **Internship exams** — list, new, detail (Settings / Questions / Candidates / Attempts·Results / Report), question bank, evaluate attempt, student performance | `/exams/admin/*` (questions, topics, exams, publish, archive, release-results, targets, assignments, attempts, evaluate, retakes, interview-results, report, export, students/:id/performance) | **Connected** † (new 2026-10-15) |

## Blocked: needs configuration (no secret values here)
| Feature | Needs |
|---|---|
| Online payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (backend only) |
| Verification / reset / notification email | `RESEND_API_KEY` plus a verified sending domain for `RESEND_FROM_EMAIL` |
| Uploads in production | `UPLOAD_DIR` on persistent storage, `PUBLIC_API_URL` |
| Production portals | `NEXT_PUBLIC_API_URL` per app; backend `FRONTEND_URL` (comma-separated portal origins for CORS); `COOKIE_DOMAIN` when portals share a parent domain |

## Missing (not implemented, not faked)
- A CMS "Pages" model. There is no generic page builder; marketing pages are code plus the content tables.
