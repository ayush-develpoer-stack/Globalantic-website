import { z } from 'zod';
import { paginationQuery, sortParam } from '../lib/pagination';
import { env } from '../config/env';

/**
 * Request schemas for the training platform. Unknown keys are stripped by
 * Zod's default behaviour, so a client can never smuggle fields such as
 * `status`, `amountPaise` or `studentId` into a write.
 */

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
/** Nullable column: '' or null clears it, undefined leaves it unchanged. */
const clearable = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), s]).optional());

export const uuid = z.string().uuid('Invalid id');
export const idParam = z.object({ id: uuid });
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
/** Only https links are accepted for materials, submissions and documents (no javascript:, data:, http:). */
export const httpsUrl = z.string().trim().max(1000).url('Enter a valid URL').refine((u) => u.startsWith('https://'), 'Only https:// links are allowed');
/**
 * Image fields: any https URL, or an image uploaded to this API's public image
 * store (which may be http://localhost in development).
 */
export const imageUrl = z
  .string()
  .trim()
  .max(1000)
  .url('Enter a valid URL')
  .refine(
    (u) => u.startsWith('https://') || new RegExp('^' + env.publicApiUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/files/public/[0-9a-f-]{36}$').test(u),
    'Use an https:// link or upload an image',
  );
const text = (max: number) => z.string().trim().max(max);
const reqText = (min: number, max: number, msg = 'Required') => z.string().trim().min(min, msg).max(max);
const paise = z.coerce.number().int().min(0).max(100_000_000);

export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const mode = z.enum(['ONLINE', 'OFFLINE', 'HYBRID']);
const level = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const programType = z.enum(['TRAINING', 'INTERNSHIP']);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  fullName: reqText(2, 120, 'Full name is required'),
  email: z.string().trim().email('A valid email is required').max(254),
  phone: reqText(6, 20, 'A valid phone number is required'),
  password,
  city: opt(text(120)),
  dateOfBirth: opt(isoDate.refine((d) => {
    const age = (Date.now() - new Date(d).getTime()) / (365.25 * 86_400_000);
    return age >= 14 && age <= 90;
  }, 'Enter a valid date of birth')),
  referralCode: opt(z.string().trim().max(20)),
  consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms and privacy policy' }) }),
});

export const tokenSchema = z.object({ token: z.string().trim().min(10).max(200) });
export const forgotSchema = z.object({ email: z.string().trim().email('A valid email is required') });
export const resetSchema = z.object({ token: z.string().trim().min(10).max(200), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------

export const publicCourseQuery = z.object({
  search: opt(text(100)),
  category: opt(text(80)),
  mode: opt(mode),
  level: opt(level),
  programType: opt(programType),
  ...paginationQuery,
});

export const publicBatchQuery = z.object({
  courseId: opt(uuid),
  mode: opt(mode),
  status: opt(z.enum(['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS'])),
  ...paginationQuery,
});

export const slugParam = z.object({ slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/, 'Invalid slug') });
export const codeParam = z.object({ code: z.string().trim().min(4).max(20).regex(/^[A-Za-z0-9]+$/) });

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export const applySchema = z.object({
  batchId: uuid,
  qualification: reqText(2, 120, 'Qualification is required'),
  institution: opt(text(160)),
  graduationYear: opt(z.coerce.number().int().min(1970).max(2040)),
  statement: opt(text(2000)),
  referralCode: opt(z.string().trim().max(20)),
  /** Optional supporting document uploaded via POST /api/files?purpose=ADMISSION_DOCUMENT */
  documentFileId: opt(uuid),
});

export const profileUpdateSchema = z.object({
  name: opt(reqText(2, 120)),
  city: clearable(text(120)),
  dateOfBirth: clearable(isoDate),
  qualification: clearable(text(120)),
  institution: clearable(text(160)),
  graduationYear: clearable(z.coerce.number().int().min(1970).max(2040)),
});

export const submissionSchema = z.object({
  content: opt(text(10_000)),
  linkUrl: opt(httpsUrl),
  /** A file uploaded via POST /api/files?purpose=ASSIGNMENT_SUBMISSION */
  fileId: opt(uuid),
});

export const supportSchema = z.object({ subject: reqText(3, 160), message: reqText(10, 4000) });

export const notificationsReadSchema = z.object({ ids: z.union([z.literal('all'), z.array(uuid).min(1).max(200)]) });
export const notificationsQuery = z.object({ unread: opt(z.enum(['true', 'false'])), ...paginationQuery });

export const orderSchema = z.object({ applicationId: uuid });
export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(5).max(64).regex(/^[A-Za-z0-9_]+$/),
  paymentId: z.string().trim().min(5).max(64).regex(/^[A-Za-z0-9_]+$/),
  signature: z.string().trim().regex(/^[a-f0-9]{64}$/, 'Invalid signature'),
});
export const paymentFailureSchema = z.object({
  orderId: z.string().trim().min(5).max(64).regex(/^[A-Za-z0-9_]+$/),
  reason: reqText(1, 300),
});

export const referralClickSchema = z.object({ code: z.string().trim().min(4).max(20) });

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

export const batchIdParam = z.object({ batchId: uuid });
export const attendanceQuery = z.object({ date: isoDate });
export const attendanceSchema = z.object({
  date: isoDate,
  records: z
    .array(z.object({ enrollmentId: uuid, status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']), remarks: opt(text(300)) }))
    .min(1)
    .max(500),
});

const assignmentBase = {
  title: reqText(3, 200),
  description: reqText(3, 10_000),
  resourceUrl: opt(httpsUrl),
  dueAt: z.coerce.date(),
  maxMarks: z.coerce.number().int().min(1).max(1000),
  status: opt(z.enum(['DRAFT', 'PUBLISHED', 'CLOSED'])),
};
export const assignmentSchema = z.object(assignmentBase);
export const assignmentUpdateSchema = z.object(assignmentBase).partial();

export const gradeSchema = z.object({
  marks: z.coerce.number().int().min(0).max(1000),
  feedback: opt(text(4000)),
  returnForResubmission: z.boolean().optional(),
});

export const materialSchema = z.object({
  title: reqText(3, 200),
  description: opt(text(2000)),
  type: z.enum(['LINK', 'DOCUMENT', 'VIDEO']).default('LINK'),
  /** https link, or ... */
  url: opt(httpsUrl),
  /** ... a file uploaded via POST /api/files?purpose=LEARNING_MATERIAL (exactly one of the two). */
  fileId: opt(uuid),
}).superRefine((v, ctx) => {
  if (!v.url && !v.fileId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Add a link or upload a file' });
  if (v.url && v.fileId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fileId'], message: 'Use either a link or a file, not both' });
});

export const announcementSchema = z.object({ title: reqText(3, 200), body: reqText(3, 5000) });
export const adminAnnouncementSchema = announcementSchema.extend({ batchId: opt(uuid) });

export const assessmentSchema = z.object({
  title: reqText(3, 200),
  type: z.enum(['QUIZ', 'TEST', 'PROJECT', 'FINAL']).default('TEST'),
  maxMarks: z.coerce.number().int().min(1).max(1000),
  passMarks: z.coerce.number().int().min(0).max(1000),
  heldOn: opt(z.coerce.date()),
});

export const resultsSchema = z.object({
  rows: z.array(z.object({ enrollmentId: uuid, marks: z.coerce.number().int().min(0).max(1000), remarks: opt(text(500)) })).min(1).max(500),
});

export const feedbackSchema = z.object({ content: reqText(3, 4000), rating: opt(z.coerce.number().int().min(1).max(5)) });

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const reasonSchema = z.object({ reason: reqText(3, 500, 'A reason is required') });

const courseBase = {
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  title: reqText(3, 200),
  shortDescription: reqText(10, 500),
  description: reqText(10, 20_000),
  category: reqText(2, 80),
  programType: programType.default('TRAINING'),
  durationLabel: reqText(2, 80),
  durationWeeks: clearable(z.coerce.number().int().min(1).max(104)),
  mode,
  level: level.default('BEGINNER'),
  skills: z.array(reqText(1, 80)).max(50).default([]),
  eligibility: reqText(3, 2000),
  feePaise: paise,
  discountPaise: paise.default(0),
  discountLabel: clearable(text(120)),
  thumbnailUrl: clearable(imageUrl),
  bannerUrl: clearable(imageUrl),
  seoTitle: clearable(text(200)),
  seoDescription: clearable(text(400)),
  minAttendancePercent: z.coerce.number().int().min(0).max(100).default(75),
  order: z.coerce.number().int().min(0).max(10_000).default(0),
};
export const courseSchema = z.object(courseBase);
export const courseUpdateSchema = z.object(courseBase).partial();
export const courseStatusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) });
export const modulesSchema = z.object({
  modules: z
    .array(z.object({ title: reqText(2, 200), description: opt(text(4000)), topics: z.array(reqText(1, 200)).max(100).default([]), durationHours: opt(z.coerce.number().int().min(1).max(500)) }))
    .max(100),
});
export const adminCourseQuery = z.object({
  sort: sortParam(['title', 'createdAt', 'feePaise', 'status']), search: opt(text(100)), status: opt(z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])), ...paginationQuery });

const batchBase = {
  courseId: uuid,
  name: reqText(2, 120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  registrationDeadline: z.coerce.date(),
  mode,
  venue: clearable(text(300)),
  capacity: z.coerce.number().int().min(1).max(10_000),
  /** null clears the override (batch falls back to the course fee). */
  feePaise: clearable(paise),
};
export const batchSchema = z.object(batchBase);
export const batchUpdateSchema = z.object(batchBase).omit({ courseId: true }).partial();
export const batchStatusSchema = z.object({
  status: z.enum(['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  reason: opt(text(500)),
});
export const schedulesSchema = z.object({
  schedules: z.array(z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), startTime: time, endTime: time, topic: opt(text(200)), location: opt(text(200)) })).max(50),
});
export const assignTrainerSchema = z.object({ trainerId: uuid, role: z.enum(['LEAD', 'ASSISTANT']).default('LEAD') });
export const trainerParam = z.object({ id: uuid, trainerId: uuid });
export const adminBatchQuery = z.object({
  sort: sortParam(['startDate', 'name', 'capacity', 'status']),
  courseId: opt(uuid),
  status: opt(z.enum(['UPCOMING', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])),
  search: opt(text(100)),
  ...paginationQuery,
});

export const staffSchema = z.object({
  name: reqText(2, 120),
  email: z.string().trim().email(),
  phone: opt(text(20)),
  role: z.enum(['TRAINER', 'FINANCE', 'EDITOR', 'HR']),
});

export const adminApplicationQuery = z.object({
  sort: sortParam(['createdAt', 'status', 'applicationNumber', 'payablePaise']),
  status: opt(z.enum(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ENROLLED'])),
  courseId: opt(uuid),
  batchId: opt(uuid),
  search: opt(text(100)),
  pendingPayment: opt(z.enum(['true', 'false'])),
  ...paginationQuery,
});
export const reviewSchema = z.object({ action: z.enum(['UNDER_REVIEW', 'APPROVE', 'REJECT', 'REQUEST_INFO']), reason: opt(text(1000)) });
export const infoResponseSchema = z.object({ message: reqText(3, 4000), documentFileId: opt(uuid) });
export const referralCodeQuery = z.object({ search: opt(text(100)), ...paginationQuery });
export const transferSchema = z.object({ batchId: uuid, reason: reqText(3, 500) });

export const adminStudentQuery = z.object({
  sort: sortParam(['createdAt', 'name', 'email', 'lastLoginAt']), search: opt(text(100)), status: opt(z.enum(['ACTIVE', 'SUSPENDED'])), ...paginationQuery });
export const adminStudentUpdateSchema = z.object({
  name: opt(reqText(2, 120)),
  city: clearable(text(120)),
  qualification: clearable(text(120)),
  institution: clearable(text(160)),
  graduationYear: clearable(z.coerce.number().int().min(1970).max(2040)),
  dateOfBirth: clearable(isoDate),
  reason: reqText(3, 500, 'A reason is required'),
});
export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: reqText(3, 500, 'A reason is required') });
export const enrollmentStatusSchema = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED']), reason: reqText(3, 500, 'A reason is required') });

export const adminPaymentQuery = z.object({
  sort: sortParam(['createdAt', 'amountPaise', 'status', 'verifiedAt']),
  status: opt(z.enum(['CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'])),
  search: opt(text(100)),
  ...paginationQuery,
});
export const offlinePaymentSchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE']),
  reference: reqText(3, 120, 'A payment reference is required'),
  reason: reqText(3, 500, 'A reason is required'),
});

export const supportQuery = z.object({ status: opt(z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])), ...paginationQuery });
export const supportResponseSchema = z.object({ status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED']), response: opt(text(4000)) });

export const auditQuery = z.object({ entityType: opt(text(60)), entityId: opt(text(100)), actorId: opt(uuid), ...paginationQuery });
export const pageQuery = z.object({ ...paginationQuery });

// Referral administration
export const referralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  rewardAmountPaise: z.coerce.number().int().min(0).max(10_000_000).optional(),
  requireActiveEnrollment: z.boolean().optional(),
  minPaidAmountPaise: paise.optional(),
  refundWindowDays: z.coerce.number().int().min(0).max(365).optional(),
  attributionWindowDays: z.coerce.number().int().min(1).max(365).optional(),
  maxRewardsPerReferrerPerMonth: z.union([z.coerce.number().int().min(1).max(1000), z.null()]).optional(),
  reason: reqText(3, 500, 'A reason is required'),
});
export const rewardQuery = z.object({ status: opt(z.enum(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'])), ...paginationQuery });
export const registrationQuery = z.object({ stage: opt(z.enum(['REGISTERED', 'VERIFIED', 'ADMITTED', 'PAID', 'DISQUALIFIED'])), ...paginationQuery });
export const rewardReviewSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT', 'UNDER_REVIEW']), reason: opt(text(500)) });
export const payoutSchema = z.object({ method: z.enum(['UPI', 'BANK_TRANSFER', 'OTHER']), reference: reqText(3, 120), notes: opt(text(500)) });
export const fraudQuery = z.object({ status: opt(z.enum(['OPEN', 'CLEARED', 'CONFIRMED'])), ...paginationQuery });
export const fraudResolveSchema = z.object({ outcome: z.enum(['CLEARED', 'CONFIRMED']), notes: reqText(3, 1000) });
export const codeStatusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']), reason: reqText(3, 500) });
