# Globalantic — API Documentation

There is a single Express REST API (`backend/`). The base URL is `NEXT_PUBLIC_API_URL`; in dev it is `http://localhost:4000/api`. Every portal calls it only through `@globalantic/api-client` (`packages/api-client/src/index.ts`).

```jsonc
{ "success": true,  "message": "…", "data": <T> }                                     // success
{ "success": false, "message": "…", "errors": [{ "field": "email", "message": "…" }] }  // error
```

**Auth:** the httpOnly cookie `globalantic_token` (or `Authorization: Bearer`), backed by a server-side `Session`. Browsers send `credentials: 'include'`.

**Status codes:** 400 validation or malformed JSON · 413 body too large · 403 CORS-rejected origin · 401 no or invalid session · 403 missing permission · 404 not found **or not yours** · 409 state conflict (closed batch, duplicate, wrong status) · 429 rate limited · 502/503 payment provider unreachable or not configured.

**Pagination:** list endpoints accept `?page=1&pageSize=20` (max 100) and return `{ items, total, page, pageSize, totalPages }`.

**Money:** always integer **paise**, never accepted from clients for payments.

## Service endpoints (outside /api)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | API descriptor `{service, health, liveness, apiBase}` |
| GET | `/health` | Readiness: `{status: ok|degraded, database: up|down, latencyMs, uptime}`, **503 when the DB is unreachable** |
| GET | `/health/live` | Liveness (process only) |

## Auth — `/api/auth`
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/login` | public | `{email,password}` → sets the httpOnly cookie, creates a session, and returns `{ user: {id,name,email,role,emailVerified} }` (no token in the body). Per-IP and per-account rate limits. Generic errors. 403 when suspended. |
| POST | `/logout` | public | Revokes the session and clears the cookie |
| GET | `/me` | session | `{ user: { id,email,name,role,emailVerified,status,permissions[],isStaff } }` |
| POST | `/register` | public | Student signup `{fullName,email,phone,password,city?,dateOfBirth?,referralCode?,consent:true}` → **202, same message whatever the outcome** |
| POST | `/verify-email` | public | `{token}` (single use) |
| POST | `/resend-verification` | session | |
| POST | `/forgot-password` | public | `{email}`. Same response either way. |
| POST | `/reset-password` | public | `{token,password}`. Revokes all sessions. Also used for staff invites. |
| POST | `/change-password` | session | `{currentPassword,newPassword}`. Revokes the other sessions. |

Password rule: 8–128 characters with at least one letter and one digit.

## Public training catalogue — `/api/training`
| Method | Path | Notes |
|---|---|---|
| GET | `/courses?search&category&mode&level&programType&page&pageSize` | Published only. Returns `{…paged, categories[]}`. Each course includes `fee {feePaise,discountPaise,payablePaise}` and `openBatchCount`. |
| GET | `/courses/:slug` | Course, `modules[]`, and `batches[]` with `availableSeats`, effective `status` (OPEN with 0 seats is shown as FULL), `admissionOpen`, `admissionBlockedReason`, `fee`, `schedules`, trainer names |
| GET | `/batches?courseId&mode&status&page` | Upcoming and running batches of published courses |
| GET | `/batches/:id` | |
| POST | `/referrals/click` | `{code}` → `{valid}`. Rate-limited, deduplicated per IP hash per 24 h. |
| GET | `/referrals/validate/:code` | `{valid}`. Reveals nothing about the referrer. |
| GET | `/referrals/program` | `{enabled,rewardAmountPaise,currency,refundWindowDays,requireActiveEnrollment}` |
| GET | `/certificates/verify/:code` | `{valid,status,certificateNumber,studentName,course,batch,period,issuedAt}` |

The existing `POST /api/contact` is reused for training enquiries.

## Student portal — `/api/training/student` (role STUDENT; always scoped to the caller)
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | |
| GET/PUT | `/profile` | Editable: name, city, dateOfBirth, qualification, institution, graduationYear |
| GET/POST | `/applications` | POST `{batchId,qualification,institution?,graduationYear?,statement?,referralCode?}`. Needs a verified email. 404 unknown batch. 409 closed, full, past deadline or duplicate. Fee snapshot taken from the DB. |
| GET | `/applications/:id` | |
| POST | `/applications/:id/withdraw` | Only before payment |
| GET | `/enrollments`, `/enrollments/:id`, `/enrollments/:id/attendance` | Enrollment detail includes `progress` |
| GET | `/timetable`, `/materials`, `/assignments`, `/assignments/:id`, `/assessments`, `/results`, `/feedback`, `/announcements` | Results: published only |
| POST | `/assignments/:id/submission` | `{content?, linkUrl? (https)}`. LATE after the due date. Locked once graded. |
| GET | `/notifications?unread&page` · POST `/notifications/read` `{ids: uuid[] \| "all"}` | |
| POST | `/payments/order` | `{applicationId}` → `{paymentId,keyId,orderId,amountPaise,currency,name,description,prefill}`. Application must be APPROVED. Reuses an open order. |
| POST | `/payments/verify` | `{orderId,paymentId,signature}`. Checks the HMAC and re-fetches from the provider. → `{status: PAID\|PENDING\|FAILED}` |
| POST | `/payments/failure` | `{orderId,reason}`. Informational; can never mark anything paid. |
| GET | `/payments`, `/invoices`, `/invoices/:id` | Invoice = receipt |
| GET | `/certificates`, `/certificates/:id` | Status plus eligibility reasons |
| GET/POST | `/support` | `{subject,message}` |
| GET | `/referrals` | Code (created when eligible), link `https://training.globalantic.com/register?ref=CODE`, stats, masked referrals |

## Trainer portal — `/api/training/trainer` (role TRAINER; assigned batches only)
| Method | Path |
|---|---|
| GET | `/dashboard` |
| GET | `/batches/:batchId`, `/batches/:batchId/students`, `/batches/:batchId/report` |
| GET/PUT | `/batches/:batchId/attendance?date=YYYY-MM-DD` · PUT `{date,records:[{enrollmentId,status,remarks?}]}`. Edits are audited (before/after); no future dates. |
| GET | `/batches/:batchId/attendance/history` |
| GET/POST | `/batches/:batchId/assignments` |
| GET/PUT | `/assignments/:id` (with submissions) |
| POST | `/submissions/:id/grade` `{marks,feedback?,returnForResubmission?}` (marks ≤ max) |
| GET/POST | `/batches/:batchId/materials` (https URL) · DELETE `/materials/:id` |
| GET/POST | `/batches/:batchId/announcements` |
| GET/POST | `/batches/:batchId/assessments` · GET/PUT `/assessments/:id/results` · POST `/assessments/:id/publish` |
| GET | `/enrollments/:id/progress` · POST `/enrollments/:id/feedback` `{content,rating?}` |

## Admin training — `/api/training/admin` (staff; permission per route, see ROLE_PERMISSION_MATRIX.md)
| Area | Endpoints |
|---|---|
| Meta | `GET /dashboard`, `GET /me/permissions` |
| Courses | `GET/POST /courses`, `GET/PUT /courses/:id`, `PATCH /courses/:id/status {status}` (publishing needs at least one module), `PUT /courses/:id/modules {modules[]}` |
| Batches | `GET/POST /batches`, `GET/PUT /batches/:id` (capacity cannot go below seats taken), `PATCH /batches/:id/status {status,reason?}` (state machine; cancel needs a reason and notifies students), `PUT /batches/:id/schedules`, `POST /batches/:id/trainers {trainerId,role}`, `DELETE /batches/:id/trainers/:trainerId`, `GET /batches/:id/report` |
| Staff | `GET /trainers`, `GET/POST /staff {name,email,phone?,role:TRAINER\|FINANCE\|EDITOR}` (invite email), `PATCH /users/:id/status {status,reason}` |
| Admissions | `GET /applications?status&courseId&batchId&search&pendingPayment`, `GET /applications/:id` (with audit history), `POST /applications/:id/review {action:UNDER_REVIEW\|APPROVE\|REJECT, reason?}` (approval reserves a seat; zero-fee enrolls immediately), `POST …/verify-documents`, `POST …/confirm-enrollment`, `POST …/transfer {batchId,reason}`, `POST …/offline-payment {method,reference,reason}` (ADMIN only) |
| Students | `GET /students?search&status`, `GET/PUT /students/:id` (reason required), `PATCH /enrollments/:id/status {status,reason}`, `GET /enrollments/:id/attendance`, `GET /enrollments/:id/certificate-eligibility`, `POST /enrollments/:id/certificate` |
| Certificates | `GET /certificates`, `POST /certificates/:id/revoke {reason}` |
| Payments | `GET /payments?status&search` (with totals), `GET /payments/:id` (with history), `POST /payments/:id/reconcile` (asks Razorpay), `POST /payments/:id/refund-record {reason}` |
| Comms | `POST /announcements {title,body,batchId?}`, `GET /support`, `PUT /support/:id {status,response?}` |
| Referrals | `GET /referrals/overview`, `GET/PUT /referrals/settings` (PUT requires `reason`), `GET /referrals/registrations`, `GET /referrals/rewards?status`, `POST /referrals/rewards/:id/review {decision,reason?}`, `POST /referrals/rewards/:id/payout {method,reference,notes?}`, `GET /referrals/fraud-reviews`, `POST /referrals/fraud-reviews/:id/resolve {outcome,notes}`, `PATCH /referrals/codes/:id/status`, `GET /referrals/audit` |
| Audit | `GET /audit?entityType&entityId&actorId` |

## Payment webhook
`POST /api/payments/razorpay/webhook`. This route receives the raw body; the headers `X-Razorpay-Signature` and `X-Razorpay-Event-Id` are required. Handled events: `payment.captured`, `order.paid`, `payment.authorized`, `payment.failed`, `refund.processed`, `payment.refunded`. The response is 200 `{duplicate, outcome}`, or 400 for an invalid signature. Configure it in the Razorpay dashboard with the secret `RAZORPAY_WEBHOOK_SECRET`.

## Existing corporate endpoints (unchanged)
- Public content: `/api/services`, `/solutions`, `/industries`, `/portfolio`, `/blog` (each with `/:slug`), plus `/technologies`, `/faqs`, `/blog-categories`, `/settings`.
- Lead capture: `/api/contact`, `/api/training/apply` (legacy lead form), `/api/careers/apply`, `/api/newsletter`.
- CMS admin under `/api/admin/*`: ADMIN only. It now uses the session-checked `requireAuth`.

## Private files — `/api/files` (session required)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/files?purpose=ASSIGNMENT_SUBMISSION\|ADMISSION_DOCUMENT\|EMPLOYEE_DOCUMENT` | Raw body (`Content-Type: application/octet-stream`) and header `X-File-Name` (URI-encoded). ≤ 5 MB → else 413. **Type detected from magic bytes**: PDF, PNG, JPEG or WEBP only (400 otherwise). Students may upload the first two purposes; `employees.manage` the third. → `{id,name,mimeType,sizeBytes}` |
| GET | `/api/files/:id` | Download (`attachment`, `nosniff`, sandbox CSP, `no-store`). Allowed for the uploader; for an assignment file, the student who submitted it, a trainer assigned to that batch, or `training.learning.read`; for an admission document, `training.admissions.read`; for an employee document, the employee (if visible) or `employees.read`. Everyone else gets **404**. |

Attach an upload with `fileId` (assignment submission) or `documentFileId` (admission application), or via `POST /api/hr/employees/:id/documents`. A file can be attached once, and only by its uploader.

## Employee portal — `/api/employee` (role EMPLOYEE; always scoped to the caller)
`GET /dashboard` · `GET/PUT /profile` (emergency contact only) · `GET /attendance?month=YYYY-MM` · `POST /attendance/check-in {status: PRESENT|WORK_FROM_HOME, notes?}` · `POST /attendance/check-out` · `GET/POST /leave {type,startDate,endDate,reason}` (days computed by the server; overlap → 409) · `POST /leave/:id/cancel` · `GET /projects`, `GET /projects/:id` (members only; teammates' names and roles) · `GET /tasks?status` · `PATCH /tasks/:id/status {status}` (own tasks; status only) · `GET/POST /work-updates {date (today or the previous 7 days), summary, minutes?, projectId?, taskId?}` · `GET /documents` · `GET/POST /hr-requests {category,subject,message}` · `GET /announcements`

## HR — `/api/hr` (permission per route)
| Permission | Endpoints |
|---|---|
| `employees.read` | `GET /employees?search&department&page`, `GET /employees/:id` |
| `employees.manage` | `POST /employees` (creates account + profile; invite email), `PUT /employees/:id {…, reason}`, `PUT /employees/:id/attendance {date,status,notes?,reason}` (audited before/after), `POST /employees/:id/documents {title,category,fileId,visibleToEmployee}`, `PATCH /documents/:id {visibleToEmployee?, remove?, reason}` |
| `leave.approve` | `GET /leave?status`, `POST /leave/:id/review {decision: APPROVE\|REJECT, note}` (no self-review; reject needs a note) |
| `projects.manage` | `GET/POST /projects`, `GET/PUT /projects/:id`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:userId`, `GET/POST /tasks`, `PUT /tasks/:id` (assignee must be a project member), `GET /work-updates` |
| `hr.requests.manage` | `GET /requests?status`, `PUT /requests/:id {status,response?}` (no self-response) |
| `company.announcements.manage` | `GET/POST /announcements` (notifies all active employees) |

## Platform — `/api/platform`
| Permission | Endpoints |
|---|---|
| `users.manage` | `GET /users?search&role&status`, `PATCH /users/:id/role {role,reason}` (assignable: EDITOR, FINANCE, TRAINER, HR, EMPLOYEE; never ADMIN, never self, never an ADMIN account, never a student; revokes sessions), `GET /roles` |
| `reports.read` | `GET /reports/summary` (aggregates only: admissions, enrollments by course, revenue by month, attendance by batch, referral rewards, leads, employees by department, leave) |

## Final integration pass (2026-10-15)

### Status code contract (changed)
| Code | Meaning |
|---|---|
| 400 | Malformed request: bad JSON, invalid/expired one-time link, bad payment or webhook signature, provider data mismatch, unbuildable query |
| 401 | Not authenticated or session revoked/expired |
| 403 | Authenticated but not allowed (permission, portal, self-action guard) |
| 404 | Not found **or not yours** (ownership is never revealed) |
| 409 | Conflict: duplicate, wrong state, capacity, already granted |
| 413 / 415 | Body or file too large / wrong body type |
| **422** | **Validation failed**, with `errors: [{field, message}]` (was 400) |
| 429 | Rate limited |
| 500 | Unexpected failure (generic message; details only in server logs) |
| 503 | Database or external service unavailable / not configured |

### New / updated endpoints
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/platform/overview` | any staff | Dashboard counts; each section appears only when the caller has the matching permission (users, training, payments, referrals, leads, people, openSupport, recentActivity) |
| GET | `/api/platform/permissions` | users.manage | Catalogue: permission, roles that have it, `grantable`, reason if not |
| GET / PUT | `/api/platform/users/:id` | users.manage | Detail (effective vs role permissions, grants, recent activity). PUT `{name?, phone?, reason}`; phone conflict → 409; other ADMIN accounts → 403 |
| POST | `/api/platform/users/:id/password-reset` | users.manage | `{revokeSessions, reason}` → emails a single-use reset link (the admin never sets passwords); other ADMINs → 403 |
| POST / DELETE | `/api/platform/users/:id/permissions[/:permission?reason=]` | users.manage | Individual grants, EDITOR/FINANCE/HR only; never `users.manage`, `referrals.settings`, `payments.record_offline`, `audit.read` or portal permissions; never self |
| GET / POST / DELETE | `/api/platform/users/:id/notes[/:noteId]` | users.manage \| training.students.manage \| employees.manage | Internal notes, never shown to the subject |
| GET | `/api/platform/reports/:type?from&to&export=true` | reports.read (+ training.students.read / employees.read / referrals.read for those types) | Types: admissions, payments, attendance, courses, batches, referrals, students, employees. Server-side date range (inclusive), max 2000 rows (`truncated`). `export=true` writes a `report.exported` audit event |
| POST | `/api/training/admin/applications/:id/review` | training.admissions.manage | New action `REQUEST_INFO` with `reason` = message to the applicant (application → UNDER_REVIEW, notification + email) |
| POST | `/api/training/student/applications/:id/respond` | student (owner) | `{message, documentFileId?}`; only while a request is open (else 409) |
| GET | `/api/training/admin/referrals/codes?search` | referrals.read | Codes with owner, clicks and registrations |
| GET | `/api/training/admin/trainers` | training.batches.manage | Now includes `workload {activeBatches, activeStudents}` |
| PATCH | `/api/hr/employees/:id/status` | employees.manage | `{status, reason}`; EMPLOYEE/HR accounts with a profile only; revokes sessions |
| POST | `/api/files?purpose=COURSE_IMAGE\|CMS_IMAGE` | training.courses.manage / cms.manage | PNG/JPEG/WEBP only; response includes a public `url` |
| GET | `/api/files/public/:id` | public | Public images only (other purposes → 404); `Cross-Origin-Resource-Policy: cross-origin`, cached |
| GET / POST / PUT / DELETE | `/api/admin/faqs[/:id]` | ADMIN (legacy CMS) | FAQ management; the public list stays at `GET /api/faqs` |

**Sorting:** these list endpoints accept a whitelisted `sort=field:asc|desc`; any other value → 422.
- `/training/admin/courses` (title, createdAt, feePaise, status)
- `/batches` (startDate, name, capacity, status)
- `/applications` (createdAt, status, applicationNumber, payablePaise)
- `/students` (createdAt, name, email, lastLoginAt)
- `/payments` (createdAt, amountPaise, status, verifiedAt)
- `/platform/users` (name, email, role, createdAt, lastLoginAt)
- `/hr/employees` (employeeCode, name, department, joiningDate)
