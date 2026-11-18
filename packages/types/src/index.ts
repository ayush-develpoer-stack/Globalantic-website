/**
 * Shared domain + API types used across portals. Enum value lists mirror
 * prisma/schema.prisma exactly; backend/tests/contracts.test.ts fails if they drift.
 */

// ---------------------------------------------------------------------------
// Enums (as const arrays so UIs can render filters from them)
// ---------------------------------------------------------------------------

export const ROLES = ['ADMIN', 'EDITOR', 'FINANCE', 'TRAINER', 'STUDENT', 'HR', 'EMPLOYEE', 'SALES'] as const;
export type Role = (typeof ROLES)[number];

export const DELIVERY_MODES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const PROGRAM_TYPES = ['TRAINING', 'INTERNSHIP'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const BATCH_STATUSES = ['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const APPLICATION_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ENROLLED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['SUBMITTED', 'LATE', 'GRADED', 'RETURNED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const ASSESSMENT_TYPES = ['QUIZ', 'TEST', 'PROJECT', 'FINAL'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const MATERIAL_TYPES = ['LINK', 'DOCUMENT', 'VIDEO'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const PAYMENT_STATUSES = ['CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const REFERRAL_STAGES = ['REGISTERED', 'VERIFIED', 'ADMITTED', 'PAID', 'DISQUALIFIED'] as const;
export type ReferralStage = (typeof REFERRAL_STAGES)[number];

export const REWARD_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

export const FRAUD_REVIEW_STATUSES = ['OPEN', 'CLEARED', 'CONFIRMED'] as const;
export type FraudReviewStatus = (typeof FRAUD_REVIEW_STATUSES)[number];

export const PAYOUT_METHODS = ['UPI', 'BANK_TRANSFER', 'OTHER'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const OFFLINE_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export type Permission =
  | 'cms.manage'
  | 'cms.publish'
  | 'training.courses.manage'
  | 'training.batches.manage'
  | 'training.trainers.manage'
  | 'training.students.read'
  | 'training.students.manage'
  | 'training.admissions.read'
  | 'training.admissions.manage'
  | 'training.learning.read'
  | 'training.certificates.issue'
  | 'training.announcements.manage'
  | 'training.support.manage'
  | 'payments.read'
  | 'payments.reconcile'
  | 'payments.record_offline'
  | 'referrals.read'
  | 'referrals.review'
  | 'referrals.payout'
  | 'referrals.settings'
  | 'audit.read'
  | 'users.manage'
  /** Super Admin: manage ADMIN accounts (individual grant on an ADMIN only). */
  | 'admins.manage'
  | 'reports.read'
  | 'employees.read'
  | 'employees.manage'
  | 'leave.approve'
  | 'projects.manage'
  | 'hr.requests.manage'
  | 'company.announcements.manage'
  | 'exams.manage'
  | 'exams.evaluate'
  | 'exams.results.read'
  | 'leads.manage'
  | 'programs.manage'
  | 'programs.read'
  | 'documents.read'
  | 'documents.manage'
  | 'documents.finance'
  | 'documents.settings'
  | 'notifications.settings'
  | 'trainer.portal'
  | 'student.portal'
  | 'employee.portal';

// Employee portal / files
export const FILE_PURPOSES = ['ASSIGNMENT_SUBMISSION', 'ADMISSION_DOCUMENT', 'EMPLOYEE_DOCUMENT', 'COURSE_IMAGE', 'CMS_IMAGE', 'LEARNING_MATERIAL', 'GENERATED_DOCUMENT', 'SIGNED_DOCUMENT'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYEE_ATTENDANCE_STATUSES = ['PRESENT', 'WORK_FROM_HOME', 'HALF_DAY', 'ABSENT', 'ON_LEAVE'] as const;
export type EmployeeAttendanceStatus = (typeof EMPLOYEE_ATTENDANCE_STATUSES)[number];
export const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const EMPLOYEE_DOCUMENT_CATEGORIES = ['OFFER_LETTER', 'ID_PROOF', 'PAYSLIP', 'POLICY', 'OTHER'] as const;
export type EmployeeDocumentCategory = (typeof EMPLOYEE_DOCUMENT_CATEGORIES)[number];
export const HR_REQUEST_CATEGORIES = ['GENERAL', 'PAYROLL', 'LEAVE', 'IT', 'DOCUMENT', 'OTHER'] as const;
export type HrRequestCategory = (typeof HR_REQUEST_CATEGORIES)[number];

/** Metadata of a privately stored file (download via GET /api/files/:id). */
export interface StoredFileMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
  /** Present only for public images (COURSE_IMAGE / CMS_IMAGE). */
  url?: string;
}

/** Human-readable label for any enum value: "UNDER_REVIEW" -> "Under review". */
export function enumLabel(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  errors?: { field?: string; message: string }[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type Id = string;
/** ISO-8601 string as serialised by the API. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: Id;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  permissions?: Permission[];
  isStaff?: boolean;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface Fee {
  feePaise: number;
  discountPaise: number;
  payablePaise: number;
}

export interface CourseModule {
  id: Id;
  title: string;
  description: string | null;
  topics: string[];
  durationHours: number | null;
  order: number;
}

export interface CourseSummary {
  id: Id;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  programType: ProgramType;
  durationLabel: string;
  durationWeeks: number | null;
  mode: DeliveryMode;
  level: CourseLevel;
  skills: string[];
  eligibility: string;
  feePaise: number;
  discountPaise: number;
  discountLabel: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  status: CourseStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  minAttendancePercent: number;
  fee: Fee;
  openBatchCount: number;
}

export interface BatchSchedule {
  id: Id;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  topic: string | null;
  location: string | null;
}

export interface PublicBatch {
  id: Id;
  courseId: Id;
  name: string;
  startDate: IsoDate;
  endDate: IsoDate;
  registrationDeadline: IsoDate;
  mode: DeliveryMode;
  venue: string | null;
  capacity: number;
  availableSeats: number;
  status: BatchStatus;
  admissionOpen: boolean;
  admissionBlockedReason: string | null;
  fee: Fee;
  schedules: BatchSchedule[];
  trainers: { name: string; role: string }[];
  course?: { id: Id; slug: string; title: string; category: string; level: CourseLevel; eligibility?: string };
}

export interface CourseDetail extends CourseSummary {
  modules: CourseModule[];
  batches: PublicBatch[];
}

export interface CourseList extends Paged<CourseSummary> {
  categories: string[];
}

export interface ReferralProgram {
  enabled: boolean;
  rewardAmountPaise: number;
  currency: string;
  refundWindowDays: number;
  requireActiveEnrollment: boolean;
}

export interface CertificateVerification {
  valid: boolean;
  /** course = training batch certificate; program = certificate program */
  type?: 'course' | 'program';
  status?: 'ISSUED' | 'REVOKED';
  program?: string;
  certificateTitle?: string;
  certificateNumber?: string;
  studentName?: string;
  course?: string;
  batch?: string;
  period?: { start: IsoDate; end: IsoDate };
  issuedAt?: IsoDate;
}

// ---------------------------------------------------------------------------
// Student portal
// ---------------------------------------------------------------------------

export interface PaymentSummary {
  id: Id;
  status: PaymentStatus;
  amountPaise: number;
  currency: string;
  provider: 'RAZORPAY' | 'OFFLINE';
  verifiedAt: IsoDate | null;
  createdAt: IsoDate;
  failureReason: string | null;
}

export interface StudentApplication {
  id: Id;
  applicationNumber: string;
  status: ApplicationStatus;
  feePaise: number;
  discountPaise: number;
  payablePaise: number;
  qualification: string;
  institution: string | null;
  graduationYear: number | null;
  statement: string | null;
  rejectionReason: string | null;
  infoRequest?: string | null;
  infoRequestedAt?: IsoDate | null;
  infoResponse?: string | null;
  infoRespondedAt?: IsoDate | null;
  documentFile?: StoredFileMeta | { id: string; originalName: string; mimeType: string; sizeBytes: number } | null;
  reviewedAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  course: { id: Id; title: string; slug: string; durationLabel: string };
  batch: { id: Id; name: string; startDate: IsoDate; endDate: IsoDate; mode: DeliveryMode; status: BatchStatus };
  payments: PaymentSummary[];
  invoices: { id: Id; invoiceNumber: string; amountPaise: number; issuedAt: IsoDate; status: string }[];
  enrollment: { id: Id; status: EnrollmentStatus } | null;
}

export interface StudentDashboard {
  name: string;
  emailVerified: boolean;
  enrollments: {
    id: Id;
    status: EnrollmentStatus;
    course: { id: Id; title: string; slug: string };
    batch: { id: Id; name: string; startDate: IsoDate; endDate: IsoDate; mode: DeliveryMode; status: BatchStatus; schedules: BatchSchedule[] };
    attendancePercent: number | null;
  }[];
  openApplications: { id: Id; applicationNumber: string; status: ApplicationStatus; payablePaise: number; course: { title: string }; batch: { name: string } }[];
  pendingAssignments: { id: Id; title: string; dueAt: IsoDate; batchId: Id }[];
  unreadNotifications: number;
  announcements: Announcement[];
}

export interface Announcement {
  id: Id;
  title: string;
  body: string;
  createdAt: IsoDate;
  batch?: { name: string } | null;
}

export interface StudentProfile {
  id: Id;
  name: string;
  email: string;
  phone: string | null;
  emailVerifiedAt: IsoDate | null;
  createdAt: IsoDate;
  studentProfile: {
    city: string | null;
    dateOfBirth: IsoDate | null;
    qualification: string | null;
    institution: string | null;
    graduationYear: number | null;
    consentAt: IsoDate;
  } | null;
}

export interface Progress {
  enrollmentId: Id;
  attendancePercent: number | null;
  sessionsRecorded: number;
  assignmentsTotal: number;
  assignmentsSubmitted: number;
  assignmentsGraded: number;
  assignmentAveragePercent: number | null;
  results: { assessment: string; type: AssessmentType; marks: number; maxMarks: number; passed: boolean; published: boolean }[];
}

export interface TimetableSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  topic: string | null;
  location: string | null;
  mode: DeliveryMode;
  course: string;
  batch: string;
  batchId: Id;
  from: IsoDate;
  to: IsoDate;
}

export interface AttendanceRecord {
  sessionDate: IsoDate;
  status: AttendanceStatus;
  remarks: string | null;
}

export interface StudentAssignment {
  id: Id;
  title: string;
  description: string;
  resourceUrl: string | null;
  dueAt: IsoDate;
  maxMarks: number;
  status: AssignmentStatus;
  batch: { name: string; course: { title: string } };
  submission: {
    id: Id;
    status: SubmissionStatus;
    marks: number | null;
    submittedAt: IsoDate;
    content?: string | null;
    linkUrl?: string | null;
    file?: StoredFileMeta | null;
    feedback?: string | null;
    gradedAt?: IsoDate | null;
  } | null;
}

export interface LearningMaterial {
  id: Id;
  title: string;
  description: string | null;
  type: MaterialType;
  /** https link; null when the material is an uploaded file */
  url: string | null;
  file?: StoredFileMeta | null;
  createdAt: IsoDate;
  batch?: { name: string; course: { title: string } };
}

export interface StudentResult {
  id: Id;
  marks: number;
  remarks: string | null;
  passed: boolean;
  assessment: { title: string; type: AssessmentType; maxMarks: number; passMarks: number; heldOn: IsoDate | null; batch: { name: string; course: { title: string } } };
}

export interface Notification {
  id: Id;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface Invoice {
  id: Id;
  invoiceNumber: string;
  amountPaise: number;
  currency: string;
  status: 'PAID' | 'REFUNDED' | 'VOID';
  lineItems: { description: string; amountPaise: number }[];
  issuedAt: IsoDate;
  student?: { name: string; email: string };
  payment?: { provider: string; providerPaymentId: string | null; method: string | null; verifiedAt: IsoDate | null };
  /** Course / internship admission (null for certificate-program receipts) */
  application: { applicationNumber: string; course: { title: string }; batch: { name: string } } | null;
  /** Certificate program (null for course receipts) */
  programEnrollment?: { enrollmentNumber: string; program: { title: string } } | null;
}

export interface CertificateStatusRow {
  enrollmentId: Id;
  course: string;
  batch: { name: string; startDate: IsoDate; endDate: IsoDate };
  certificate: { id: Id; certificateNumber: string; verificationCode: string; issuedAt: IsoDate } | null;
  revoked: boolean;
  eligibility: { eligible: boolean; reasons: string[]; attendancePercent: number | null; minAttendancePercent: number } | null;
}

export interface ReferralDashboard {
  programEnabled: boolean;
  eligible: boolean;
  reason: string | null;
  rewardAmountPaise: number;
  currency: string;
  refundWindowDays?: number;
  code: string | null;
  link: string | null;
  stats: {
    clicks: number;
    registrations: number;
    verified: number;
    admitted: number;
    paid: number;
    rewards: Partial<Record<RewardStatus, { count: number; amountPaise: number }>>;
  } | null;
  referrals: { id: Id; name: string; stage: ReferralStage; registeredAt: IsoDate; reward: { status: RewardStatus; amountPaise: number; eligibleAt: IsoDate; rejectionReason: string | null } | null }[];
}

export interface PaymentOrder {
  paymentId: Id;
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface SupportRequest {
  id: Id;
  subject: string;
  message: string;
  status: SupportStatus;
  response: string | null;
  respondedAt: IsoDate | null;
  createdAt: IsoDate;
}

// ---------------------------------------------------------------------------
// Intern examinations (Marketing & Sales)
// ---------------------------------------------------------------------------
export const EXAM_TRACKS = ['MARKETING', 'SALES'] as const;
export type ExamTrack = (typeof EXAM_TRACKS)[number];
export type ExamKind = 'TEST' | 'PRACTICAL' | 'INTERVIEW';
export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export const EXAM_QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'DESCRIPTIVE'] as const;
export type ExamQuestionType = (typeof EXAM_QUESTION_TYPES)[number];
export type ExamAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
export type ExamStudentState = 'UPCOMING' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'NO_ATTEMPTS_LEFT' | 'INTERVIEW';

/** Attempt summary as a student sees it: scores only once the result is visible. */
export interface ExamAttemptSummary {
  id: Id;
  attemptNo: number;
  status: ExamAttemptStatus;
  autoSubmitted: boolean;
  startedAt: IsoDate;
  deadlineAt: IsoDate;
  submittedAt: IsoDate | null;
  resultVisible: boolean;
  score?: number | null;
  maxScore?: number;
  percent?: number;
  passed?: boolean | null;
}

export interface StudentExam {
  id: Id;
  title: string;
  description: string | null;
  track: ExamTrack;
  kind: ExamKind;
  durationMinutes: number;
  passPercent: number;
  /** % of a question's marks deducted for a wrong objective answer (0 = no negative marking) */
  negativeMarkPercent: number;
  opensAt: IsoDate | null;
  closesAt: IsoDate | null;
  eligibilityNote: string | null;
  questionCount: number;
  attemptsAllowed: number;
  attemptsUsed: number;
  state: ExamStudentState;
  canStart: boolean;
  reason: string | null;
  activeAttemptId: Id | null;
  attempts: ExamAttemptSummary[];
  instructions?: string;
  resultVisibility?: 'IMMEDIATE' | 'ON_RELEASE';
}

export interface ExamAttemptQuestion {
  id: Id;
  number: number;
  type: ExamQuestionType;
  topic: string;
  prompt: string;
  marks: number;
  options: { id: string; text: string }[];
}

export interface ExamAnswerValue {
  selectedOptionIds: string[];
  text: string | null;
  savedAt?: IsoDate;
}

export interface StudentExamAttempt {
  id: Id;
  attemptNo: number;
  status: ExamAttemptStatus;
  autoSubmitted: boolean;
  startedAt: IsoDate;
  deadlineAt: IsoDate;
  submittedAt: IsoDate | null;
  serverNow: IsoDate;
  exam: { id: Id; title: string; track: ExamTrack; kind: ExamKind; instructions: string; durationMinutes: number };
  questions: ExamAttemptQuestion[];
  answers: Record<string, ExamAnswerValue>;
}

export interface StudentExamResult extends ExamAttemptSummary {
  exam: { id: Id; title: string; track: ExamTrack; kind: ExamKind; passPercent: number };
  message: string | null;
  feedback: string | null;
  questions: {
    number: number;
    prompt: string;
    type: ExamQuestionType;
    topic: string;
    marks: number;
    awarded: number;
    comment: string | null;
    yourAnswer: string[] | string | null;
    correctAnswer?: string[] | null;
    explanation?: string | null;
  }[];
}

export interface ExamAnswerInput {
  questionId: Id;
  selectedOptionIds?: string[];
  text?: string | null;
}
