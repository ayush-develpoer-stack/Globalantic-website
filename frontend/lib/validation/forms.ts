import { z } from 'zod';

/**
 * Public form schemas. Field names, limits and enums mirror
 * backend/src/validators/index.ts so the client rejects exactly what the
 * server would; messages are written for end users. The same schemas run in
 * mock mode before anything is "saved", and are intended to move into
 * packages/validation once the backend consumes shared schemas.
 */

/** Optional text that may be submitted empty. */
export const optionalText = (max: number) => z.string().trim().max(max, `Please keep this under ${max} characters`).optional().or(z.literal(''));

const email = z.string().trim().min(1, 'Please enter your email').email('Please enter a valid email address');

const optionalUrl = z
  .string()
  .trim()
  .url('Please enter a full URL starting with https://')
  .optional()
  .or(z.literal(''));

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120, 'Please keep your name under 120 characters'),
  email,
  phone: optionalText(30),
  company: optionalText(160),
  service: optionalText(120),
  budget: optionalText(80),
  message: z
    .string()
    .trim()
    .min(10, 'Please tell us a little more (at least 10 characters)')
    .max(4000, 'Please keep your message under 4000 characters'),
  timeline: optionalText(80),
  contactPreference: z.enum(['email', 'phone', 'whatsapp']).optional().or(z.literal('')),
  marketingConsent: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const trainingSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  phone: z.string().trim().min(6, 'Please enter a valid phone number').max(30),
  whatsapp: optionalText(30),
  email,
  // Empty input means "not provided"; otherwise it must be a whole number 15–80.
  age: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ invalid_type_error: 'Please enter a valid age' })
      .int('Please enter a whole number')
      .min(15, 'Applicants must be at least 15')
      .max(80, 'Please enter a valid age')
      .optional(),
  ),
  qualification: z.string().trim().min(2, 'Please select your qualification').max(120),
  college: optionalText(160),
  city: optionalText(120),
  mode: z.enum(['OFFLINE', 'ONLINE'], { errorMap: () => ({ message: 'Please choose a mode' }) }),
  codingExperience: optionalText(120),
  whyJoin: optionalText(2000),
  preferredContactTime: optionalText(120),
});
export type TrainingInput = z.infer<typeof trainingSchema>;

export const careerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email,
  phone: optionalText(30),
  position: z.string().trim().min(2, 'Please enter the position you are applying for').max(160),
  resumeUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  message: optionalText(2000),
});
export type CareerInput = z.infer<typeof careerSchema>;

export const newsletterSchema = z.object({ email });
export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Please enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;
