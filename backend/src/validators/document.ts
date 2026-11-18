import { z } from 'zod';
import { paginationQuery } from '../lib/pagination';
import { uuid } from './training';

const empty = (v: unknown) => (v === '' ? undefined : v);
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess(empty, s.optional());
const nullable = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());
const str = (max: number) => z.string().trim().max(max);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .transform((v) => new Date(`${v}T00:00:00+05:30`));

export const DOC_TYPES = ['QUOTATION', 'PROPOSAL', 'AGREEMENT', 'INVOICE', 'RECEIPT'] as const;
const creatableType = z.enum(['QUOTATION', 'PROPOSAL', 'AGREEMENT', 'INVOICE']);
const STATUSES = ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'DECLINED', 'SIGNED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'SUPERSEDED'] as const;

const stateCode = z.string().trim().regex(/^\d{2}$/, 'Use the 2-digit GST state code');
const gstin = z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, 'A GSTIN has 15 letters and digits');

export const partySchema = z.object({
  name: z.string().trim().min(2, 'Enter the client name').max(160),
  company: nullable(str(160)),
  email: z.string().trim().email('A valid email is required').max(200),
  phone: nullable(str(30)),
  addressLine1: nullable(str(200)),
  addressLine2: nullable(str(200)),
  city: nullable(str(100)),
  state: nullable(str(100)),
  stateCode: nullable(stateCode),
  postalCode: nullable(str(12)),
  country: nullable(str(60)),
  gstin: nullable(gstin),
});

export const lineSchema = z.object({
  description: z.string().trim().min(1, 'Describe the item').max(1000),
  quantity: z.number().positive().max(100_000),
  unitPaise: z.number().int().min(0).max(1_000_000_000),
  discountPaise: z.number().int().min(0).max(1_000_000_000).optional(),
  taxRateBp: z.number().int().min(0).max(2800).optional(),
  sac: opt(z.string().trim().regex(/^\d{4,8}$/, 'SAC/HSN codes are 4–8 digits')),
});

const sectionSchema = z.object({ heading: str(160), body: str(20_000) });

const docFields = {
  title: z.string().trim().max(200),
  party: partySchema.optional(),
  items: z.array(lineSchema).max(200).optional(),
  sections: z.array(sectionSchema).max(30).optional(),
  notes: nullable(str(5000)),
  terms: nullable(str(20_000)),
  applyGst: z.boolean().optional(),
  issueDate: nullable(day),
  dueDate: nullable(day),
  validUntil: nullable(day),
};

export const documentCreateSchema = z.object({
  type: creatableType,
  clientId: opt(uuid),
  leadId: opt(uuid),
  studentId: opt(uuid),
  templateId: opt(uuid),
  ...docFields,
});

export const documentUpdateSchema = z
  .object(docFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const documentListQuery = z.object({
  type: opt(z.enum(DOC_TYPES)),
  status: opt(z.enum(STATUSES)),
  clientId: opt(uuid),
  leadId: opt(uuid),
  studentId: opt(uuid),
  search: opt(z.string().trim().max(100)),
  ...paginationQuery,
});

export const sendSchema = z.object({
  to: opt(z.string().trim().email('A valid email is required')),
  cc: z.array(z.string().trim().email()).max(5).optional(),
  message: nullable(str(3000)),
});

export const outcomeSchema = z.object({ outcome: z.enum(['ACCEPTED', 'DECLINED']), note: z.string().trim().min(3, 'Say how the client responded (e.g. "Accepted by email on 12 Oct")').max(500) });
export const convertSchema = z.object({ target: z.enum(['AGREEMENT', 'INVOICE']) });
export const signedSchema = z.object({ fileId: uuid, signedOn: day, note: z.string().trim().min(3, 'Who signed, and how (e.g. "Signed by R. Sharma, scanned copy")').max(500) });
export const paymentSchema = z.object({
  amountPaise: z.number().int().positive(),
  method: z.enum(['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'OTHER']),
  reference: z.string().trim().min(2, 'Enter the transaction / cheque reference').max(120),
  paidOn: day,
  note: nullable(str(1000)),
});

export const clientSchema = partySchema.extend({ notes: nullable(str(5000)), leadId: nullable(uuid) });
export const clientListQuery = z.object({ search: opt(z.string().trim().max(100)), includeArchived: opt(z.enum(['true', 'false']).transform((v) => v === 'true')), ...paginationQuery });
export const fromLeadSchema = z.object({ leadId: uuid });
export const archiveSchema = z.object({ archived: z.boolean() });

export const templateSchema = z.object({
  type: z.enum(DOC_TYPES),
  name: z.string().trim().min(2).max(120),
  title: nullable(str(200)),
  sections: z.array(sectionSchema).max(30).default([]),
  items: z.array(lineSchema).max(200).default([]),
  notes: nullable(str(5000)),
  terms: nullable(str(20_000)),
});
export const templateListQuery = z.object({ type: opt(z.enum(DOC_TYPES)), includeArchived: opt(z.enum(['true', 'false']).transform((v) => v === 'true')) });

const numberingRule = z.object({
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, 'Use up to 10 letters, digits or hyphens'),
  financialYear: z.boolean(),
  padding: z.number().int().min(3).max(8),
});
const blank = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal(''), s]);

/** Company details are entered by an authorised admin; nothing is pre-filled or invented. */
export const profileSchema = z
  .object({
    legalName: str(200),
    tradeName: z.string().trim().min(1).max(120),
    addressLine1: str(200),
    addressLine2: str(200),
    city: str(100),
    state: str(100),
    stateCode: blank(stateCode),
    postalCode: str(12),
    country: str(60),
    email: blank(z.string().trim().email()),
    phone: str(30),
    website: str(200),
    gstRegistered: z.boolean(),
    gstin: blank(gstin),
    pan: blank(z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid PAN')),
    registrationNo: str(60),
    defaultGstRateBp: z.number().int().min(0).max(2800),
    bankDetails: str(1000),
    upiId: blank(z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI id')),
    signatoryName: str(120),
    signatoryTitle: str(120),
    footerNote: str(300),
    numbering: z.record(z.enum(DOC_TYPES), numberingRule),
  })
  .partial()
  .refine((v) => !(v.gstRegistered && v.gstin === ''), { message: 'Enter the GSTIN to switch GST on', path: ['gstin'] });
