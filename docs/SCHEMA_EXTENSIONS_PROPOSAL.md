# GLOBALANTIC — PROPOSED PRISMA SCHEMA EXTENSIONS

**Document type:** Phase 1 proposal. **`prisma/schema.prisma` has NOT been modified.** This shows the *minimum* additions/changes required, for review before any migration is written.
**Date:** 2026-09-26

Principles: **reuse existing models**, add only what's needed, use proper relations and indexes, keep it maintainable. Migrations will be additive (no destructive changes to existing tables) and applied only after approval.

---

## A. Changes to EXISTING models (small, additive)

### `User` (extend — the single identity for all portals)
Add:
```
phone            String?   @unique     // login by email OR phone
status           UserStatus @default(ACTIVE)   // ACTIVE | SUSPENDED | INVITED
avatarUrl        String?
lastLoginAt      DateTime?
// relations (all optional; a user is one of intern/employee/trainer or pure staff)
internProfile    InternProfile?
employeeProfile  EmployeeProfile?
trainerProfile   TrainerProfile?
permissions      UserPermission[]
notifications    Notification[]
auditLogs        AuditLog[]        @relation("actor")
tickets          SupportTicket[]
```
Existing fields (`id, email, passwordHash, name, role, createdAt, updatedAt`) stay. `passwordHash` already exists.

### `Role` enum (extend)
```
enum Role {
  SUPER_ADMIN
  ADMIN
  HR
  FINANCE
  TRAINER
  COUNSELLOR
  EMPLOYEE
  INTERN
  EDITOR          // keep existing value for backward-compat (website CMS)
  // future: MANAGER, CONTENT_MANAGER, SUPPORT
}
```
> Migration note: existing rows are `ADMIN`/`EDITOR` — both preserved, so no data breakage.

### `TrainingApplication` (evolve into the admission entity)
The existing `TrainingApplication` is currently a lead form. Rather than add a duplicate `AdmissionApplication`, **reuse it** and add the admission lifecycle:
```
program        String?    // e.g. "full-stack-development"
status         TrainingStatus  // existing enum extended below
reviewedById   String?    // counsellor/admin who reviewed
approvedAt     DateTime?
userId         String?    // set when an intern account is created
enrollmentId   String?    // set on confirmation
payments       Payment[]
```
Extend `TrainingStatus` with admission states: add `APPROVED`, `PAYMENT_PENDING`, `CONFIRMED` (keep existing `NEW, CONTACTED, SHORTLISTED, JOINED, REJECTED, COMPLETED`).

### `SiteSetting`
Add fee/config toggles as needed later (e.g. `installmentsEnabled Boolean @default(false)`), plus training-domain fields. Minor; can defer.

**Untouched existing models:** `Service, Solution, Industry, PortfolioProject, BlogCategory, BlogPost, ContactLead, CareerApplication, NewsletterSubscriber, Technology, FAQ` — no changes.

---

## B. NEW models

### Identity / RBAC / profiles
```
enum UserStatus { ACTIVE SUSPENDED INVITED }

model Permission {                       // fine-grained staff grants (optional layer over role)
  id     String @id @default(uuid())
  key    String @unique                  // e.g. "payments.refund"
  label  String
  users  UserPermission[]
}
model UserPermission {
  userId       String
  permissionId String
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([userId, permissionId])
}

model InternProfile {
  id            String  @id @default(uuid())
  userId        String  @unique
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  enrollmentId  String? // convenience
  dob           DateTime?
  qualification String?
  college       String?
  city          String?
  address       String?
  whatsapp      String?
  emergencyName String?
  emergencyPhone String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model EmployeeProfile {
  id           String  @id @default(uuid())
  userId       String  @unique
  user         User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  employeeCode String  @unique
  department   String?
  designation  String?
  joiningDate  DateTime?
  address      String?
  emergencyName String?
  emergencyPhone String?
  managerId    String?  // self-relation to another EmployeeProfile/User (team)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model TrainerProfile {
  id        String @id @default(uuid())
  userId    String @unique
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  expertise String?
  bio       String?
  batches   Batch[]
}
```

### LMS: courses / batches / enrollment
```
model Course {
  id          String   @id @default(uuid())
  slug        String   @unique
  title       String
  description String
  durationMonths Int   @default(6)
  fee         Int      @default(0)     // in paise or rupees — decide unit (recommend paise for Razorpay)
  published   Boolean  @default(false)
  modules     CourseModule[]
  batches     Batch[]
  enrollments Enrollment[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([slug]) @@index([published])
}
model CourseModule {
  id        String  @id @default(uuid())
  courseId  String
  course    Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title     String
  order     Int     @default(0)
  lessons   Lesson[]
  @@index([courseId])
}
model Lesson {
  id         String @id @default(uuid())
  moduleId   String
  module     CourseModule @relation(fields: [moduleId], references: [id], onDelete: Cascade)
  title      String
  content    String?   // markdown/rich text
  resourceUrl String?
  order      Int    @default(0)
  progress   LessonProgress[]
  @@index([moduleId])
}
model Batch {
  id          String  @id @default(uuid())
  name        String
  courseId    String
  course      Course  @relation(fields: [courseId], references: [id])
  trainerId   String?
  trainer     TrainerProfile? @relation(fields: [trainerId], references: [id])
  mode        TrainingMode     // reuse existing enum OFFLINE | ONLINE
  startDate   DateTime?
  endDate     DateTime?
  location    String?
  meetingLink String?
  members     BatchMember[]
  schedule    ClassSchedule[]
  createdAt   DateTime @default(now())
  @@index([courseId])
}
model Enrollment {
  id          String  @id @default(uuid())
  userId      String
  courseId    String
  batchId     String?
  user        User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course      Course  @relation(fields: [courseId], references: [id])
  status      EnrollmentStatus @default(ACTIVE)
  completionPct Int    @default(0)
  createdAt   DateTime @default(now())
  @@unique([userId, courseId])
  @@index([userId]) @@index([courseId])
}
model BatchMember {
  batchId String
  userId  String
  batch   Batch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  user    User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([batchId, userId])
}
model LessonProgress {
  id        String @id @default(uuid())
  lessonId  String
  userId    String
  completed Boolean @default(false)
  completedAt DateTime?
  lesson    Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  @@unique([lessonId, userId])
}
enum EnrollmentStatus { ACTIVE COMPLETED DROPPED }
```

### Class schedule & attendance
```
model ClassSchedule {
  id        String  @id @default(uuid())
  batchId   String
  batch     Batch   @relation(fields: [batchId], references: [id], onDelete: Cascade)
  topic     String
  date      DateTime
  startTime String
  endTime   String?
  mode      TrainingMode
  meetingLink String?
  location  String?
  attendance Attendance[]
  @@index([batchId]) @@index([date])
}
model Attendance {                // covers interns (via schedule) AND employees (via check-in)
  id         String  @id @default(uuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduleId String?             // set for class attendance
  schedule   ClassSchedule? @relation(fields: [scheduleId], references: [id])
  date       DateTime
  status     AttendanceStatus @default(PRESENT)
  checkIn    DateTime?           // employee check-in/out
  checkOut   DateTime?
  workedMins Int?
  markedById String?             // trainer/HR/admin who marked
  @@index([userId]) @@index([date]) @@index([scheduleId])
}
enum AttendanceStatus { PRESENT ABSENT LATE LEAVE HALF_DAY }
```

### Assignments & tests
```
model Assignment {
  id         String @id @default(uuid())
  batchId    String?
  courseId   String?
  title      String
  description String?
  dueDate    DateTime?
  maxMarks   Int    @default(100)
  createdById String
  submissions AssignmentSubmission[]
  createdAt  DateTime @default(now())
  @@index([batchId])
}
model AssignmentSubmission {
  id           String @id @default(uuid())
  assignmentId String
  userId       String
  assignment   Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  fileUrl      String?
  text         String?
  status       SubmissionStatus @default(PENDING)
  marks        Int?
  feedback     String?
  submittedAt  DateTime?
  reviewedAt   DateTime?
  @@unique([assignmentId, userId])
}
enum SubmissionStatus { PENDING SUBMITTED LATE REVIEWED }

model Test {
  id        String @id @default(uuid())
  batchId   String?
  courseId  String?
  title     String
  durationMins Int  @default(30)
  maxAttempts Int  @default(1)
  published Boolean @default(false)
  questions Question[]
  attempts  TestAttempt[]
  @@index([batchId])
}
model Question {
  id        String @id @default(uuid())
  testId    String
  test      Test   @relation(fields: [testId], references: [id], onDelete: Cascade)
  text      String
  options   Json    // [{id,text}]
  correctOptionId String   // never sent to interns before submission
  marks     Int    @default(1)
  order     Int    @default(0)
}
model TestAttempt {
  id        String @id @default(uuid())
  testId    String
  userId    String
  test      Test   @relation(fields: [testId], references: [id], onDelete: Cascade)
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  answers   Json    // [{questionId, optionId}]
  score     Int?
  startedAt DateTime @default(now())
  submittedAt DateTime?
  @@index([testId]) @@index([userId])
}
// TestResult can be a view/derived; kept as computed from TestAttempt to avoid duplication.
```

### Fees, payments, invoices, certificates
```
model Fee {
  id          String @id @default(uuid())
  userId      String
  enrollmentId String?
  totalAmount Int
  paidAmount  Int    @default(0)
  currency    String @default("INR")
  dueDate     DateTime?
  user        User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  payments    Payment[]
  invoices    Invoice[]
  @@index([userId])
}
model PaymentOrder {
  id              String @id @default(uuid())
  razorpayOrderId String @unique
  userId          String
  amount          Int
  currency        String @default("INR")
  status          PaymentStatus @default(CREATED)
  applicationId   String?
  feeId           String?
  payment         Payment?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([userId])
}
model Payment {
  id                String @id @default(uuid())
  orderId           String @unique     // FK to PaymentOrder
  order             PaymentOrder @relation(fields: [orderId], references: [id])
  razorpayPaymentId String? @unique
  signature         String?
  amount            Int
  currency          String @default("INR")
  method            String?
  status            PaymentStatus @default(PENDING)
  userId            String
  feeId             String?
  fee               Fee?   @relation(fields: [feeId], references: [id])
  applicationId     String?
  application       TrainingApplication? @relation(fields: [applicationId], references: [id])
  user              User   @relation(fields: [userId], references: [id])
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([userId]) @@index([status])
}
enum PaymentStatus { CREATED PENDING SUCCESS FAILED REFUNDED }

model Invoice {
  id        String @id @default(uuid())
  number    String @unique
  feeId     String?
  fee       Fee?   @relation(fields: [feeId], references: [id])
  userId    String
  amount    Int
  pdfUrl    String?
  issuedAt  DateTime @default(now())
  @@index([userId])
}
model Certificate {
  id            String @id @default(uuid())
  number        String @unique          // public verification key
  userId        String
  user          User   @relation(fields: [userId], references: [id])
  type          CertificateType
  program       String
  durationMonths Int?
  issuedAt      DateTime @default(now())
  status        CertificateStatus @default(VALID)
  pdfUrl        String?
  @@index([userId]) @@index([number])
}
enum CertificateType { INTERNSHIP COURSE_COMPLETION EXPERIENCE }
enum CertificateStatus { VALID REVOKED }
```

### HR: leave, tasks, projects, documents, payslips, performance
```
model Leave {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      LeaveType
  startDate DateTime
  endDate   DateTime
  reason    String?
  status    LeaveStatus @default(PENDING)
  reviewedById String?
  createdAt DateTime @default(now())
  @@index([userId]) @@index([status])
}
enum LeaveType { CASUAL SICK EARNED UNPAID OTHER }
enum LeaveStatus { PENDING APPROVED REJECTED CHANGES_REQUESTED }
model LeaveBalance {
  id     String @id @default(uuid())
  userId String @unique
  casual Int @default(0)
  sick   Int @default(0)
  earned Int @default(0)
}
model Project {
  id        String @id @default(uuid())
  name      String
  client    String?
  description String?
  startDate DateTime?
  deadline  DateTime?
  status    ProjectStatus @default(ACTIVE)
  members   ProjectMember[]
  tasks     Task[]
}
enum ProjectStatus { ACTIVE ON_HOLD COMPLETED }
model ProjectMember {
  projectId String
  userId    String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
}
model Task {
  id        String @id @default(uuid())
  title     String
  description String?
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id])
  assigneeId String?
  priority  TaskPriority @default(MEDIUM)
  status    TaskStatus @default(TODO)
  dueDate   DateTime?
  createdAt DateTime @default(now())
  @@index([assigneeId]) @@index([status])
}
enum TaskPriority { LOW MEDIUM HIGH }
enum TaskStatus { TODO IN_PROGRESS REVIEW COMPLETED }
model EmployeeDocument {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String        // OFFER_LETTER, APPOINTMENT, EXPERIENCE, POLICY, OTHER
  title     String
  fileUrl   String        // Cloudinary; served via signed/authorized access, not public
  uploadedById String
  createdAt DateTime @default(now())
  @@index([userId])
}
model Payslip {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  month     String        // "2026-09"
  gross     Int
  deductions Int   @default(0)
  net       Int
  paidOn    DateTime?
  pdfUrl    String?
  @@unique([userId, month])
}
model PerformanceReview {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  period    String
  rating    Int?
  goals     String?
  feedback  String?
  reviewerId String
  createdAt DateTime @default(now())
  @@index([userId])
}
```

### Cross-cutting: announcements, notifications, support, audit, password reset
```
model Announcement {
  id        String @id @default(uuid())
  title     String
  body      String
  audience  AnnouncementAudience @default(ALL)   // ALL | INTERNS | EMPLOYEES | BATCH
  batchId   String?
  createdById String
  createdAt DateTime @default(now())
  @@index([audience])
}
enum AnnouncementAudience { ALL INTERNS EMPLOYEES BATCH }
model Notification {
  id      String @id @default(uuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  type    String
  title   String
  body    String?
  read    Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([userId]) @@index([read])
}
model SupportTicket {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  category  TicketCategory
  subject   String
  status    TicketStatus @default(OPEN)
  messages  SupportMessage[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId]) @@index([status])
}
enum TicketCategory { TECHNICAL COURSE PAYMENT ATTENDANCE CERTIFICATE OTHER }
enum TicketStatus { OPEN PENDING RESOLVED CLOSED }
model SupportMessage {
  id       String @id @default(uuid())
  ticketId String
  ticket   SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  senderId String
  body     String
  createdAt DateTime @default(now())
  @@index([ticketId])
}
model AuditLog {
  id        String @id @default(uuid())
  actorId   String?
  actor     User?  @relation("actor", fields: [actorId], references: [id])
  action    String       // "user.disable", "payment.refund", ...
  entity    String
  entityId  String?
  ip        String?
  meta      Json?         // never store passwords/tokens/secrets
  createdAt DateTime @default(now())
  @@index([actorId]) @@index([entity]) @@index([createdAt])
}
model PasswordResetToken {
  id        String @id @default(uuid())
  userId    String
  tokenHash String @unique      // store hash, not raw token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId])
}
```

---

## C. Decisions to confirm before migration

1. **Monetary unit:** store amounts in **paise (Int)** to match Razorpay, formatting to ₹ in the UI. (Recommended.) Alternative: `Decimal` rupees.
2. **Reuse `TrainingApplication`** as the admission entity (recommended) vs. a separate `AdmissionApplication` model.
3. **`TestResult`** kept as derived-from-`TestAttempt` (recommended, avoids duplication) vs. a materialized table.
4. **Permission layer:** ship coarse role-based RBAC first; the `Permission`/`UserPermission` tables are included but can be deferred if you prefer role-only to start.
5. **Attendance** unified for interns + employees in one table (recommended) vs. two tables.

## D. Migration safety

- All changes are **additive** (new tables, new nullable columns, extended enums). No column drops/renames on existing tables → existing website/admin/API keep working.
- Enum extensions preserve existing values (`ADMIN`, `EDITOR`, current statuses).
- One reversible migration per phase (not one giant migration); `prisma migrate dev` locally against Supabase, `migrate deploy` in prod.
- Nothing here is applied until you approve this proposal.
