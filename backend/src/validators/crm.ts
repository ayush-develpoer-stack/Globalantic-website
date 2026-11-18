import { z } from 'zod';
import { paginationQuery, sortParam } from '../lib/pagination';
import { uuid } from './training';

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
const clearable = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), s]).optional());
const dateTime = z.string().datetime({ offset: true, message: 'Enter a valid date and time' }).transform((v) => new Date(v));

/** Pipeline stages used by the CRM (legacy values stay readable but are not offered). */
export const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'] as const;
const stage = z.enum(STAGES);
const anyStatus = z.enum([...STAGES, 'IN_PROGRESS', 'CONVERTED', 'CLOSED']);
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const leadListQuery = z.object({
  status: opt(anyStatus),
  priority: opt(priority),
  assignedToId: opt(z.union([uuid, z.literal('none'), z.literal('me')])),
  service: opt(z.string().trim().max(120)),
  source: opt(z.string().trim().max(80)),
  utmCampaign: opt(z.string().trim().max(150)),
  search: opt(z.string().trim().max(100)),
  followUp: opt(z.enum(['overdue', 'today', 'upcoming'])),
  includeDuplicates: opt(z.enum(['true', 'false']).transform((v) => v === 'true')),
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sort: sortParam(['createdAt', 'followUpAt', 'name', 'status', 'priority', 'lastActivityAt'] as const),
  ...paginationQuery,
});

export const leadUpdateSchema = z
  .object({
    status: opt(stage),
    priority: opt(priority),
    assignedToId: clearable(uuid),
    followUpAt: clearable(dateTime),
    service: clearable(z.string().trim().max(120)),
    budget: clearable(z.string().trim().max(80)),
    timeline: clearable(z.string().trim().max(80)),
    company: clearable(z.string().trim().max(160)),
    phone: clearable(z.string().trim().max(30)),
    /** Optional note recorded with a stage change (e.g. why a lead was lost). */
    note: opt(z.string().trim().max(2000)),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'note' && (v as Record<string, unknown>)[k] !== undefined), { message: 'Nothing to update' });

export const noteSchema = z.object({
  body: z.string().trim().min(2, 'Write a note').max(4000),
  /** CONSULTATION feeds the funnel report; CALL/EMAIL/WHATSAPP log outreach. */
  type: z.enum(['NOTE', 'CONSULTATION', 'CALL', 'EMAIL', 'WHATSAPP']).default('NOTE'),
});

/** Staff-entered lead (e.g. a WhatsApp or phone conversation). */
export const manualLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email('A valid email is required'),
  phone: opt(z.string().trim().max(30)),
  company: opt(z.string().trim().max(160)),
  service: opt(z.string().trim().max(120)),
  budget: opt(z.string().trim().max(80)),
  timeline: opt(z.string().trim().max(80)),
  message: z.string().trim().min(5, 'Describe the enquiry').max(4000),
  source: z.enum(['manual_whatsapp', 'manual_phone', 'manual_email', 'manual_referral', 'manual_event', 'manual_other']),
  priority: priority.default('MEDIUM'),
  assignedToId: opt(uuid),
});

export const ruleSchema = z.object({
  rules: z
    .array(z.object({ service: clearable(z.string().trim().max(120)), assigneeId: uuid, active: z.boolean().default(true) }))
    .max(50),
});

export const reportQuery = z.object({
  from: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});
