# GLOBALANTIC — ONLINE WORKFLOWS

**Document type:** Phase 1 design artifact. No code changed.
**Date:** 2026-09-26

End-to-end online workflows the platform automates. Every state change that matters is server-authoritative; emails/notifications are side-effects that never gate the primary transaction.

---

## 1. Training admission (application → intern account)

```
Applicant (training.globalantic.com)
  → selects program → Apply Now → submits application
      · API creates TrainingApplication (status NEW), emails "admission received" (Resend)
  → Counsellor/Admin (admin portal) reviews
      · Approve → status APPROVED → email "approved + payment link"
      · Reject  → status REJECTED → email
  → Applicant opens payment link → pays (see §2)
  → Webhook confirms payment
      · TrainingApplication → CONFIRMED
      · auto-create User(role INTERN, status INVITED) + InternProfile + Enrollment (+ Batch if assigned)
      · create Fee (paid/remaining), Invoice/receipt
      · email "account activation" (set-password link) + receipt
  → Applicant sets password → status ACTIVE → logs in at intern.globalantic.com
```
Idempotent: re-processing the same payment/webhook does not create duplicate accounts (guarded by `razorpayPaymentId` uniqueness + application status check).

---

## 2. Online payment (Razorpay, backend-verified)

```
Frontend "Pay Now"
  → POST /api/payments/order  → backend creates Razorpay order, PaymentOrder(status CREATED)
  → Razorpay Checkout opens (test keys in dev)
  → user pays
  → Razorpay → POST /api/payments/webhook
        1. verify signature: HMAC_SHA256(body, RAZORPAY_WEBHOOK_SECRET) == X-Razorpay-Signature
        2. idempotency: skip if event/paymentId already processed
        3. Payment SUCCESS/FAILED; PaymentOrder updated
        4. Fee.paidAmount += amount (or admission CONFIRMED)
        5. Invoice generated
        6. Resend: payment success + receipt
  → frontend polls/refreshes; UI reflects server truth only
```
**Rule:** the frontend Razorpay callback is *never* trusted to mark success — only the verified webhook mutates payment state. Statuses: `CREATED → PENDING → SUCCESS | FAILED | REFUNDED`. Refunds are finance/admin-only and update `Payment.status = REFUNDED`.

Test matrix (Phase 7): order creation, checkout, success, failure, webhook, signature verification, DB update, receipt, email, duplicate webhook, refund status.

---

## 3. Intern lifecycle (inside intern.globalantic.com)

```
Login → Dashboard (course, batch, attendance %, pending fees, next class, upcoming assignment/test, announcements, results, certificate status)
  → Course/LMS: modules → lessons → mark lesson complete → progress %
  → Class schedule: today/upcoming/past (meeting link or location)
  → Attendance: view own (present/absent/late/leave, monthly %, marked by trainer/admin)
  → Assignments: view → submit (file/text) → status → marks + feedback
  → Tests: start (correct answers never sent pre-submit) → submit → result
  → Fees: total/paid/remaining/history/next installment → Pay Now (→ §2) → receipt
  → Certificate: visible only after admin issues it (see §5); view/download
  → Support: create/view/reply/close ticket
```
All queries scoped to the logged-in intern; no access to other interns' data.

---

## 4. Employee lifecycle (inside employee.globalantic.com)

```
HR onboards employee (admin) → User(role EMPLOYEE) + EmployeeProfile + activation email
Employee login → Dashboard (attendance, today's/pending tasks, leave balance, announcements, salary info, performance)
  → Attendance: Check In / Check Out → worked hours, status (late/half-day/absent per HR rules)
  → Leave: apply (type, dates, reason) → Manager/HR approve/reject → balance updated → email
  → Tasks: view assigned → update status (TODO→IN_PROGRESS→REVIEW→COMPLETED)
  → Projects: view assigned projects + related tasks
  → Documents: view own authorized docs (offer/appointment/experience/policy) — private, authorized access only
  → Payslips: view/download own payslip PDF (never sees others' salary)
  → Performance: view own reviews/goals/feedback
```

---

## 5. Certificate issuance & verification

```
Admin verifies completion requirements met (progress + attendance + assessments)
  → Admin issues Certificate (unique number) — users cannot self-issue
  → Resend "certificate issued"; intern downloads from portal
Public verification: GET /verify/[number]  (or verify.globalantic.com/[number])
  → returns ONLY: number, name, program, duration, issue date, VALID/REVOKED
```

---

## 6. Admin/management (admin.globalantic.com)

Single dashboard to run everything: users & roles, admissions, courses/modules/lessons, batches, class schedule, attendance, assignments/tests/results, fees/payments/invoices/refunds, certificates, HR (leave/documents/payslips/performance), projects/tasks, support tickets, announcements, reports/export (CSV/PDF), website CMS (existing), settings, and audit log. All actions role-gated (see `ROLE_PERMISSION_MATRIX.md`) and privileged actions written to `AuditLog`.

---

## 7. Automation summary (no background infra unless required)

Most automation is **synchronous, event-driven off the request/webhook** (no job queue needed):
- Payment success → update fee → receipt → email.
- Application approved → enrollment + account + email.
- Course completed → compute completion → mark certificate-eligible.
- Leave approved → update balance → notify.

**Scheduled** items (fee-due reminders, class reminders, assignment-deadline reminders) need a timer. Keep it simple: a single lightweight cron (e.g. a Render/Railway scheduled job or one `node-cron` process) hitting internal endpoints — **not** a queue/worker cluster. Build these only when the core flows work.

---

## 8. Notifications & email

In-app `Notification` + Resend email for: payment success/failed, fee due, application approved, class reminder, assignment deadline, test announcement, attendance issue, leave approval, task assignment, certificate issued, password reset, account activation. WhatsApp/SMS are future-ready, not built now. Resend key stays backend-only; user input is escaped in templates.
