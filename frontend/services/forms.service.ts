import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { getMockStore } from '@/lib/mock/store';
import { mockId, simulateLatency } from '@/lib/mock/runtime';
import { validate } from '@/lib/validation/admin';
import {
  careerSchema,
  contactSchema,
  newsletterSchema,
  trainingSchema,
  type CareerInput,
  type ContactInput,
  type NewsletterInput,
  type TrainingInput,
} from '@/lib/validation/forms';

/**
 * Public form submissions (contact, training, careers, newsletter).
 * Each resolves to the confirmation message to show, or throws ServiceError
 * (with fieldErrors on validation failures, mirroring the API's 422 response).
 */

export interface SubmitResult {
  message: string;
  /** Enquiry reference (e.g. LEAD-2026-000123) when the API returns one. */
  reference?: string | null;
}

/** Extra, non-form data sent with an enquiry: which form, attribution, spam signals. */
export interface EnquiryMeta {
  source?: string;
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  website?: string;
  elapsedMs?: number;
}

const emptyToNull = (v: string | undefined) => (v === undefined || v === '' ? null : v);

function parseOrThrow<T>(schema: Parameters<typeof validate>[0], input: unknown): T {
  const result = validate(schema, input);
  if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
  return result.data as T;
}

// MOCK MODE: validates with the same schemas, then stores the submission in
// the in-memory mock store so it appears in the admin dashboard in this tab.
const mock = {
  async contact(input: ContactInput, _meta?: EnquiryMeta): Promise<SubmitResult> {
    const data = parseOrThrow<ContactInput>(contactSchema, input);
    await simulateLatency();
    const now = new Date().toISOString();
    getMockStore().contacts.unshift({
      id: mockId('contact'),
      name: data.name,
      email: data.email,
      phone: emptyToNull(data.phone),
      company: emptyToNull(data.company),
      service: emptyToNull(data.service),
      budget: emptyToNull(data.budget),
      message: data.message,
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
    });
    return { message: 'Your message has been sent. We will be in touch soon.' };
  },

  async training(input: TrainingInput): Promise<SubmitResult> {
    const data = parseOrThrow<TrainingInput>(trainingSchema, input);
    await simulateLatency();
    const now = new Date().toISOString();
    getMockStore().training.unshift({
      id: mockId('training'),
      fullName: data.fullName,
      phone: data.phone,
      whatsapp: emptyToNull(data.whatsapp),
      email: data.email,
      age: data.age ?? null,
      qualification: data.qualification,
      college: emptyToNull(data.college),
      city: emptyToNull(data.city),
      mode: data.mode,
      codingExperience: emptyToNull(data.codingExperience),
      whyJoin: emptyToNull(data.whyJoin),
      preferredContactTime: emptyToNull(data.preferredContactTime),
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
    });
    return { message: 'Your application has been received. Our team will contact you soon.' };
  },

  async career(input: CareerInput): Promise<SubmitResult> {
    const data = parseOrThrow<CareerInput>(careerSchema, input);
    await simulateLatency();
    const now = new Date().toISOString();
    getMockStore().careers.unshift({
      id: mockId('career'),
      name: data.name,
      email: data.email,
      phone: emptyToNull(data.phone),
      position: data.position,
      resumeUrl: emptyToNull(data.resumeUrl),
      portfolioUrl: emptyToNull(data.portfolioUrl),
      message: emptyToNull(data.message),
      status: 'NEW',
      createdAt: now,
      updatedAt: now,
    });
    return { message: 'Your application has been submitted. Thank you!' };
  },

  async newsletter(input: NewsletterInput): Promise<SubmitResult> {
    const { email } = parseOrThrow<NewsletterInput>(newsletterSchema, input);
    await simulateLatency();
    const normalized = email.toLowerCase();
    const list = getMockStore().newsletter;
    const existing = list.find((s) => s.email === normalized);
    if (existing?.status === 'SUBSCRIBED') return { message: 'You are already subscribed.' };
    if (existing) existing.status = 'SUBSCRIBED';
    else list.unshift({ id: mockId('subscriber'), email: normalized, status: 'SUBSCRIBED', createdAt: new Date().toISOString() });
    return { message: 'Subscribed successfully.' };
  },
};

/** The API returns the confirmation text in `message`, so read the envelope. */
async function postForMessage(path: string, body: unknown, fallback: string): Promise<SubmitResult> {
  const { message } = await http.postWithMessage<unknown>(path, body);
  return { message: message || fallback };
}

const api: typeof mock = {
  contact: async (input, meta?: EnquiryMeta) => {
    const { data, message } = await http.postWithMessage<{ reference?: string | null }>('/contact', { ...input, ...(meta ?? {}) });
    return { message: message || 'Your message has been sent. We will be in touch soon.', reference: data?.reference ?? null };
  },
  training: (input) =>
    postForMessage('/training/apply', input, 'Your application has been received. Our team will contact you soon.'),
  career: (input) => postForMessage('/careers/apply', input, 'Your application has been submitted. Thank you!'),
  newsletter: (input) => postForMessage('/newsletter', input, 'Subscribed successfully.'),
};

const impl = isMockMode ? mock : api;

export const formsService = {
  submitContact: (input: ContactInput, meta?: EnquiryMeta) => impl.contact(input, meta),
  submitTraining: (input: TrainingInput) => impl.training(input),
  submitCareer: (input: CareerInput) => impl.career(input),
  subscribeNewsletter: (input: NewsletterInput) => impl.newsletter(input),
};
