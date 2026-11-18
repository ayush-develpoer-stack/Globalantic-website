# Globalantic — Role & Permission Matrix (implemented)

**Updated:** 2026-10-15. This file describes what the code actually enforces.
- Source of truth: `backend/src/lib/permissions.ts`.
- Tests: `backend/tests/permissions.test.ts` (route matrix) and `backend/tests/contracts.test.ts` (the shared `Permission` type equals the server list).

The model has three layers:
1. **Role**: `users.role`. It is read from the **database on every request**, never from the JWT, so a role change applies on the next request.
2. **Permission**: every staff route declares `requirePermission(...)`. Roles map to permission sets.
3. **Ownership**: student and trainer data is additionally scoped inside the services: by the session's user id, or by an active `TrainerAssignment`. A record owned by someone else returns **404**, not 403, so ids cannot be probed.

Frontend guards (Next `middleware.ts` cookie check, `RequireSession`, hidden buttons) are UX only. The API enforces everything again.

## 1. Roles

| Role | Portal | Who |
|---|---|---|
| `ADMIN` | admin app (`admin/`) + legacy CMS (`frontend/app/admin`) | Operations: everything except the student and trainer portals |
| `FINANCE` | admin app (finance sections) | Payments, reconciliation, referral review and payouts; read-only students and admissions |
| `EDITOR` | legacy CMS only (planned) | Corporate website content. The legacy `/api/admin/*` routes are still **ADMIN-only** (unchanged behaviour) |
| `TRAINER` | trainer app (`trainer/`) | Only batches with an active assignment |
| `STUDENT` | intern app (`intern/`) | Only their own records |
| `HR` | admin app (People & HR sections) | Employees, leave approval, projects/tasks, HR requests, company announcements |
| `EMPLOYEE` | employee app (`employee/`) | Only their own attendance, leave, tasks, documents and requests; project data only as a member |

Earlier proposals `SUPER_ADMIN`, `COUNSELLOR` and `INTERN` are **not implemented** (students use the intern portal).

## 2. Permission sets

| Permission | ADMIN | FINANCE | EDITOR | TRAINER | STUDENT |
|---|:--:|:--:|:--:|:--:|:--:|
| `cms.manage` (write and edit drafts) | ✓ | | ✓ | | |
| `cms.publish` (publish, unpublish, archive, change or delete live content — editorial approval) | ✓ | | | | |
| `training.courses.manage` | ✓ | | | | |
| `training.batches.manage` | ✓ | | | | |
| `training.trainers.manage` (create staff accounts) | ✓ | | | | |
| `training.students.read` | ✓ | ✓ | | | |
| `training.students.manage` (edit, suspend, enrollment status) | ✓ | | | | |
| `training.admissions.read` | ✓ | ✓ | | | |
| `training.admissions.manage` (review, approve/reject, transfer, confirm) | ✓ | | | | |
| `training.learning.read` (admin batch report / attendance) | ✓ | | | | |
| `training.certificates.issue` (issue / revoke) | ✓ | | | | |
| `training.announcements.manage` (programme-wide) | ✓ | | | | |
| `training.support.manage` | ✓ | | | | |
| `payments.read` | ✓ | ✓ | | | |
| `payments.reconcile` (provider reconciliation, record refunds) | ✓ | ✓ | | | |
| `payments.record_offline` (cash/bank payments, audited) | ✓ | | | | |
| `referrals.read` | ✓ | ✓ | | | |
| `referrals.review` (approve/reject rewards, resolve fraud reviews) | ✓ | ✓ | | | |
| `referrals.payout` | ✓ | ✓ | | | |
| `referrals.settings` (reward amount and rules) | ✓ | | | | |
| `audit.read` | ✓ | | | | |
| `trainer.portal` | | | | ✓ | |
| `student.portal` | | | | | ✓ |

Portals are mutually exclusive: an ADMIN cannot call student or trainer APIs, and a trainer cannot call student APIs (all return 403).

## 2b. Employee / platform permissions (added 2026-10-15)

| Permission | ADMIN | FINANCE | HR | EMPLOYEE |
|---|:--:|:--:|:--:|:--:|
| `employees.read`, `employees.manage`, `leave.approve`, `projects.manage`, `hr.requests.manage`, `company.announcements.manage` | ✓ | | ✓ | |
| `users.manage` | ✓ | | | |
| `reports.read` | ✓ | ✓ | | |
| `employee.portal` | | | | ✓ |

Employee rules: every `/api/employee` query is scoped to the caller. Teammates are visible only as names and roles inside shared projects. HR cannot approve their own leave or answer their own HR request. Documents marked internal are never shown to the employee.

## 2b-ii. Intern exam permissions (added 2026-10-15)
| Permission | ADMIN | FINANCE | HR | EDITOR |
|---|---|---|---|---|
| `exams.manage` (question bank, exams, schedule, assignments, publish/archive, release results, retakes) | ✓ | | ✓ | |
| `exams.evaluate` (mark written answers, record interview results) | ✓ | | ✓ | |
| `exams.results.read` (attempts, reports, CSV export, student performance) | ✓ | | ✓ | |

Students reach only `/api/exams/student/*`, and only for published exams assigned to them (by student, batch, college or programme); everything else returns 404. Trainers have no exam access. All three permissions can be granted individually (to EDITOR/FINANCE/HR). See EXAM_MODULE.md.

## 2c. Individual grants (added 2026-10-15)

ADMIN can grant extra permissions to individual **EDITOR, FINANCE or HR** users (`POST /api/platform/users/:id/permissions`). Effective permissions = role permissions + valid grants, re-read on every request.

**Never grantable:** `admins.manage` (Super Admin; set only with `scripts/super-admin.ts` on an ADMIN account, see docs/USER_MANAGEMENT.md), `users.manage`, `referrals.settings`, `payments.record_offline`, `audit.read` and every `*.portal` permission.

Nobody can change their own permissions. Every grant and revocation is audited with a reason.

Roles themselves are fixed (Prisma enum): creating new roles or editing a role's base permission set is a code change, deliberately not a runtime setting.

## 3. Ownership rules (enforced in services)

| Actor | Rule | Where |
|---|---|---|
| Student | Every `/api/training/student/*` query is filtered by `req.user.sub`. No route accepts a student id from the client. | `student.service.ts`, `admission.service.ts`, `payment.service.ts` |
| Student | Learning content (assignments, materials, assessments, announcements) is visible only for batches with an ACTIVE/COMPLETED enrollment. | `student.service.ts` (`myBatchIds`) |
| Student | Only **published** results are visible. Another student's submissions are never returned. | `student.results`, `student.assignment` |
| Trainer | Every batch-scoped call runs `assertTrainerBatch` (active assignment). Removing the assignment revokes access immediately. | `learning.service.ts` |
| Trainer | Roster and reports expose name and email only: no phone, fee or payment data. | `trainerRoster`, `batchReport` |
| Referrer | Cannot review or pay out their own reward. | `referral.service.ts` |
| Admin | Cannot suspend themselves or another ADMIN through the training API. | `auth.service.setUserStatus` |

## 4. Privilege-escalation guards

- No endpoint lets a user change their own role or status. Staff accounts are created only by `training.trainers.manage` with roles TRAINER, FINANCE or EDITOR (never ADMIN). New staff choose a password via a single-use invite link.
- Suspension revokes every session immediately.
- Status changes on applications, rewards, enrollments and batches use **conditional updates from allowed states**, so races cannot double-apply transitions.
- Every privileged action writes an `AuditLog` row (actor, role, action, entity, before/after, reason, hashed IP).
