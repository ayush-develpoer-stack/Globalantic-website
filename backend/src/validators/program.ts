import { z } from 'zod';
import { paginationQuery } from '../lib/pagination';
import { httpsUrl, uuid } from './training';

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
const text = (min: number, max: number, msg?: string) => z.string().trim().min(min, msg ?? `At least ${min} characters`).max(max);

export const slugBody = z.object({ slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/, 'Invalid program') });
export const enrollmentParam = z.object({ id: uuid });
export const lessonParam = z.object({ id: uuid, lessonId: uuid });
export const questionParam = z.object({ id: uuid, questionId: uuid });
export const attemptParam = z.object({ id: uuid });
export const enrollmentOrder = z.object({ enrollmentId: uuid });

export const submitAttemptSchema = z.object({
  /** { questionId: optionIndex } — scored on the server against keys the browser never sees */
  answers: z.record(uuid, z.number().int().min(0).max(5)).refine((a) => Object.keys(a).length <= 200, 'Too many answers'),
});

const programBase = {
  slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  title: text(3, 160),
  summary: text(10, 400),
  description: text(20, 10_000),
  /** Rupees in the admin form are converted to paise by the client; min Rs 1, max Rs 5,00,000 */
  feePaise: z.number().int().min(100, 'The fee must be at least Rs 1').max(50_000_000),
  passPercent: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(20),
  questionsPerAttempt: z.preprocess((v) => (v === '' ? null : v), z.number().int().min(1).max(200).nullable().optional()),
  timeLimitMinutes: z.number().int().min(5).max(300),
  certificateTitle: text(3, 80),
};
export const programCreateSchema = z.object({ ...programBase, status: z.enum(['DRAFT']).optional() });
export const programUpdateSchema = z
  .object({ ...programBase, status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const lessonSchema = z.object({
  title: text(3, 200),
  body: text(10, 50_000),
  videoUrl: z.preprocess((v) => (v === '' ? null : v), httpsUrl.nullable().optional()),
  minMinutes: z.number().int().min(0).max(240),
  required: z.boolean(),
  position: z.number().int().min(1).max(1000).optional(),
});

export const questionSchema = z.object({
  prompt: text(5, 2000),
  options: z.array(text(1, 500)).min(2, 'Add at least two options').max(6),
  correctIndex: z.number().int().min(0).max(5),
  explanation: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(2000).nullable().optional()),
});

export const archiveSchema = z.object({ archived: z.boolean() });

export const enrollmentListQuery = z.object({
  programId: opt(uuid),
  status: opt(z.enum(['PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUNDED'])),
  search: opt(z.string().trim().max(100)),
  ...paginationQuery,
});

export const reportQuery = z.object({
  programId: opt(uuid),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});
