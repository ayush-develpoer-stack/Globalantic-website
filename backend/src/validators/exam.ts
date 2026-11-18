import { z } from 'zod';
import { paginationQuery } from '../lib/pagination';
import { uuid } from './training';

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
const clearable = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), s]).optional());
const reqText = (min: number, max: number, msg = 'Required') => z.string().trim().min(min, msg).max(max);
/** ISO date-time with zone (the browser converts its local input with toISOString()). */
const dateTime = z.string().datetime({ offset: true, message: 'Enter a valid date and time' }).transform((v) => new Date(v));

export const track = z.enum(['MARKETING', 'SALES']);
/** Awarded marks: not negative, at most 2 decimals (e.g. 1.5). */
const marksValue = z.coerce.number().min(0, 'Marks cannot be negative').refine((n) => Math.round(n * 100) === n * 100, 'Use at most 2 decimals');
const questionType = z.enum(['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'DESCRIPTIVE']);

// ---- Question bank ------------------------------------------------------------
export const questionSchema = z
  .object({
    track,
    topic: reqText(2, 80, 'Enter a topic'),
    type: questionType,
    prompt: reqText(5, 4000, 'Enter the question'),
    options: z
      .array(z.object({ id: opt(z.string().trim().max(20)), text: reqText(1, 500, 'Option text is required'), correct: z.boolean().default(false) }))
      .max(8, 'At most 8 options')
      .default([]),
    marks: z.coerce.number().int().min(1, 'At least 1 mark').max(100),
    guidance: clearable(z.string().trim().max(4000)),
    explanation: clearable(z.string().trim().max(4000)),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.correct).length;
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message });
    if (q.type === 'DESCRIPTIVE') {
      if (q.options.length) issue('Written-answer questions have no options');
      return;
    }
    if (q.type === 'TRUE_FALSE' && (q.options.length !== 2 || correct !== 1)) issue('True/false needs the two options with one marked correct');
    if (q.type === 'SINGLE_CHOICE' && (q.options.length < 2 || correct !== 1)) issue('Add at least 2 options and mark exactly one correct');
    if (q.type === 'MULTI_CHOICE' && (q.options.length < 2 || correct < 1)) issue('Add at least 2 options and mark at least one correct');
    if (new Set(q.options.map((o) => o.text.toLowerCase())).size !== q.options.length) issue('Options must be different');
  });

export const questionListQuery = z.object({
  track: opt(track),
  topic: opt(z.string().trim().max(80)),
  type: opt(questionType),
  search: opt(z.string().trim().max(100)),
  archived: opt(z.enum(['true', 'false']).transform((v) => v === 'true')),
  ...paginationQuery,
});
export const archiveSchema = z.object({ archived: z.boolean() });

// ---- Exams ----------------------------------------------------------------------
export const examSchema = z
  .object({
    title: reqText(3, 200),
    description: clearable(z.string().trim().max(2000)),
    instructions: reqText(10, 8000, 'Write the instructions students will see'),
    eligibilityNote: clearable(z.string().trim().max(2000)),
    track,
    kind: z.enum(['TEST', 'PRACTICAL', 'INTERVIEW']).default('TEST'),
    durationMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(300, 'At most 300 minutes'),
    passPercent: z.coerce.number().int().min(0).max(100),
    maxAttempts: z.coerce.number().int().min(1).max(10),
    questionsPerAttempt: clearable(z.coerce.number().int().min(1).max(500)),
    shuffleQuestions: z.boolean().default(true),
    shuffleOptions: z.boolean().default(true),
    resultVisibility: z.enum(['IMMEDIATE', 'ON_RELEASE']).default('ON_RELEASE'),
    revealAnswers: z.boolean().default(false),
    negativeMarkPercent: z.coerce.number().int().min(0).max(100).default(0),
    interviewMaxMarks: clearable(z.coerce.number().int().min(1).max(1000)),
    opensAt: clearable(dateTime),
    closesAt: clearable(dateTime),
  })
  .superRefine((e, ctx) => {
    if (e.opensAt && e.closesAt && e.closesAt <= e.opensAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['closesAt'], message: 'Must be after the opening time' });
    if (e.kind === 'INTERVIEW' && !e.interviewMaxMarks) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['interviewMaxMarks'], message: 'Set the maximum marks for the interview' });
  });

export const examListQuery = z.object({
  status: opt(z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])),
  track: opt(track),
  search: opt(z.string().trim().max(100)),
  ...paginationQuery,
});
export const examQuestionsSchema = z.object({ questionIds: z.array(uuid).max(500) });
export const assignmentSchema = z.object({
  target: z.enum(['STUDENT', 'BATCH', 'INSTITUTION', 'PROGRAM']),
  studentId: opt(uuid),
  batchId: opt(uuid),
  courseId: opt(uuid),
  institution: opt(z.string().trim().max(200)),
});
export const assignmentParam = z.object({ id: uuid, assignmentId: uuid });
export const targetsQuery = z.object({ search: opt(z.string().trim().max(100)) });
export const attemptListQuery = z.object({
  status: opt(z.enum(['IN_PROGRESS', 'SUBMITTED', 'EVALUATED'])),
  search: opt(z.string().trim().max(100)),
  ...paginationQuery,
});
export const evaluateSchema = z.object({
  marks: z
    .array(z.object({ questionId: uuid, marks: marksValue, comment: clearable(z.string().trim().max(2000)) }))
    .max(500),
  feedback: clearable(z.string().trim().max(4000)),
});
export const retakeSchema = z.object({ studentId: uuid, reason: reqText(3, 500, 'A reason is required') });
export const interviewSchema = z.object({ studentId: uuid, score: marksValue, feedback: clearable(z.string().trim().max(4000)) });
export const studentParam = z.object({ studentId: uuid });

// ---- Student --------------------------------------------------------------------
const answer = z.object({
  questionId: uuid,
  selectedOptionIds: z.array(z.string().trim().max(20)).max(8).optional(),
  text: z.string().max(10_000, 'Keep your answer under 10,000 characters').nullable().optional(),
});
export const saveAnswersSchema = z.object({
  answers: z.array(answer).max(200),
  /** Times the exam tab lost focus since the last save (informational). */
  focusLost: z.coerce.number().int().min(0).max(1000).optional(),
});
export const submitSchema = z.object({ answers: z.array(answer).max(200).optional() });
