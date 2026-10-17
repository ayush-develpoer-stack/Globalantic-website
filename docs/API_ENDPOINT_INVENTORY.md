# API Endpoint Inventory

Generated on 2026-10-17 by `backend/scripts/api-inventory.ts`, which walks the router stack of the live Express app (`createApp()`). Every row is a registered route; nothing comes from older docs. To regenerate:

```bash
cd backend
npx tsx scripts/api-inventory.ts out.json "" ../docs/API_ENDPOINT_INVENTORY.body.md     # inventory only
API_COVERAGE_FILE=C:\path\cov.log npm test                                              # record which routes the tests hit
npx tsx scripts/api-inventory.ts out.json C:\path\cov.log report.md                     # inventory + coverage column
```

**Totals: 398 endpoints.** 191 GET, 116 POST, 40 PUT, 32 PATCH, 19 DELETE. By access: 40 public, 2 shared-secret (Razorpay webhook HMAC, CRM cron `x-cron-secret`), 356 require a session.

Column notes:
- **Auth.** `public` means no session is needed. `session` means `requireAuth`: a JWT cookie plus a live `sessions` row; suspended or deleted users are rejected. `secret` means checked inside the handler.
- **Access rule.** Read from the real guards: `requirePermission` (all listed), `requireAnyPermission` (`any of`), or `requireAdmin`. Permissions map to roles in `backend/src/lib/permissions.ts`. "any signed-in user" means there is no route-level permission and the handler or service scopes the data. The 7 such routes were reviewed: `/auth/me`, `resend-verification`, `change-password` and `/training/admin/me/permissions` act on the caller only; `/platform/overview` includes each section only if the caller has that section's permission; `/files` checks ownership in the service.
- **Validated input.** The Zod schema applied by `validate()`. `?` marks an optional field. Handlers without `validate()` read no body, or validate in the service.
- **Source.** Route file and line. CMS content routes come from a shared CRUD factory (`admin.routes.ts`), so they have no per-route line.
- **HEAD/OPTIONS.** Express answers HEAD for every GET. OPTIONS (CORS preflight) is handled globally by `cors()` and is not listed per route.
- **Tested.** Per-route test status is in `API_ENDPOINT_TEST_REPORT.md`. This table was generated without a coverage log, so the column reads `n/a`.

### `/api/payments` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/payments/razorpay/webhook` | secret | Razorpay HMAC signature (RAZORPAY_WEBHOOK_SECRET) | — | app.ts | n/a |

### `/` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/` | public | — | — | app.ts | n/a |

### `/health` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/health/live` | public | — | — | app.ts | n/a |
| GET | `/health` | public | — | — | app.ts | n/a |

### `/api/auth` (9)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | — | body{email, password} | auth.routes.ts:21 | n/a |
| POST | `/api/auth/logout` | public | — | — | auth.routes.ts:21 | n/a |
| GET | `/api/auth/me` | session | any signed-in user (checks in handler/service) | — | auth.routes.ts:23 | n/a |
| POST | `/api/auth/register` | public | — | body{fullName, email, phone, password, city?, dateOfBirth?, referralCode?, consent} | auth.routes.ts:26 | n/a |
| POST | `/api/auth/verify-email` | public | — | body{token} | auth.routes.ts:26 | n/a |
| POST | `/api/auth/resend-verification` | session | any signed-in user (checks in handler/service) | — | auth.routes.ts:27 | n/a |
| POST | `/api/auth/forgot-password` | public | — | body{email} | auth.routes.ts:28 | n/a |
| POST | `/api/auth/reset-password` | public | — | body{token, password} | auth.routes.ts:29 | n/a |
| POST | `/api/auth/change-password` | session | any signed-in user (checks in handler/service) | body{currentPassword, newPassword} | auth.routes.ts:30 | n/a |

### `/api/training` (126)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/training/student/dashboard` | session | student.portal | — | student.routes.ts:40 | n/a |
| GET | `/api/training/student/profile` | session | student.portal | — | student.routes.ts:42 | n/a |
| PUT | `/api/training/student/profile` | session | student.portal | body{name?, city?, dateOfBirth?, qualification?, institution?, graduationYear?} | student.routes.ts:43 | n/a |
| GET | `/api/training/student/applications` | session | student.portal | — | student.routes.ts:53 | n/a |
| POST | `/api/training/student/applications` | session | student.portal | body{batchId, qualification, institution?, graduationYear?, statement?, referralCode?, documentFileId?} | student.routes.ts:54 | n/a |
| GET | `/api/training/student/applications/:id` | session | student.portal | params{id} | student.routes.ts:63 | n/a |
| POST | `/api/training/student/applications/:id/withdraw` | session | student.portal | params{id} | student.routes.ts:64 | n/a |
| POST | `/api/training/student/applications/:id/respond` | session | student.portal | params{id}<br>body{message, documentFileId?} | student.routes.ts:69 | n/a |
| GET | `/api/training/student/enrollments` | session | student.portal | — | student.routes.ts:78 | n/a |
| GET | `/api/training/student/enrollments/:id` | session | student.portal | params{id} | student.routes.ts:78 | n/a |
| GET | `/api/training/student/enrollments/:id/attendance` | session | student.portal | params{id} | student.routes.ts:79 | n/a |
| GET | `/api/training/student/timetable` | session | student.portal | — | student.routes.ts:80 | n/a |
| GET | `/api/training/student/materials` | session | student.portal | — | student.routes.ts:81 | n/a |
| GET | `/api/training/student/assignments` | session | student.portal | — | student.routes.ts:82 | n/a |
| GET | `/api/training/student/assignments/:id` | session | student.portal | params{id} | student.routes.ts:83 | n/a |
| POST | `/api/training/student/assignments/:id/submission` | session | student.portal | params{id}<br>body{content?, linkUrl?, fileId?} | student.routes.ts:85 | n/a |
| GET | `/api/training/student/assessments` | session | student.portal | — | student.routes.ts:92 | n/a |
| GET | `/api/training/student/results` | session | student.portal | — | student.routes.ts:92 | n/a |
| GET | `/api/training/student/feedback` | session | student.portal | — | student.routes.ts:93 | n/a |
| GET | `/api/training/student/announcements` | session | student.portal | — | student.routes.ts:94 | n/a |
| GET | `/api/training/student/notifications` | session | student.portal | query{unread?, page?, pageSize?} | student.routes.ts:98 | n/a |
| POST | `/api/training/student/notifications/read` | session | student.portal | body{ids} | student.routes.ts:106 | n/a |
| POST | `/api/training/student/payments/order` | session | student.portal | body{applicationId} | student.routes.ts:113 | n/a |
| POST | `/api/training/student/payments/verify` | session | student.portal | body{orderId, paymentId, signature} | student.routes.ts:113 | n/a |
| POST | `/api/training/student/payments/failure` | session | student.portal | body{orderId, reason} | student.routes.ts:114 | n/a |
| GET | `/api/training/student/payments` | session | student.portal | — | student.routes.ts:116 | n/a |
| GET | `/api/training/student/invoices` | session | student.portal | — | student.routes.ts:116 | n/a |
| GET | `/api/training/student/invoices/:id` | session | student.portal | params{id} | student.routes.ts:117 | n/a |
| GET | `/api/training/student/invoices/:id/pdf` | session | student.portal | params{id} | student.routes.ts:120 | n/a |
| GET | `/api/training/student/certificates` | session | student.portal | — | student.routes.ts:126 | n/a |
| GET | `/api/training/student/certificates/:id` | session | student.portal | params{id} | student.routes.ts:126 | n/a |
| GET | `/api/training/student/support` | session | student.portal | — | student.routes.ts:130 | n/a |
| POST | `/api/training/student/support` | session | student.portal | body{subject, message} | student.routes.ts:131 | n/a |
| GET | `/api/training/student/referrals` | session | student.portal | — | student.routes.ts:134 | n/a |
| GET | `/api/training/trainer/dashboard` | session | trainer.portal | — | trainer.routes.ts:35 | n/a |
| GET | `/api/training/trainer/batches/:batchId` | session | trainer.portal | params{batchId} | trainer.routes.ts:37 | n/a |
| GET | `/api/training/trainer/batches/:batchId/students` | session | trainer.portal | params{batchId} | trainer.routes.ts:37 | n/a |
| GET | `/api/training/trainer/batches/:batchId/report` | session | trainer.portal | params{batchId} | trainer.routes.ts:38 | n/a |
| GET | `/api/training/trainer/batches/:batchId/attendance` | session | trainer.portal | params{batchId}<br>query{date} | trainer.routes.ts:42 | n/a |
| GET | `/api/training/trainer/batches/:batchId/attendance/history` | session | trainer.portal | params{batchId} | trainer.routes.ts:48 | n/a |
| PUT | `/api/training/trainer/batches/:batchId/attendance` | session | trainer.portal | params{batchId}<br>body{date, records} | trainer.routes.ts:49 | n/a |
| GET | `/api/training/trainer/batches/:batchId/assignments` | session | trainer.portal | params{batchId} | trainer.routes.ts:58 | n/a |
| POST | `/api/training/trainer/batches/:batchId/assignments` | session | trainer.portal | params{batchId}<br>body{title, description, resourceUrl?, dueAt, maxMarks, status?} | trainer.routes.ts:59 | n/a |
| GET | `/api/training/trainer/assignments/:id` | session | trainer.portal | params{id} | trainer.routes.ts:65 | n/a |
| PUT | `/api/training/trainer/assignments/:id` | session | trainer.portal | params{id}<br>body{title?, description?, resourceUrl?, dueAt?, maxMarks?, status?} | trainer.routes.ts:66 | n/a |
| POST | `/api/training/trainer/submissions/:id/grade` | session | trainer.portal | params{id}<br>body{marks, feedback?, returnForResubmission?} | trainer.routes.ts:67 | n/a |
| GET | `/api/training/trainer/batches/:batchId/materials` | session | trainer.portal | params{batchId} | trainer.routes.ts:70 | n/a |
| POST | `/api/training/trainer/batches/:batchId/materials` | session | trainer.portal | params{batchId}<br>body{title, description?, type?, url?, fileId?} | trainer.routes.ts:71 | n/a |
| DELETE | `/api/training/trainer/materials/:id` | session | trainer.portal | params{id} | trainer.routes.ts:72 | n/a |
| GET | `/api/training/trainer/batches/:batchId/announcements` | session | trainer.portal | params{batchId} | trainer.routes.ts:75 | n/a |
| POST | `/api/training/trainer/batches/:batchId/announcements` | session | trainer.portal | params{batchId}<br>body{title, body} | trainer.routes.ts:76 | n/a |
| GET | `/api/training/trainer/batches/:batchId/assessments` | session | trainer.portal | params{batchId} | trainer.routes.ts:84 | n/a |
| POST | `/api/training/trainer/batches/:batchId/assessments` | session | trainer.portal | params{batchId}<br>body{title, type?, maxMarks, passMarks, heldOn?} | trainer.routes.ts:85 | n/a |
| GET | `/api/training/trainer/assessments/:id/results` | session | trainer.portal | params{id} | trainer.routes.ts:86 | n/a |
| PUT | `/api/training/trainer/assessments/:id/results` | session | trainer.portal | params{id}<br>body{rows} | trainer.routes.ts:87 | n/a |
| POST | `/api/training/trainer/assessments/:id/publish` | session | trainer.portal | params{id} | trainer.routes.ts:88 | n/a |
| GET | `/api/training/trainer/enrollments/:id/progress` | session | trainer.portal | params{id} | trainer.routes.ts:91 | n/a |
| POST | `/api/training/trainer/enrollments/:id/feedback` | session | trainer.portal | params{id}<br>body{content, rating?} | trainer.routes.ts:92 | n/a |
| GET | `/api/training/admin/dashboard` | session | training.admissions.read | — | admin.training.routes.ts:37 | n/a |
| GET | `/api/training/admin/me/permissions` | session | any signed-in user (checks in handler/service) | — | admin.training.routes.ts:37 | n/a |
| GET | `/api/training/admin/courses` | session | training.courses.manage | query{sort?, search?, status?, page?, pageSize?} | admin.training.routes.ts:43 | n/a |
| POST | `/api/training/admin/courses` | session | training.courses.manage | body{slug, title, shortDescription, description, category, programType?, durationLabel, durationWeeks?, mode, level?, skills?, eligibility, feePaise, discountPaise?, discountLabel?, thumbnailUrl?, bannerUrl?, seoTitle?, seoDescription?, minAttendancePercent?, order?} | admin.training.routes.ts:48 | n/a |
| GET | `/api/training/admin/courses/:id` | session | training.courses.manage | params{id} | admin.training.routes.ts:49 | n/a |
| PUT | `/api/training/admin/courses/:id` | session | training.courses.manage | params{id}<br>body{slug?, title?, shortDescription?, description?, category?, programType?, durationLabel?, durationWeeks?, mode?, level?, skills?, eligibility?, feePaise?, discountPaise?, discountLabel?, thumbnailUrl?, bannerUrl?, seoTitle?, seoDescription?, minAttendancePercent?, order?} | admin.training.routes.ts:50 | n/a |
| PATCH | `/api/training/admin/courses/:id/status` | session | training.courses.manage | params{id}<br>body{status} | admin.training.routes.ts:51 | n/a |
| PUT | `/api/training/admin/courses/:id/modules` | session | training.courses.manage | params{id}<br>body{modules} | admin.training.routes.ts:52 | n/a |
| GET | `/api/training/admin/batches` | session | training.batches.manage | query{sort?, courseId?, status?, search?, page?, pageSize?} | admin.training.routes.ts:55 | n/a |
| POST | `/api/training/admin/batches` | session | training.batches.manage | body{courseId, name, startDate, endDate, registrationDeadline, mode, venue?, capacity, feePaise?} | admin.training.routes.ts:60 | n/a |
| GET | `/api/training/admin/batches/:id` | session | training.batches.manage | params{id} | admin.training.routes.ts:61 | n/a |
| PUT | `/api/training/admin/batches/:id` | session | training.batches.manage | params{id}<br>body{name?, startDate?, endDate?, registrationDeadline?, mode?, venue?, capacity?, feePaise?} | admin.training.routes.ts:62 | n/a |
| PATCH | `/api/training/admin/batches/:id/status` | session | training.batches.manage | params{id}<br>body{status, reason?} | admin.training.routes.ts:63 | n/a |
| PUT | `/api/training/admin/batches/:id/schedules` | session | training.batches.manage | params{id}<br>body{schedules} | admin.training.routes.ts:64 | n/a |
| POST | `/api/training/admin/batches/:id/trainers` | session | training.batches.manage | params{id}<br>body{trainerId, role?} | admin.training.routes.ts:65 | n/a |
| DELETE | `/api/training/admin/batches/:id/trainers/:trainerId` | session | training.batches.manage | params{id, trainerId} | admin.training.routes.ts:66 | n/a |
| GET | `/api/training/admin/batches/:id/report` | session | training.learning.read | params{id} | admin.training.routes.ts:67 | n/a |
| GET | `/api/training/admin/trainers` | session | training.batches.manage | — | admin.training.routes.ts:70 | n/a |
| GET | `/api/training/admin/staff` | session | training.trainers.manage | — | admin.training.routes.ts:70 | n/a |
| POST | `/api/training/admin/staff` | session | training.trainers.manage | body{name, email, phone?, role} | admin.training.routes.ts:72 | n/a |
| PATCH | `/api/training/admin/users/:id/status` | session | training.students.manage | params{id}<br>body{status, reason} | admin.training.routes.ts:73 | n/a |
| GET | `/api/training/admin/applications` | session | training.admissions.read | query{sort?, status?, courseId?, batchId?, search?, pendingPayment?, page?, pageSize?} | admin.training.routes.ts:76 | n/a |
| GET | `/api/training/admin/applications/:id` | session | training.admissions.read | params{id} | admin.training.routes.ts:81 | n/a |
| POST | `/api/training/admin/applications/:id/review` | session | training.admissions.manage | params{id}<br>body{action, reason?} | admin.training.routes.ts:82 | n/a |
| POST | `/api/training/admin/applications/:id/verify-documents` | session | training.admissions.manage | params{id} | admin.training.routes.ts:91 | n/a |
| POST | `/api/training/admin/applications/:id/confirm-enrollment` | session | training.admissions.manage | params{id} | admin.training.routes.ts:91 | n/a |
| POST | `/api/training/admin/applications/:id/transfer` | session | training.admissions.manage | params{id}<br>body{batchId, reason} | admin.training.routes.ts:92 | n/a |
| POST | `/api/training/admin/applications/:id/offline-payment` | session | payments.record_offline | params{id}<br>body{method, reference, reason} | admin.training.routes.ts:93 | n/a |
| GET | `/api/training/admin/students` | session | training.students.read | query{sort?, search?, status?, page?, pageSize?} | admin.training.routes.ts:97 | n/a |
| GET | `/api/training/admin/students/:id` | session | training.students.read | params{id} | admin.training.routes.ts:102 | n/a |
| PUT | `/api/training/admin/students/:id` | session | training.students.manage | params{id}<br>body{name?, city?, qualification?, institution?, graduationYear?, dateOfBirth?, reason} | admin.training.routes.ts:103 | n/a |
| PATCH | `/api/training/admin/enrollments/:id/status` | session | training.students.manage | params{id}<br>body{status, reason} | admin.training.routes.ts:107 | n/a |
| GET | `/api/training/admin/enrollments/:id/attendance` | session | training.learning.read | params{id} | admin.training.routes.ts:108 | n/a |
| GET | `/api/training/admin/enrollments/:id/certificate-eligibility` | session | training.certificates.issue | params{id} | admin.training.routes.ts:108 | n/a |
| POST | `/api/training/admin/enrollments/:id/certificate` | session | training.certificates.issue | params{id} | admin.training.routes.ts:110 | n/a |
| GET | `/api/training/admin/certificates` | session | training.certificates.issue | query{page?, pageSize?} | admin.training.routes.ts:113 | n/a |
| POST | `/api/training/admin/certificates/:id/revoke` | session | training.certificates.issue | params{id}<br>body{reason} | admin.training.routes.ts:118 | n/a |
| GET | `/api/training/admin/payments` | session | payments.read | query{sort?, status?, search?, page?, pageSize?} | admin.training.routes.ts:121 | n/a |
| GET | `/api/training/admin/payments/:id` | session | payments.read | params{id} | admin.training.routes.ts:126 | n/a |
| POST | `/api/training/admin/payments/:id/reconcile` | session | payments.reconcile | params{id} | admin.training.routes.ts:127 | n/a |
| GET | `/api/training/admin/payments/:id/receipt.pdf` | session | payments.read | params{id} | admin.training.routes.ts:128 | n/a |
| POST | `/api/training/admin/payments/:id/receipt/resend` | session | payments.reconcile | params{id} | admin.training.routes.ts:133 | n/a |
| POST | `/api/training/admin/payments/:id/refund-record` | session | payments.reconcile | params{id}<br>body{reason} | admin.training.routes.ts:133 | n/a |
| POST | `/api/training/admin/announcements` | session | training.announcements.manage | body{title, body, batchId?} | admin.training.routes.ts:137 | n/a |
| GET | `/api/training/admin/support` | session | training.support.manage | query{status?, page?, pageSize?} | admin.training.routes.ts:141 | n/a |
| PUT | `/api/training/admin/support/:id` | session | training.support.manage | params{id}<br>body{status, response?} | admin.training.routes.ts:146 | n/a |
| GET | `/api/training/admin/referrals/overview` | session | referrals.read | — | admin.training.routes.ts:149 | n/a |
| GET | `/api/training/admin/referrals/settings` | session | referrals.read | — | admin.training.routes.ts:149 | n/a |
| PUT | `/api/training/admin/referrals/settings` | session | referrals.settings | body{enabled?, rewardAmountPaise?, requireActiveEnrollment?, minPaidAmountPaise?, refundWindowDays?, attributionWindowDays?, maxRewardsPerReferrerPerMonth?, reason} | admin.training.routes.ts:151 | n/a |
| GET | `/api/training/admin/referrals/registrations` | session | referrals.read | query{stage?, page?, pageSize?} | admin.training.routes.ts:155 | n/a |
| GET | `/api/training/admin/referrals/rewards` | session | referrals.read | query{status?, page?, pageSize?} | admin.training.routes.ts:160 | n/a |
| POST | `/api/training/admin/referrals/rewards/:id/review` | session | referrals.review | params{id}<br>body{decision, reason?} | admin.training.routes.ts:165 | n/a |
| POST | `/api/training/admin/referrals/rewards/:id/payout` | session | referrals.payout | params{id}<br>body{method, reference, notes?} | admin.training.routes.ts:165 | n/a |
| GET | `/api/training/admin/referrals/fraud-reviews` | session | referrals.read | query{status?, page?, pageSize?} | admin.training.routes.ts:167 | n/a |
| POST | `/api/training/admin/referrals/fraud-reviews/:id/resolve` | session | referrals.review | params{id}<br>body{outcome, notes} | admin.training.routes.ts:172 | n/a |
| GET | `/api/training/admin/referrals/codes` | session | referrals.read | query{search?, page?, pageSize?} | admin.training.routes.ts:173 | n/a |
| PATCH | `/api/training/admin/referrals/codes/:id/status` | session | referrals.settings | params{id}<br>body{status, reason} | admin.training.routes.ts:178 | n/a |
| GET | `/api/training/admin/referrals/audit` | session | referrals.read | query{page?, pageSize?} | admin.training.routes.ts:179 | n/a |
| GET | `/api/training/admin/audit` | session | audit.read | query{entityType?, entityId?, actorId?, page?, pageSize?} | admin.training.routes.ts:186 | n/a |
| GET | `/api/training/courses` | public | — | query{search?, category?, mode?, level?, programType?, page?, pageSize?} | training.public.routes.ts:15 | n/a |
| GET | `/api/training/courses/:slug` | public | — | params{slug} | training.public.routes.ts:25 | n/a |
| GET | `/api/training/batches` | public | — | query{courseId?, mode?, status?, page?, pageSize?} | training.public.routes.ts:33 | n/a |
| GET | `/api/training/batches/:id` | public | — | params{id} | training.public.routes.ts:43 | n/a |
| POST | `/api/training/referrals/click` | public | — | body{code} | training.public.routes.ts:52 | n/a |
| GET | `/api/training/referrals/validate/:code` | public | — | params{code} | training.public.routes.ts:62 | n/a |
| GET | `/api/training/referrals/program` | public | — | — | training.public.routes.ts:72 | n/a |
| GET | `/api/training/certificates/verify/:code` | public | — | params{code} | training.public.routes.ts:86 | n/a |
| POST | `/api/training/apply` | public | — | body{fullName, phone, whatsapp?, email, age?, qualification, college?, city?, mode, codingExperience?, whyJoin?, preferredContactTime?} | public.routes.ts:59 | n/a |

### `/api/exams` (33)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/exams/student/exams` | session | student.portal | — | exam.routes.ts:28 | n/a |
| GET | `/api/exams/student/exams/:id` | session | student.portal | params{id} | exam.routes.ts:28 | n/a |
| POST | `/api/exams/student/exams/:id/start` | session | student.portal | params{id} | exam.routes.ts:30 | n/a |
| GET | `/api/exams/student/attempts` | session | student.portal | — | exam.routes.ts:39 | n/a |
| GET | `/api/exams/student/attempts/:id` | session | student.portal | params{id} | exam.routes.ts:39 | n/a |
| PUT | `/api/exams/student/attempts/:id/answers` | session | student.portal | params{id}<br>body{answers, focusLost?} | exam.routes.ts:42 | n/a |
| POST | `/api/exams/student/attempts/:id/submit` | session | student.portal | params{id}<br>body{answers?} | exam.routes.ts:43 | n/a |
| GET | `/api/exams/student/attempts/:id/result` | session | student.portal | params{id} | exam.routes.ts:44 | n/a |
| GET | `/api/exams/admin/questions` | session | exams.manage | query{track?, topic?, type?, search?, archived?, page?, pageSize?} | exam.routes.ts:56 | n/a |
| GET | `/api/exams/admin/topics` | session | exams.manage | — | exam.routes.ts:61 | n/a |
| POST | `/api/exams/admin/questions` | session | exams.manage | body{track, topic, type, prompt, options?, marks, guidance?, explanation?} | exam.routes.ts:62 | n/a |
| GET | `/api/exams/admin/questions/:id` | session | exams.manage | params{id} | exam.routes.ts:63 | n/a |
| PUT | `/api/exams/admin/questions/:id` | session | exams.manage | params{id}<br>body{track, topic, type, prompt, options?, marks, guidance?, explanation?} | exam.routes.ts:64 | n/a |
| PATCH | `/api/exams/admin/questions/:id/archive` | session | exams.manage | params{id}<br>body{archived} | exam.routes.ts:65 | n/a |
| GET | `/api/exams/admin/exams` | session | any of exams.results.read | exams.evaluate | exams.manage | query{status?, track?, search?, page?, pageSize?} | exam.routes.ts:28 | n/a |
| POST | `/api/exams/admin/exams` | session | exams.manage | body{title, description?, instructions, eligibilityNote?, track, kind?, durationMinutes, passPercent, maxAttempts, questionsPerAttempt?, shuffleQuestions?, shuffleOptions?, resultVisibility?, revealAnswers?, negativeMarkPercent?, interviewMaxMarks?, opensAt?, closesAt?} | exam.routes.ts:73 | n/a |
| GET | `/api/exams/admin/exams/:id` | session | any of exams.results.read | exams.evaluate | exams.manage | params{id} | exam.routes.ts:28 | n/a |
| PUT | `/api/exams/admin/exams/:id` | session | exams.manage | params{id}<br>body{title, description?, instructions, eligibilityNote?, track, kind?, durationMinutes, passPercent, maxAttempts, questionsPerAttempt?, shuffleQuestions?, shuffleOptions?, resultVisibility?, revealAnswers?, negativeMarkPercent?, interviewMaxMarks?, opensAt?, closesAt?} | exam.routes.ts:75 | n/a |
| PUT | `/api/exams/admin/exams/:id/questions` | session | exams.manage | params{id}<br>body{questionIds} | exam.routes.ts:75 | n/a |
| POST | `/api/exams/admin/exams/:id/publish` | session | exams.manage | params{id} | exam.routes.ts:77 | n/a |
| POST | `/api/exams/admin/exams/:id/archive` | session | exams.manage | params{id} | exam.routes.ts:77 | n/a |
| POST | `/api/exams/admin/exams/:id/release-results` | session | exams.manage | params{id} | exam.routes.ts:78 | n/a |
| GET | `/api/exams/admin/targets` | session | exams.manage | query{search?} | exam.routes.ts:82 | n/a |
| POST | `/api/exams/admin/exams/:id/assignments` | session | exams.manage | params{id}<br>body{target, studentId?, batchId?, courseId?, institution?} | exam.routes.ts:83 | n/a |
| DELETE | `/api/exams/admin/exams/:id/assignments/:assignmentId` | session | exams.manage | params{id, assignmentId} | exam.routes.ts:84 | n/a |
| GET | `/api/exams/admin/exams/:id/attempts` | session | any of exams.results.read | exams.evaluate | exams.manage | params{id}<br>query{status?, search?, page?, pageSize?} | exam.routes.ts:87 | n/a |
| GET | `/api/exams/admin/attempts/:id` | session | any of exams.results.read | exams.evaluate | exams.manage | params{id} | exam.routes.ts:39 | n/a |
| POST | `/api/exams/admin/attempts/:id/evaluate` | session | exams.evaluate | params{id}<br>body{marks, feedback?} | exam.routes.ts:93 | n/a |
| POST | `/api/exams/admin/exams/:id/retakes` | session | exams.manage | params{id}<br>body{studentId, reason} | exam.routes.ts:93 | n/a |
| POST | `/api/exams/admin/exams/:id/interview-results` | session | exams.evaluate | params{id}<br>body{studentId, score, feedback?} | exam.routes.ts:94 | n/a |
| GET | `/api/exams/admin/exams/:id/report` | session | any of exams.results.read | exams.evaluate | exams.manage | params{id} | exam.routes.ts:98 | n/a |
| GET | `/api/exams/admin/exams/:id/export` | session | any of exams.results.read | exams.evaluate | exams.manage | params{id} | exam.routes.ts:98 | n/a |
| GET | `/api/exams/admin/students/:studentId/performance` | session | any of exams.results.read | exams.evaluate | exams.manage | params{studentId} | exam.routes.ts:99 | n/a |

### `/api/crm` (12)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/crm/reminders/dispatch` | secret | x-cron-secret header (CRON_SECRET); 404 otherwise | — | crm.routes.ts:26 | n/a |
| GET | `/api/crm/summary` | session | leads.manage | query{from?, to?} | crm.routes.ts:37 | n/a |
| GET | `/api/crm/assignees` | session | leads.manage | — | crm.routes.ts:37 | n/a |
| GET | `/api/crm/leads` | session | leads.manage | query{status?, priority?, assignedToId?, service?, source?, utmCampaign?, search?, followUp?, includeDuplicates?, from?, to?, sort?, page?, pageSize?} | crm.routes.ts:40 | n/a |
| GET | `/api/crm/leads/export` | session | leads.manage | query{status?, priority?, assignedToId?, service?, source?, utmCampaign?, search?, followUp?, includeDuplicates?, from?, to?, sort?, page?, pageSize?} | crm.routes.ts:45 | n/a |
| POST | `/api/crm/leads` | session | leads.manage | body{name, email, phone?, company?, service?, budget?, timeline?, message, source, priority?, assignedToId?} | crm.routes.ts:46 | n/a |
| GET | `/api/crm/leads/:id` | session | leads.manage | params{id} | crm.routes.ts:47 | n/a |
| PATCH | `/api/crm/leads/:id` | session | leads.manage | params{id}<br>body{status?, priority?, assignedToId?, followUpAt?, service?, budget?, timeline?, company?, phone?, note?} | crm.routes.ts:48 | n/a |
| POST | `/api/crm/leads/:id/notes` | session | leads.manage | params{id}<br>body{body, type?} | crm.routes.ts:49 | n/a |
| GET | `/api/crm/rules` | session | leads.manage | — | crm.routes.ts:51 | n/a |
| PUT | `/api/crm/rules` | session | leads.manage; users.manage | body{rules} | crm.routes.ts:52 | n/a |
| POST | `/api/crm/reminders/run` | session | leads.manage; users.manage | — | crm.routes.ts:53 | n/a |

### `/api/programs` (34)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/programs/student/register` | session | student.portal | body{slug} | program.routes.ts:27 | n/a |
| GET | `/api/programs/student/enrollments` | session | student.portal | — | program.routes.ts:31 | n/a |
| GET | `/api/programs/student/enrollments/:id` | session | student.portal | params{id} | program.routes.ts:31 | n/a |
| POST | `/api/programs/student/payments/order` | session | student.portal | body{enrollmentId} | program.routes.ts:33 | n/a |
| POST | `/api/programs/student/payments/verify` | session | student.portal | body{orderId, paymentId, signature} | program.routes.ts:35 | n/a |
| POST | `/api/programs/student/payments/failure` | session | student.portal | body{orderId, reason} | program.routes.ts:35 | n/a |
| GET | `/api/programs/student/enrollments/:id/lessons/:lessonId` | session | student.portal | params{id, lessonId} | program.routes.ts:37 | n/a |
| POST | `/api/programs/student/enrollments/:id/lessons/:lessonId/complete` | session | student.portal | params{id, lessonId} | program.routes.ts:38 | n/a |
| POST | `/api/programs/student/enrollments/:id/attempts` | session | student.portal | params{id} | program.routes.ts:38 | n/a |
| GET | `/api/programs/student/attempts/:id` | session | student.portal | params{id} | program.routes.ts:40 | n/a |
| POST | `/api/programs/student/attempts/:id/submit` | session | student.portal | params{id}<br>body{answers} | program.routes.ts:41 | n/a |
| GET | `/api/programs/student/enrollments/:id/certificate.pdf` | session | student.portal | params{id} | program.routes.ts:42 | n/a |
| GET | `/api/programs/admin/programs` | session | programs.read | — | program.routes.ts:50 | n/a |
| POST | `/api/programs/admin/programs` | session | programs.read; programs.manage | body{slug, title, summary, description, feePaise, passPercent, maxAttempts, questionsPerAttempt?, timeLimitMinutes, certificateTitle, status?} | program.routes.ts:51 | n/a |
| GET | `/api/programs/admin/programs/:id` | session | programs.read | params{id} | program.routes.ts:52 | n/a |
| PATCH | `/api/programs/admin/programs/:id` | session | programs.read; programs.manage | params{id}<br>body{slug?, title?, summary?, description?, feePaise?, passPercent?, maxAttempts?, questionsPerAttempt?, timeLimitMinutes?, certificateTitle?, status?} | program.routes.ts:53 | n/a |
| POST | `/api/programs/admin/programs/:id/lessons` | session | programs.read; programs.manage | params{id}<br>body{title, body, videoUrl?, minMinutes, required, position?} | program.routes.ts:54 | n/a |
| PUT | `/api/programs/admin/programs/:id/lessons/:lessonId` | session | programs.read; programs.manage | params{id, lessonId}<br>body{title, body, videoUrl?, minMinutes, required, position?} | program.routes.ts:55 | n/a |
| PATCH | `/api/programs/admin/programs/:id/lessons/:lessonId/archive` | session | programs.read; programs.manage | params{id, lessonId}<br>body{archived} | program.routes.ts:56 | n/a |
| POST | `/api/programs/admin/programs/:id/questions` | session | programs.read; programs.manage | params{id}<br>body{prompt, options, correctIndex, explanation?} | program.routes.ts:57 | n/a |
| PUT | `/api/programs/admin/programs/:id/questions/:questionId` | session | programs.read; programs.manage | params{id, questionId}<br>body{prompt, options, correctIndex, explanation?} | program.routes.ts:58 | n/a |
| PATCH | `/api/programs/admin/programs/:id/questions/:questionId/archive` | session | programs.read; programs.manage | params{id, questionId}<br>body{archived} | program.routes.ts:59 | n/a |
| GET | `/api/programs/admin/enrollments` | session | programs.read | query{programId?, status?, search?, page?, pageSize?} | program.routes.ts:31 | n/a |
| GET | `/api/programs/admin/enrollments/export` | session | programs.read | query{programId?, status?, search?, page?, pageSize?} | program.routes.ts:66 | n/a |
| GET | `/api/programs/admin/enrollments/:id` | session | programs.read | params{id} | program.routes.ts:31 | n/a |
| POST | `/api/programs/admin/enrollments/:id/extra-attempt` | session | programs.read; programs.manage | params{id}<br>body{reason} | program.routes.ts:68 | n/a |
| POST | `/api/programs/admin/enrollments/:id/cancel` | session | programs.read; programs.manage | params{id}<br>body{reason} | program.routes.ts:68 | n/a |
| POST | `/api/programs/admin/enrollments/:id/certificate` | session | programs.read; programs.manage | params{id} | program.routes.ts:69 | n/a |
| POST | `/api/programs/admin/certificates/:id/revoke` | session | programs.read; programs.manage | params{id}<br>body{reason} | program.routes.ts:70 | n/a |
| POST | `/api/programs/admin/certificates/:id/resend` | session | programs.read; programs.manage | params{id} | program.routes.ts:71 | n/a |
| GET | `/api/programs/admin/certificates/:id/pdf` | session | programs.read | params{id} | program.routes.ts:73 | n/a |
| GET | `/api/programs/admin/report` | session | programs.read | query{programId?, from?, to?} | program.routes.ts:73 | n/a |
| GET | `/api/programs` | public | — | — | program.routes.ts:81 | n/a |
| GET | `/api/programs/:slug` | public | — | params{slug} | program.routes.ts:81 | n/a |

### `/api/documents` (28)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/documents/profile` | session | documents.read | — | document.routes.ts:29 | n/a |
| PUT | `/api/documents/profile` | session | documents.read; documents.settings | body{legalName?, tradeName?, addressLine1?, addressLine2?, city?, state?, stateCode?, postalCode?, country?, email?, phone?, website?, gstRegistered?, gstin?, pan?, registrationNo?, defaultGstRateBp?, bankDetails?, upiId?, signatoryName?, signatoryTitle?, footerNote?, numbering?} | document.routes.ts:33 | n/a |
| GET | `/api/documents/clients` | session | documents.read | query{search?, includeArchived?, page?, pageSize?} | document.routes.ts:36 | n/a |
| POST | `/api/documents/clients` | session | documents.read; any of documents.manage | documents.finance | body{name, company?, email, phone?, addressLine1?, addressLine2?, city?, state?, stateCode?, postalCode?, country?, gstin?, notes?, leadId?} | document.routes.ts:41 | n/a |
| POST | `/api/documents/clients/from-lead` | session | documents.read; any of documents.manage | documents.finance | body{leadId} | document.routes.ts:41 | n/a |
| GET | `/api/documents/clients/:id` | session | documents.read | params{id} | document.routes.ts:43 | n/a |
| PUT | `/api/documents/clients/:id` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{name, company?, email, phone?, addressLine1?, addressLine2?, city?, state?, stateCode?, postalCode?, country?, gstin?, notes?, leadId?} | document.routes.ts:44 | n/a |
| PATCH | `/api/documents/clients/:id/archive` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{archived} | document.routes.ts:45 | n/a |
| GET | `/api/documents/templates` | session | documents.read | query{type?, includeArchived?} | document.routes.ts:48 | n/a |
| POST | `/api/documents/templates` | session | documents.read; documents.settings | body{type, name, title?, sections?, items?, notes?, terms?} | document.routes.ts:52 | n/a |
| PUT | `/api/documents/templates/:id` | session | documents.read; documents.settings | params{id}<br>body{type, name, title?, sections?, items?, notes?, terms?} | document.routes.ts:53 | n/a |
| PATCH | `/api/documents/templates/:id/archive` | session | documents.read; documents.settings | params{id}<br>body{archived} | document.routes.ts:54 | n/a |
| GET | `/api/documents/email-log` | session | documents.read; any of documents.finance | payments.read | — | document.routes.ts:57 | n/a |
| GET | `/api/documents` | session | documents.read | query{type?, status?, clientId?, leadId?, studentId?, search?, page?, pageSize?} | document.routes.ts:62 | n/a |
| POST | `/api/documents` | session | documents.read; any of documents.manage | documents.finance | body{type, clientId?, leadId?, studentId?, templateId?, title, party?, items?, sections?, notes?, terms?, applyGst?, issueDate?, dueDate?, validUntil?} | document.routes.ts:67 | n/a |
| GET | `/api/documents/:id` | session | documents.read | params{id} | document.routes.ts:68 | n/a |
| PATCH | `/api/documents/:id` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{title?, party?, items?, sections?, notes?, terms?, applyGst?, issueDate?, dueDate?, validUntil?} | document.routes.ts:69 | n/a |
| DELETE | `/api/documents/:id` | session | documents.read; any of documents.manage | documents.finance | params{id} | document.routes.ts:70 | n/a |
| GET | `/api/documents/:id/pdf` | session | documents.read | params{id} | document.routes.ts:71 | n/a |
| POST | `/api/documents/:id/issue` | session | documents.read; any of documents.manage | documents.finance | params{id} | document.routes.ts:72 | n/a |
| POST | `/api/documents/:id/send` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{to?, cc?, message?} | document.routes.ts:72 | n/a |
| POST | `/api/documents/:id/outcome` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{outcome, note} | document.routes.ts:77 | n/a |
| POST | `/api/documents/:id/convert` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{target} | document.routes.ts:77 | n/a |
| POST | `/api/documents/:id/revise` | session | documents.read; any of documents.manage | documents.finance | params{id} | document.routes.ts:78 | n/a |
| POST | `/api/documents/:id/signed` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{fileId, signedOn, note} | document.routes.ts:79 | n/a |
| GET | `/api/documents/:id/signed-copy` | session | documents.read | params{id} | document.routes.ts:81 | n/a |
| POST | `/api/documents/:id/payments` | session | documents.read; documents.finance | params{id}<br>body{amountPaise, method, reference, paidOn, note?} | document.routes.ts:89 | n/a |
| POST | `/api/documents/:id/void` | session | documents.read; any of documents.manage | documents.finance | params{id}<br>body{reason} | document.routes.ts:89 | n/a |

### `/api/employee` (19)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/employee/dashboard` | session | employee.portal | — | employee.routes.ts:21 | n/a |
| GET | `/api/employee/profile` | session | employee.portal | — | employee.routes.ts:21 | n/a |
| PUT | `/api/employee/profile` | session | employee.portal | body{emergencyContactName?, emergencyContactPhone?} | employee.routes.ts:23 | n/a |
| GET | `/api/employee/attendance` | session | employee.portal | query{month?} | employee.routes.ts:25 | n/a |
| POST | `/api/employee/attendance/check-in` | session | employee.portal | body{status?, notes?} | employee.routes.ts:26 | n/a |
| POST | `/api/employee/attendance/check-out` | session | employee.portal | — | employee.routes.ts:26 | n/a |
| GET | `/api/employee/leave` | session | employee.portal | — | employee.routes.ts:29 | n/a |
| POST | `/api/employee/leave` | session | employee.portal | body{type, startDate, endDate, reason} | employee.routes.ts:30 | n/a |
| POST | `/api/employee/leave/:id/cancel` | session | employee.portal | params{id} | employee.routes.ts:30 | n/a |
| GET | `/api/employee/projects` | session | employee.portal | — | employee.routes.ts:33 | n/a |
| GET | `/api/employee/projects/:id` | session | employee.portal | params{id} | employee.routes.ts:33 | n/a |
| GET | `/api/employee/tasks` | session | employee.portal | query{status?} | employee.routes.ts:34 | n/a |
| PATCH | `/api/employee/tasks/:id/status` | session | employee.portal | params{id}<br>body{status} | employee.routes.ts:36 | n/a |
| GET | `/api/employee/work-updates` | session | employee.portal | — | employee.routes.ts:38 | n/a |
| POST | `/api/employee/work-updates` | session | employee.portal | body{date, summary, minutes?, projectId?, taskId?} | employee.routes.ts:39 | n/a |
| GET | `/api/employee/documents` | session | employee.portal | — | employee.routes.ts:41 | n/a |
| GET | `/api/employee/hr-requests` | session | employee.portal | — | employee.routes.ts:41 | n/a |
| POST | `/api/employee/hr-requests` | session | employee.portal | body{category?, subject, message} | employee.routes.ts:43 | n/a |
| GET | `/api/employee/announcements` | session | employee.portal | — | employee.routes.ts:44 | n/a |

### `/api/hr` (24)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/hr/employees` | session | employees.read | query{search?, department?, sort?, page?, pageSize?} | hr.routes.ts:27 | n/a |
| POST | `/api/hr/employees` | session | employees.manage | body{name, email, phone?, role?, department, designation, employmentType?, joiningDate, managerId?, workLocation?} | hr.routes.ts:32 | n/a |
| GET | `/api/hr/employees/:id` | session | employees.read | params{id} | hr.routes.ts:33 | n/a |
| PATCH | `/api/hr/employees/:id/status` | session | employees.manage | params{id}<br>body{status, reason} | hr.routes.ts:34 | n/a |
| PUT | `/api/hr/employees/:id` | session | employees.manage | params{id}<br>body{name?, department?, designation?, employmentType?, joiningDate?, exitDate?, managerId?, workLocation?, reason} | hr.routes.ts:35 | n/a |
| PUT | `/api/hr/employees/:id/attendance` | session | employees.manage | params{id}<br>body{date, status, notes?, reason} | hr.routes.ts:39 | n/a |
| POST | `/api/hr/employees/:id/documents` | session | employees.manage | params{id}<br>body{title, category?, fileId, visibleToEmployee?} | hr.routes.ts:43 | n/a |
| PATCH | `/api/hr/documents/:id` | session | employees.manage | params{id}<br>body{visibleToEmployee?, remove?, reason} | hr.routes.ts:44 | n/a |
| GET | `/api/hr/leave` | session | leave.approve | query{status?, page?, pageSize?} | hr.routes.ts:50 | n/a |
| POST | `/api/hr/leave/:id/review` | session | leave.approve | params{id}<br>body{decision, note?} | hr.routes.ts:55 | n/a |
| GET | `/api/hr/projects` | session | projects.manage | query{status?, search?} | hr.routes.ts:58 | n/a |
| POST | `/api/hr/projects` | session | projects.manage | body{code, name, description?, status?, startDate?, endDate?} | hr.routes.ts:59 | n/a |
| GET | `/api/hr/projects/:id` | session | projects.manage | params{id} | hr.routes.ts:60 | n/a |
| PUT | `/api/hr/projects/:id` | session | projects.manage | params{id}<br>body{name?, description?, status?, startDate?, endDate?} | hr.routes.ts:61 | n/a |
| POST | `/api/hr/projects/:id/members` | session | projects.manage | params{id}<br>body{userId, role?} | hr.routes.ts:62 | n/a |
| DELETE | `/api/hr/projects/:id/members/:userId` | session | projects.manage | params{id, userId} | hr.routes.ts:63 | n/a |
| GET | `/api/hr/tasks` | session | projects.manage | query{projectId?, assigneeId?, status?, page?, pageSize?} | hr.routes.ts:64 | n/a |
| POST | `/api/hr/tasks` | session | projects.manage | body{title, description?, assigneeId, projectId?, priority?, status?, dueDate?} | hr.routes.ts:69 | n/a |
| PUT | `/api/hr/tasks/:id` | session | projects.manage | params{id}<br>body{title?, description?, assigneeId?, projectId?, priority?, status?, dueDate?} | hr.routes.ts:70 | n/a |
| GET | `/api/hr/work-updates` | session | projects.manage | query{employeeId?, projectId?, page?, pageSize?} | hr.routes.ts:71 | n/a |
| GET | `/api/hr/requests` | session | hr.requests.manage | query{status?, page?, pageSize?} | hr.routes.ts:78 | n/a |
| PUT | `/api/hr/requests/:id` | session | hr.requests.manage | params{id}<br>body{status, response?} | hr.routes.ts:83 | n/a |
| GET | `/api/hr/announcements` | session | company.announcements.manage | — | hr.routes.ts:84 | n/a |
| POST | `/api/hr/announcements` | session | company.announcements.manage | body{title, body} | hr.routes.ts:85 | n/a |

### `/api/platform` (15)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/platform/users` | session | users.manage | query{search?, role?, status?, sort?, page?, pageSize?} | hr.routes.ts:91 | n/a |
| PATCH | `/api/platform/users/:id/role` | session | users.manage | params{id}<br>body{role, reason} | hr.routes.ts:96 | n/a |
| GET | `/api/platform/roles` | session | users.manage | — | hr.routes.ts:97 | n/a |
| GET | `/api/platform/reports/summary` | session | reports.read | — | hr.routes.ts:97 | n/a |
| GET | `/api/platform/overview` | session | any signed-in user (checks in handler/service) | — | hr.routes.ts:102 | n/a |
| GET | `/api/platform/permissions` | session | users.manage | — | hr.routes.ts:102 | n/a |
| GET | `/api/platform/users/:id` | session | users.manage | params{id} | hr.routes.ts:103 | n/a |
| PUT | `/api/platform/users/:id` | session | users.manage | params{id}<br>body{name?, phone?, reason} | hr.routes.ts:105 | n/a |
| POST | `/api/platform/users/:id/password-reset` | session | users.manage | params{id}<br>body{revokeSessions?, reason} | hr.routes.ts:109 | n/a |
| POST | `/api/platform/users/:id/permissions` | session | users.manage | params{id}<br>body{permission, reason} | hr.routes.ts:109 | n/a |
| DELETE | `/api/platform/users/:id/permissions/:permission` | session | users.manage | params{id, permission} | hr.routes.ts:111 | n/a |
| GET | `/api/platform/users/:id/notes` | session | any of users.manage | training.students.manage | employees.manage | params{id} | hr.routes.ts:116 | n/a |
| POST | `/api/platform/users/:id/notes` | session | any of users.manage | training.students.manage | employees.manage | params{id}<br>body{body} | hr.routes.ts:117 | n/a |
| DELETE | `/api/platform/users/:id/notes/:noteId` | session | any of users.manage | training.students.manage | employees.manage | params{id, noteId} | hr.routes.ts:118 | n/a |
| GET | `/api/platform/reports/:type` | session | reports.read | params{type}<br>query{from?, to?, export?} | hr.routes.ts:119 | n/a |

### `/api/files` (3)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/files/public/:id` | public | — | params{id} | files.routes.ts:36 | n/a |
| POST | `/api/files` | session | any signed-in user (checks in handler/service) | query{purpose} | files.routes.ts:24 | n/a |
| GET | `/api/files/:id` | session | any signed-in user (checks in handler/service) | params{id} | files.routes.ts:36 | n/a |

### `/api/services` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/services` | public | — | — | public.routes.ts:34 | n/a |
| GET | `/api/services/:slug` | public | — | — | public.routes.ts:34 | n/a |

### `/api/solutions` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/solutions` | public | — | — | public.routes.ts:37 | n/a |
| GET | `/api/solutions/:slug` | public | — | — | public.routes.ts:37 | n/a |

### `/api/industries` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/industries` | public | — | — | public.routes.ts:40 | n/a |
| GET | `/api/industries/:slug` | public | — | — | public.routes.ts:40 | n/a |

### `/api/portfolio` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/portfolio` | public | — | — | public.routes.ts:43 | n/a |
| GET | `/api/portfolio/:slug` | public | — | — | public.routes.ts:43 | n/a |

### `/api/blog` (2)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/blog` | public | — | — | public.routes.ts:46 | n/a |
| GET | `/api/blog/:slug` | public | — | — | public.routes.ts:46 | n/a |

### `/api/landing-pages` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/landing-pages/:slug` | public | — | — | public.routes.ts:49 | n/a |

### `/api/settings` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/settings` | public | — | — | public.routes.ts:52 | n/a |

### `/api/technologies` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/technologies` | public | — | — | public.routes.ts:52 | n/a |

### `/api/faqs` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/faqs` | public | — | query{category?} | public.routes.ts:53 | n/a |

### `/api/blog-categories` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/blog-categories` | public | — | — | public.routes.ts:54 | n/a |

### `/api/contact` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/contact` | public | — | body{name, email, phone?, company?, service?, budget?, message, timeline?, contactPreference?, marketingConsent?, source?, landingPage?, referrer?, utmSource?, utmMedium?, utmCampaign?, utmTerm?, utmContent?, website?, elapsedMs?} | public.routes.ts:58 | n/a |

### `/api/track` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/track` | public | — | body{type, label?, page?, service?, utmSource?, utmMedium?, utmCampaign?} | public.routes.ts:58 | n/a |

### `/api/careers` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/careers/apply` | public | — | body{name, email, phone?, position, resumeUrl?, portfolioUrl?, message?} | public.routes.ts:60 | n/a |

### `/api/newsletter` (1)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| POST | `/api/newsletter` | public | — | body{email} | public.routes.ts:61 | n/a |

### `/api/admin` (72)

| Method | Path | Auth | Access rule | Validated input | Source | Tested (statuses seen) |
|---|---|---|---|---|---|---|
| GET | `/api/admin/services` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/services/slug-available` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/services/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| POST | `/api/admin/services` | session | cms.manage | body{slug, title, tagline?, icon?, shortDesc, overview, problem?, solution?, features?, deliverables?, benefits?, technologies?, process?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, featured?, published?, heroVariant?, audience?, industries?} | admin.routes.ts | n/a |
| PUT | `/api/admin/services/:id` | session | cms.manage | body{slug?, title?, tagline?, icon?, shortDesc?, overview?, problem?, solution?, features?, deliverables?, benefits?, technologies?, process?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, featured?, published?, heroVariant?, audience?, industries?} | admin.routes.ts | n/a |
| PATCH | `/api/admin/services/:id/publish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/services/:id/unpublish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| DELETE | `/api/admin/services/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/solutions` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/solutions/slug-available` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/solutions/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| POST | `/api/admin/solutions` | session | cms.manage | body{slug, title, tagline?, icon?, shortDesc, overview, features?, benefits?, technologies?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, published?} | admin.routes.ts | n/a |
| PUT | `/api/admin/solutions/:id` | session | cms.manage | body{slug?, title?, tagline?, icon?, shortDesc?, overview?, features?, benefits?, technologies?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, published?} | admin.routes.ts | n/a |
| PATCH | `/api/admin/solutions/:id/publish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/solutions/:id/unpublish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| DELETE | `/api/admin/solutions/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/industries` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/industries/slug-available` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/industries/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| POST | `/api/admin/industries` | session | cms.manage | body{slug, title, tagline?, icon?, shortDesc, overview, challenges?, solutions?, relevantServices?, features?, technologies?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, published?} | admin.routes.ts | n/a |
| PUT | `/api/admin/industries/:id` | session | cms.manage | body{slug?, title?, tagline?, icon?, shortDesc?, overview?, challenges?, solutions?, relevantServices?, features?, technologies?, useCases?, faqs?, seoTitle?, seoDescription?, ogImage?, order?, published?} | admin.routes.ts | n/a |
| PATCH | `/api/admin/industries/:id/publish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/industries/:id/unpublish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| DELETE | `/api/admin/industries/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/portfolio` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/portfolio/slug-available` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/portfolio/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| POST | `/api/admin/portfolio` | session | cms.manage | body{slug, title, shortDescription, description, category, industry?, client?, challenge?, requirement?, approach?, solution?, features?, technologies?, images?, gallery?, outcome?, clientApproved?, services?, links?, publishedAt?, featured?, published?, order?, seoTitle?, seoDescription?, ogImage?} | admin.routes.ts | n/a |
| PUT | `/api/admin/portfolio/:id` | session | cms.manage | body{slug?, title?, shortDescription?, description?, category?, industry?, client?, challenge?, requirement?, approach?, solution?, features?, technologies?, images?, gallery?, outcome?, clientApproved?, services?, links?, publishedAt?, featured?, published?, order?, seoTitle?, seoDescription?, ogImage?} | admin.routes.ts | n/a |
| PATCH | `/api/admin/portfolio/:id/publish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/portfolio/:id/unpublish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/portfolio/:id/archive` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/portfolio/:id/restore` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| DELETE | `/api/admin/portfolio/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/blog` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/blog/slug-available` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/blog/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| POST | `/api/admin/blog` | session | cms.manage | body{slug, title, excerpt, content, coverImage?, author?, categoryId?, tags?, readingTime?, seoTitle?, seoDescription?, ogImage?, canonicalUrl?, publishedAt?, published?} | admin.routes.ts | n/a |
| PUT | `/api/admin/blog/:id` | session | cms.manage | body{slug?, title?, excerpt?, content?, coverImage?, author?, categoryId?, tags?, readingTime?, seoTitle?, seoDescription?, ogImage?, canonicalUrl?, publishedAt?, published?} | admin.routes.ts | n/a |
| PATCH | `/api/admin/blog/:id/publish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/blog/:id/unpublish` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/blog/:id/archive` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| PATCH | `/api/admin/blog/:id/restore` | session | cms.manage + cms.publish | — | admin.routes.ts | n/a |
| DELETE | `/api/admin/blog/:id` | session | cms.manage | — | admin.routes.ts | n/a |
| GET | `/api/admin/blog-categories` | session | cms.manage | — | admin.routes.ts:87 | n/a |
| POST | `/api/admin/blog-categories` | session | cms.manage | body{name, slug} | admin.routes.ts:88 | n/a |
| PUT | `/api/admin/blog-categories/:id` | session | cms.manage | params{id}<br>body{name, slug} | admin.routes.ts:89 | n/a |
| DELETE | `/api/admin/blog-categories/:id` | session | cms.manage | params{id} | admin.routes.ts:90 | n/a |
| GET | `/api/admin/landing-pages` | session | cms.manage | — | admin.routes.ts:93 | n/a |
| GET | `/api/admin/landing-pages/:id` | session | cms.manage | params{id} | admin.routes.ts:93 | n/a |
| POST | `/api/admin/landing-pages` | session | cms.manage | body{slug, serviceSlug, headline, subheadline, benefits?, ctaLabel?, priceNote?, seoTitle?, seoDescription?, indexable?, published?} | admin.routes.ts:95 | n/a |
| PUT | `/api/admin/landing-pages/:id` | session | cms.manage | params{id}<br>body{slug?, serviceSlug?, headline?, subheadline?, benefits?, ctaLabel?, priceNote?, seoTitle?, seoDescription?, indexable?, published?} | admin.routes.ts:96 | n/a |
| PATCH | `/api/admin/landing-pages/:id/archive` | session | cms.manage + cms.publish | params{id} | admin.routes.ts:97 | n/a |
| DELETE | `/api/admin/landing-pages/:id` | session | cms.manage | params{id} | admin.routes.ts:98 | n/a |
| GET | `/api/admin/dashboard` | session | role ADMIN | — | admin.routes.ts:102 | n/a |
| GET | `/api/admin/contacts` | session | role ADMIN | query{status?, search?} | admin.routes.ts:105 | n/a |
| PUT | `/api/admin/contacts/:id` | session | role ADMIN | body{status} | admin.routes.ts:106 | n/a |
| DELETE | `/api/admin/contacts/:id` | session | role ADMIN | — | admin.routes.ts:107 | n/a |
| GET | `/api/admin/training` | session | role ADMIN | query{status?, search?} | admin.routes.ts:109 | n/a |
| PUT | `/api/admin/training/:id` | session | role ADMIN | body{status} | admin.routes.ts:110 | n/a |
| DELETE | `/api/admin/training/:id` | session | role ADMIN | — | admin.routes.ts:111 | n/a |
| GET | `/api/admin/careers` | session | role ADMIN | query{status?, search?} | admin.routes.ts:113 | n/a |
| PUT | `/api/admin/careers/:id` | session | role ADMIN | body{status} | admin.routes.ts:114 | n/a |
| DELETE | `/api/admin/careers/:id` | session | role ADMIN | — | admin.routes.ts:115 | n/a |
| GET | `/api/admin/newsletter` | session | role ADMIN | — | admin.routes.ts:117 | n/a |
| DELETE | `/api/admin/newsletter/:id` | session | role ADMIN | — | admin.routes.ts:118 | n/a |
| GET | `/api/admin/faqs` | session | role ADMIN | query{category?} | admin.routes.ts:121 | n/a |
| POST | `/api/admin/faqs` | session | role ADMIN | body{question, answer, category?, order?} | admin.routes.ts:122 | n/a |
| PUT | `/api/admin/faqs/:id` | session | role ADMIN | params{id}<br>body{question?, answer?, category?, order?} | admin.routes.ts:123 | n/a |
| DELETE | `/api/admin/faqs/:id` | session | role ADMIN | params{id} | admin.routes.ts:124 | n/a |
| GET | `/api/admin/settings` | session | role ADMIN | — | admin.routes.ts:127 | n/a |
| PUT | `/api/admin/settings` | session | role ADMIN | body{companyName?, logoUrl?, email?, phone?, whatsapp?, address?, facebookUrl?, instagramUrl?, linkedinUrl?, twitterUrl?, youtubeUrl?, footerDescription?, defaultSeoTitle?, defaultSeoDesc?, ctaText?, mapUrl?, mapEmbedUrl?} | admin.routes.ts:128 | n/a |
