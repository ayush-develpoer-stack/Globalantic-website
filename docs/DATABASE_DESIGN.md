# Database Design — Training Platform

- **Schema:** `prisma/schema.prisma`
- **Migration:** `prisma/migrations/20261015090000_training_platform/migration.sql`
- **Database:** PostgreSQL (Supabase in production; embedded PostgreSQL 17 locally for tests and dev)

## Migration safety
The training migration is **purely additive**:
- 26 new enums (including `UserStatus`)
- 33 new tables, with 28 unique indexes, 46 indexes and 55 foreign keys
- 3 new values on the existing `Role` enum (`FINANCE`, `TRAINER`, `STUDENT`)
- 5 new **nullable or defaulted** columns on `users`: `status` defaults to `ACTIVE`; `phone` (unique, nullable), `emailVerifiedAt`, `lastLoginAt` and `deletedAt` are nullable

There are no drops, renames, type changes or data rewrites. Existing rows (CMS content, leads, admin users) are unaffected.

It was generated with `npm --workspace backend run db:diff`, which uses a local shadow DB. It is applied from scratch by every test run (`tests/run.ts`).

**Applied to Supabase on 2026-10-15**, together with the later migrations, with approval and after a backup and a rehearsal (see DEPLOYMENT.md, incident).

## Conventions
- UUID primary keys, `createdAt`/`updatedAt`, camelCase columns, snake_case table names (matching the existing schema).
- Money is **integer paise**.
- Soft deletion (`deletedAt`) on users, courses, batches, assignments and learning materials. Financial and academic records are never deleted (`onDelete: Restrict`).
- Actor columns named `*ById` are soft references. `audit_logs.actorId` is the FK-backed authoritative record.
- Status columns are Postgres enums, mirrored in `@globalantic/types` (drift-tested).

## Entities

| Area | Table | Key constraints / indexes |
|---|---|---|
| Identity | `users` (+ status, phone, emailVerifiedAt, lastLoginAt, deletedAt) | `email` unique, `phone` unique, index on `role` |
| | `sessions` | FK user (cascade), index on userId and expiresAt. Revocation via `revokedAt`. |
| | `auth_tokens` | `tokenHash` unique (SHA-256 only), index on (userId, type) |
| | `student_profiles` | `userId` unique, index on `emailCanonical`, consent timestamp and version |
| Catalogue | `courses` | `slug` unique, index on status, category and programType. `feePaise`, `discountPaise`, SEO fields, `minAttendancePercent`. |
| | `course_modules` | FK course (cascade), index on (courseId, order) |
| | `batches` | FK course (restrict), unique (courseId, name), index on status and startDate. Optional `feePaise` override. |
| | `batch_schedules` | weekly slots (dayOfWeek 0–6, "HH:MM") |
| | `trainer_assignments` | unique (batchId, trainerId). `removedAt` keeps history. |
| Admissions | `admission_applications` | `applicationNumber` unique, **unique (studentId, batchId)**, fee snapshot (`feePaise`, `discountPaise`, `payablePaise`) |
| | `enrollments` | `applicationId` unique, **unique (studentId, batchId)** |
| Learning | `attendance` | **unique (enrollmentId, sessionDate)**, `sessionDate` is DATE, `markedById`/`updatedById` |
| | `assignments`, `assignment_submissions` | submissions unique (assignmentId, studentId) |
| | `assessments`, `results` | results unique (assessmentId, studentId), `resultsPublished` gate |
| | `feedback`, `learning_materials`, `announcements` | announcements with `batchId` null are programme-wide |
| | `certificates` | `certificateNumber` unique, `verificationCode` unique, `enrollmentId` unique |
| Money | `payments` | **`providerOrderId` unique, `providerPaymentId` unique**, index on applicationId, studentId and status. `verifiedVia` enum. |
| | `invoices` (receipt) | `invoiceNumber` unique, **`paymentId` unique** |
| | `payment_webhook_events` | **`eventId` unique** (replay protection) |
| Comms | `notifications` | index on (userId, readAt) and (userId, createdAt) |
| | `support_requests` | |
| Referral | `referral_settings` | singleton id = 1 (amount 200000 paise by default) |
| | `referral_codes` | `userId` unique, `code` unique |
| | `referral_clicks` | index on (codeId, createdAt) and (codeId, ipHash) |
| | `referral_registrations` | **`referredUserId` unique** |
| | `referral_rewards` | **`registrationId`, `referredUserId` and `paymentId` all unique** |
| | `referral_payouts` | `rewardId` unique |
| | `fraud_reviews` | |
| Audit | `audit_logs` | index on (entityType, entityId), actorId and createdAt |
| | `document_counters` | per-year gap-free numbers: `APP-2026-000001`, `INV-…`, `CERT-…` |

## Concurrency & integrity patterns
- **Row locks** (`SELECT … FOR UPDATE`):
  - the user row serialises one student's admission attempts (prevents concurrent duplicates across batches of the same course; tested with 3 parallel submits);
  - the batch row serialises seat decisions;
  - the payment row serialises the transition to `PAID`.
- **Seats:** `ACTIVE`/`COMPLETED` enrollments + `APPROVED` applications. Approval reserves a seat, so a verified payment can always be honoured.
- **Conditional status updates** (`updateMany … where status in (…)`) for applications, rewards, batches and tokens.
- **Idempotent inserts:** `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`) for webhook events and referral rewards. A duplicate therefore never aborts the surrounding payment transaction.
- **Transactions:** payment → invoice → enrollment → referral → notification commit together. Emails are sent **after** commit (`AfterCommit`).

## Legacy tables
`training_applications` (the old lead form) is kept unchanged as an enquiry inbox. New admissions use `admission_applications`.

## Migration `20261016090000_employee_portal_and_files` (ADDITIVE ONLY; applied to Supabase 2026-10-15)
- 10 new enums, 11 new tables, 2 new `Role` values (`HR`, `EMPLOYEE`), and 2 nullable FK columns: `assignment_submissions.fileId` and `admission_applications.documentFileId`, both `ON DELETE SET NULL`. No drops, renames or rewrites.

| Table | Key constraints |
|---|---|
| `stored_files` | `storageKey` unique, FK owner (restrict), `purpose` enum, `sha256`, `deletedAt` |
| `employee_profiles` | `userId` unique, `employeeCode` unique (`EMP-YYYY-NNNNNN` from `document_counters`), FK manager (set null), index on department and managerId |
| `employee_attendance` | **unique (employeeId, date)**, `correctedById` |
| `leave_requests` | index on (employeeId, status) and status. `days` computed on the server; overlap check runs under a user-row lock. |
| `projects` / `project_members` | `code` unique / unique (projectId, userId) |
| `tasks` | FK assignee (restrict), project (set null), index on (assigneeId, status) |
| `work_updates` | index on (employeeId, date) |
| `employee_documents` | FK file (restrict), `visibleToEmployee`, soft delete |
| `hr_requests` | reuses the `SupportStatus` enum |
| `company_announcements` | index on createdAt |

## Migration `20261018090000_intern_exams_and_material_files` (ADDITIVE ONLY; applied to Supabase 2026-10-15 with approval)
- Enums: `ExamTrack`, `ExamKind`, `ExamStatus`, `ExamQuestionType`, `ExamResultVisibility`, `ExamAssignmentTarget`, `ExamAttemptStatus`. New `FilePurpose` value: `LEARNING_MATERIAL`.
- Tables:
  - `exam_questions`: the bank; the answer key lives only here.
  - `exams`: includes `negativeMarkPercent`.
  - `exam_question_links`
  - `exam_assignments`: student / batch / institution / programme.
  - `exam_attempts`: unique `(examId, studentId, attemptNo)`, per-attempt question and option order, server `deadlineAt`, `score` as a double.
  - `exam_answers`: unique `(attemptId, questionId)`.
  - `exam_retake_grants`
- `learning_materials`: new nullable `fileId` (FK to `stored_files`, RESTRICT); `url` relaxed to nullable. No data is changed.
- Rehearsed before applying: no drift, full JSON backup of all 60 tables, every row count preserved on a migrated local copy, and identical row counts on Supabase after the deploy.

## Migration `20261017090000_admin_integration` (ADDITIVE ONLY; applied to Supabase 2026-10-15)
| Change | Detail |
|---|---|
| `FilePurpose` + `COURSE_IMAGE`, `CMS_IMAGE` | public images |
| `admission_applications` + `infoRequest`, `infoRequestedAt`, `infoResponse`, `infoRespondedAt` (nullable) | "request more information" loop |
| `user_permission_grants` | unique (userId, permission), FK user (cascade), `grantedById` |
| `user_notes` | FK user (cascade), `authorId`, soft delete, index on (userId, createdAt) |
