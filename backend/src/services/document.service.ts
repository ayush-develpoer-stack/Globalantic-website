import { Prisma, type BusinessDocument, type BusinessDocumentStatus, type BusinessDocumentType, type ContactStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { hasPermission, type Permission } from '../lib/permissions';
import { computeTotals, formatPaise, MoneyError, type LineInput, type Totals } from '../lib/money';
import { renderDocumentPdf, labelFor, type DocumentSnapshot, type PartySnapshot } from '../lib/pdf/documents';
import { companySnapshot, getProfile, gstAvailable, nextDocumentNumber } from './business-profile.service';
import { esc, layout, sendLogged } from './email.service';
import { assertAttachable, readStored, storageConfigured, storeGenerated } from './file.service';

/**
 * Business documents: quotations, proposals, agreements, invoices and receipts.
 *
 *  DRAFT (editable, previewable with a DRAFT watermark)
 *    -> ISSUED (numbered; company/party/totals frozen in `snapshot`; PDF stored privately)
 *    -> SENT (emailed with the PDF attached; delivery logged)
 *    -> ACCEPTED / DECLINED (quotations, proposals)  -> convert to agreement / invoice
 *    -> SIGNED (agreements: only by uploading the signed copy — never assumed)
 *    -> PARTIALLY_PAID / PAID (invoices: by recording payments, each producing a receipt)
 *    VOID (with a reason; the number is never reused) · SUPERSEDED (replaced by a revision)
 *
 * Access: documents.read sees documents; quotations/proposals/agreements need documents.manage,
 * invoices/receipts need documents.finance. Staff without documents.finance (e.g. SALES) only see
 * documents they created or that belong to leads assigned to them.
 */

type Db = Prisma.TransactionClient | typeof prisma;

const FINANCE_TYPES: BusinessDocumentType[] = ['INVOICE', 'RECEIPT'];
const REVISABLE: BusinessDocumentType[] = ['QUOTATION', 'PROPOSAL', 'AGREEMENT'];

const can = (a: Actor, p: Permission) => hasPermission(a.role, p, a.permissions ?? []);
const seesAll = (a: Actor) => a.role === 'ADMIN' || can(a, 'documents.finance');

function assertTypeAccess(actor: Actor, type: BusinessDocumentType) {
  const ok = FINANCE_TYPES.includes(type) ? can(actor, 'documents.finance') : can(actor, 'documents.manage');
  if (!ok) throw ApiError.forbidden(FINANCE_TYPES.includes(type) ? 'Invoices and receipts are managed by finance' : 'You cannot manage this kind of document');
}

function scopeWhere(actor: Actor): Prisma.BusinessDocumentWhereInput {
  return seesAll(actor) ? {} : { OR: [{ createdById: actor.id }, { lead: { assignedToId: actor.id } }] };
}

async function loadDoc(db: Db, actor: Actor, id: string) {
  const d = await db.businessDocument.findFirst({ where: { id, ...scopeWhere(actor) } });
  if (!d) throw ApiError.notFound('Document not found');
  return d;
}

async function lockDoc(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "business_documents" WHERE id = ${id} FOR UPDATE`;
}

// ===========================================================================
// Parties & clients
// ===========================================================================

export interface PartyInput {
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  postalCode?: string | null;
  country?: string | null;
  gstin?: string | null;
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
function normaliseParty(p: PartyInput): PartyInput {
  return {
    name: p.name.trim(),
    company: clean(p.company),
    email: p.email.trim(),
    phone: clean(p.phone),
    addressLine1: clean(p.addressLine1),
    addressLine2: clean(p.addressLine2),
    city: clean(p.city),
    state: clean(p.state),
    stateCode: clean(p.stateCode),
    postalCode: clean(p.postalCode),
    country: clean(p.country),
    gstin: clean(p.gstin)?.toUpperCase() ?? null,
  };
}

function partyFromClient(c: { name: string; company: string | null; email: string; phone: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; stateCode: string | null; postalCode: string | null; country: string | null; gstin: string | null }): PartyInput {
  return normaliseParty({ ...c });
}

export function partySnapshot(p: PartyInput): PartySnapshot {
  return {
    name: p.name,
    company: p.company,
    email: p.email,
    phone: p.phone,
    addressLines: [p.addressLine1, p.addressLine2, [p.city, p.postalCode].filter(Boolean).join(' '), p.country && p.country !== 'India' ? p.country : null].filter((x): x is string => Boolean(x)),
    state: p.state,
    stateCode: p.stateCode,
    gstin: p.gstin,
  };
}

export async function listClients(q: { search?: string; skip: number; take: number; includeArchived?: boolean }) {
  const where: Prisma.BusinessClientWhereInput = {
    ...(q.includeArchived ? {} : { archivedAt: null }),
    ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { company: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.businessClient.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: q.skip, take: q.take, include: { lead: { select: { id: true, reference: true, status: true } }, _count: { select: { documents: true } } } }),
    prisma.businessClient.count({ where }),
  ]);
  return { items, total };
}

export async function getClient(actor: Actor, id: string) {
  const c = await prisma.businessClient.findUnique({ where: { id }, include: { lead: { select: { id: true, reference: true, status: true, name: true } } } });
  if (!c) throw ApiError.notFound('Client not found');
  const documents = await prisma.businessDocument.findMany({ where: { clientId: id, ...scopeWhere(actor) }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, status: true, number: true, title: true, totalPaise: true, issueDate: true, createdAt: true } });
  return { ...c, documents };
}

export type ClientInput = PartyInput & { notes?: string | null; leadId?: string | null };

export async function saveClient(actor: Actor, id: string | null, input: ClientInput) {
  const data = { ...normaliseParty(input), notes: clean(input.notes), ...(input.leadId !== undefined ? { leadId: input.leadId } : {}) };
  if (data.leadId && !(await prisma.contactLead.findUnique({ where: { id: data.leadId }, select: { id: true } }))) throw ApiError.validation([{ field: 'leadId', message: 'Lead not found' }]);
  const c = id ? await prisma.businessClient.update({ where: { id }, data }).catch(() => null) : await prisma.businessClient.create({ data: { ...data, createdById: actor.id } });
  if (!c) throw ApiError.notFound('Client not found');
  await audit(prisma, actor, { action: id ? 'client.updated' : 'client.created', entityType: 'BusinessClient', entityId: c.id });
  return c;
}

export async function archiveClient(actor: Actor, id: string, archived: boolean) {
  const res = await prisma.businessClient.updateMany({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  if (!res.count) throw ApiError.notFound('Client not found');
  await audit(prisma, actor, { action: archived ? 'client.archived' : 'client.restored', entityType: 'BusinessClient', entityId: id });
  return { archived };
}

/** Lead -> client (re-uses the client already linked to the lead). */
/** A lead assigned to someone else is invisible to staff who do not see every document. */
async function leadInScope(actor: Actor, leadId: string) {
  const lead = await prisma.contactLead.findUnique({ where: { id: leadId } });
  if (!lead) throw ApiError.notFound('Lead not found');
  if (!seesAll(actor) && actor.role !== 'ADMIN' && lead.assignedToId && lead.assignedToId !== actor.id) throw ApiError.notFound('Lead not found');
  return lead;
}

export async function clientFromLead(actor: Actor, leadId: string) {
  const lead = await leadInScope(actor, leadId);
  const existing = await prisma.businessClient.findFirst({ where: { leadId, archivedAt: null } });
  if (existing) return existing;
  const c = await prisma.businessClient.create({ data: { name: lead.name, company: lead.company, email: lead.email, phone: lead.phone, leadId, createdById: actor.id } });
  await audit(prisma, actor, { action: 'client.created_from_lead', entityType: 'BusinessClient', entityId: c.id, after: { leadId } });
  await leadActivity(prisma, leadId, actor, 'CLIENT_CREATED', `Client record created for ${c.company ?? c.name}`);
  return c;
}

// ===========================================================================
// Templates
// ===========================================================================

export interface TemplateInput {
  type: BusinessDocumentType;
  name: string;
  title?: string | null;
  sections: { heading: string; body: string }[];
  items: LineInput[];
  notes?: string | null;
  terms?: string | null;
}

export async function listTemplates(type?: BusinessDocumentType, includeArchived = false) {
  return prisma.documentTemplate.findMany({ where: { ...(type ? { type } : {}), ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
}

export async function saveTemplate(actor: Actor, id: string | null, input: TemplateInput) {
  validateLines(input.items, false);
  const data = { type: input.type, name: input.name.trim(), title: clean(input.title), sections: input.sections as unknown as Prisma.InputJsonValue, items: input.items as unknown as Prisma.InputJsonValue, notes: clean(input.notes), terms: clean(input.terms) };
  const t = id ? await prisma.documentTemplate.update({ where: { id }, data }).catch(() => null) : await prisma.documentTemplate.create({ data });
  if (!t) throw ApiError.notFound('Template not found');
  await audit(prisma, actor, { action: id ? 'document_template.updated' : 'document_template.created', entityType: 'DocumentTemplate', entityId: t.id });
  return t;
}

export async function archiveTemplate(actor: Actor, id: string, archived: boolean) {
  const res = await prisma.documentTemplate.updateMany({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  if (!res.count) throw ApiError.notFound('Template not found');
  await audit(prisma, actor, { action: archived ? 'document_template.archived' : 'document_template.restored', entityType: 'DocumentTemplate', entityId: id });
  return { archived };
}

// ===========================================================================
// Totals
// ===========================================================================

function validateLines(items: LineInput[], gst: boolean): Totals {
  try {
    return computeTotals(items, gst ? { intraState: true } : null);
  } catch (err) {
    if (err instanceof MoneyError) throw ApiError.validation([{ field: 'items', message: err.message }]);
    throw err;
  }
}

/** GST context for a document: null when GST does not apply. Throws when it is requested but cannot apply. */
async function gstContext(applyGst: boolean, party: PartyInput, strict: boolean) {
  if (!applyGst) return null;
  const profile = await getProfile();
  if (!gstAvailable(profile)) {
    if (strict) throw ApiError.conflict('GST cannot be applied: the company is not set up as GST-registered with a valid GSTIN (Settings → Company details)');
    return null;
  }
  if (!profile.stateCode) {
    if (strict) throw ApiError.conflict('Add the company GST state code before issuing a GST invoice');
    return null;
  }
  if (!party.stateCode) {
    if (strict) throw ApiError.validation([{ field: 'party.stateCode', message: "The client's GST state code (place of supply) is required for GST" }]);
    return { intraState: true };
  }
  return { intraState: party.stateCode === profile.stateCode };
}

// ===========================================================================
// Documents
// ===========================================================================

export interface DocumentInput {
  type: BusinessDocumentType;
  title: string;
  clientId?: string | null;
  leadId?: string | null;
  studentId?: string | null;
  templateId?: string | null;
  party?: PartyInput;
  items?: LineInput[];
  sections?: { heading: string; body: string }[];
  notes?: string | null;
  terms?: string | null;
  applyGst?: boolean;
  issueDate?: Date | null;
  dueDate?: Date | null;
  validUntil?: Date | null;
}

const LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  number: true,
  revision: true,
  title: true,
  party: true,
  totalPaise: true,
  amountPaidPaise: true,
  currency: true,
  issueDate: true,
  dueDate: true,
  validUntil: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, name: true, company: true } },
  lead: { select: { id: true, reference: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.BusinessDocumentSelect;

export async function listDocuments(actor: Actor, q: { type?: BusinessDocumentType; status?: BusinessDocumentStatus; clientId?: string; leadId?: string; studentId?: string; search?: string; skip: number; take: number }) {
  const where: Prisma.BusinessDocumentWhereInput = {
    AND: [
      scopeWhere(actor),
      q.type ? { type: q.type } : {},
      q.status ? { status: q.status } : {},
      q.clientId ? { clientId: q.clientId } : {},
      q.leadId ? { leadId: q.leadId } : {},
      q.studentId ? { studentId: q.studentId } : {},
      q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { title: { contains: q.search, mode: 'insensitive' } }, { client: { name: { contains: q.search, mode: 'insensitive' } } }, { client: { company: { contains: q.search, mode: 'insensitive' } } }] } : {},
    ],
  };
  const [items, total, byType] = await Promise.all([
    prisma.businessDocument.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: q.skip, take: q.take, select: LIST_SELECT }),
    prisma.businessDocument.count({ where }),
    prisma.businessDocument.groupBy({ by: ['type', 'status'], where: scopeWhere(actor), _count: true, _sum: { totalPaise: true, amountPaidPaise: true } }),
  ]);
  return { items, total, summary: byType.map((r) => ({ type: r.type, status: r.status, count: r._count, totalPaise: r._sum.totalPaise ?? 0, paidPaise: r._sum.amountPaidPaise ?? 0 })) };
}

export async function getDocument(actor: Actor, id: string) {
  const d = await prisma.businessDocument.findFirst({
    where: { id, ...scopeWhere(actor) },
    include: {
      client: true,
      lead: { select: { id: true, reference: true, name: true, status: true } },
      student: { select: { id: true, name: true, email: true } },
      template: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      source: { select: { id: true, type: true, number: true, status: true } },
      derived: { select: { id: true, type: true, number: true, status: true, totalPaise: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      revisionOf: { select: { id: true, number: true, revision: true, status: true } },
      revisions: { select: { id: true, number: true, revision: true, status: true }, orderBy: { revision: 'asc' } },
      signedCopyFile: { select: { id: true, originalName: true, sizeBytes: true, createdAt: true } },
    },
  });
  if (!d) throw ApiError.notFound('Document not found');
  const [history, emails] = await Promise.all([
    prisma.auditLog.findMany({ where: { entityType: 'BusinessDocument', entityId: id }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true } } } }),
    prisma.emailLog.findMany({ where: { entityType: 'BusinessDocument', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, to: true, subject: true, status: true, error: true, createdAt: true } }),
  ]);
  const party = d.party as unknown as PartyInput;
  const gst = await gstContext(d.applyGst, party, false);
  const preview = d.status === 'DRAFT' ? computeTotals(d.items as unknown as LineInput[], gst) : (d.snapshot as unknown as DocumentSnapshot | null)?.totals ?? null;
  return { ...d, history, emails, totals: preview, permissions: { canEdit: can(actor, FINANCE_TYPES.includes(d.type) ? 'documents.finance' : 'documents.manage') } };
}

async function resolveParty(actor: Actor, input: DocumentInput): Promise<{ party: PartyInput; clientId: string | null; leadId: string | null; studentId: string | null }> {
  let clientId = input.clientId ?? null;
  let leadId = input.leadId ?? null;
  const studentId = input.studentId ?? null;
  // Linking a lead or a student copies their details into the document, so both are scope-checked.
  if (leadId) await leadInScope(actor, leadId);
  if (studentId && !seesAll(actor)) throw ApiError.validation([{ field: 'studentId', message: 'Student not found' }]);
  if (!clientId && leadId) clientId = (await clientFromLead(actor, leadId)).id;
  if (clientId) {
    const c = await prisma.businessClient.findUnique({ where: { id: clientId } });
    if (!c || c.archivedAt) throw ApiError.validation([{ field: 'clientId', message: 'Client not found' }]);
    leadId = leadId ?? c.leadId;
    return { party: input.party ? normaliseParty(input.party) : partyFromClient(c), clientId, leadId, studentId };
  }
  if (studentId) {
    const s = await prisma.user.findFirst({ where: { id: studentId, role: 'STUDENT', deletedAt: null }, select: { name: true, email: true, phone: true } });
    if (!s) throw ApiError.validation([{ field: 'studentId', message: 'Student not found' }]);
    return { party: input.party ? normaliseParty(input.party) : normaliseParty({ name: s.name, email: s.email, phone: s.phone ? `+${s.phone}` : null }), clientId: null, leadId, studentId };
  }
  if (!input.party) throw ApiError.validation([{ field: 'clientId', message: 'Choose a client, lead or student, or enter the party details' }]);
  return { party: normaliseParty(input.party), clientId: null, leadId, studentId };
}

export async function createDraft(actor: Actor, input: DocumentInput) {
  assertTypeAccess(actor, input.type);
  if (input.type === 'RECEIPT') throw ApiError.conflict('Receipts are created by recording a payment on an invoice');
  const template = input.templateId ? await prisma.documentTemplate.findFirst({ where: { id: input.templateId, type: input.type, archivedAt: null } }) : null;
  if (input.templateId && !template) throw ApiError.validation([{ field: 'templateId', message: 'Template not found for this document type' }]);
  const { party, clientId, leadId, studentId } = await resolveParty(actor, input);
  const items = input.items ?? ((template?.items as unknown as LineInput[]) || []);
  const sections = input.sections ?? ((template?.sections as unknown as { heading: string; body: string }[]) || []);
  const profile = await getProfile();
  const totals = validateLines(items, Boolean(input.applyGst) && gstAvailable(profile));
  const d = await prisma.businessDocument.create({
    data: {
      type: input.type,
      title: input.title.trim() || template?.title || labelFor({ kind: input.type, totals } as DocumentSnapshot),
      clientId,
      leadId,
      studentId,
      templateId: template?.id ?? null,
      party: party as unknown as Prisma.InputJsonValue,
      items: items as unknown as Prisma.InputJsonValue,
      sections: sections as unknown as Prisma.InputJsonValue,
      notes: clean(input.notes) ?? template?.notes ?? null,
      terms: clean(input.terms) ?? template?.terms ?? null,
      applyGst: Boolean(input.applyGst),
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate ?? null,
      validUntil: input.validUntil ?? null,
      subtotalPaise: totals.subtotalPaise,
      discountPaise: totals.discountPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      createdById: actor.id,
    },
  });
  await audit(prisma, actor, { action: 'document.created', entityType: 'BusinessDocument', entityId: d.id, after: { type: d.type, clientId, leadId, studentId } });
  return d;
}

export async function updateDraft(actor: Actor, id: string, input: Partial<DocumentInput>) {
  return prisma.$transaction(async (tx) => {
    await lockDoc(tx, id);
    const d = await loadDoc(tx, actor, id);
    assertTypeAccess(actor, d.type);
    if (d.status !== 'DRAFT') throw ApiError.conflict('Issued documents cannot be edited. Create a revision instead.');
    const party = input.party ? normaliseParty(input.party) : (d.party as unknown as PartyInput);
    const items = input.items ?? (d.items as unknown as LineInput[]);
    const applyGst = input.applyGst ?? d.applyGst;
    const profile = await getProfile(tx);
    const totals = validateLines(items, applyGst && gstAvailable(profile));
    const updated = await tx.businessDocument.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.party ? { party: party as unknown as Prisma.InputJsonValue } : {}),
        ...(input.items ? { items: items as unknown as Prisma.InputJsonValue } : {}),
        ...(input.sections ? { sections: input.sections as unknown as Prisma.InputJsonValue } : {}),
        ...(input.notes !== undefined ? { notes: clean(input.notes) } : {}),
        ...(input.terms !== undefined ? { terms: clean(input.terms) } : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        applyGst,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
      },
    });
    await audit(tx, actor, { action: 'document.draft_updated', entityType: 'BusinessDocument', entityId: id, after: { fields: Object.keys(input) } });
    return updated;
  });
}

export async function deleteDraft(actor: Actor, id: string) {
  const d = await loadDoc(prisma, actor, id);
  assertTypeAccess(actor, d.type);
  if (d.status !== 'DRAFT' || d.number) throw ApiError.conflict('Only unissued drafts can be deleted. Void issued documents instead.');
  await prisma.businessDocument.delete({ where: { id } });
  await audit(prisma, actor, { action: 'document.draft_deleted', entityType: 'BusinessDocument', entityId: id, before: { type: d.type, title: d.title } });
  return { id };
}

/** Builds the immutable snapshot printed on the PDF (company details as configured right now). */
async function buildSnapshot(d: BusinessDocument, number: string | null, issueDate: Date | null, strict: boolean, extra?: Partial<DocumentSnapshot>): Promise<DocumentSnapshot> {
  const profile = await getProfile();
  const party = d.party as unknown as PartyInput;
  const gst = await gstContext(d.applyGst, party, strict);
  const totals = computeTotals(d.items as unknown as LineInput[], gst);
  return {
    kind: d.type,
    number,
    revision: d.revision,
    title: d.title,
    issueDate: issueDate?.toISOString() ?? null,
    dueDate: d.dueDate?.toISOString() ?? null,
    validUntil: d.validUntil?.toISOString() ?? null,
    company: companySnapshot(profile),
    party: partySnapshot(party),
    currency: d.currency,
    totals,
    sections: (d.sections as unknown as { heading: string; body: string }[]) ?? [],
    notes: d.notes,
    terms: d.terms,
    amountPaidPaise: d.amountPaidPaise,
    ...extra,
  };
}

function assertIssuable(d: BusinessDocument) {
  const party = d.party as unknown as PartyInput;
  const errors: { field: string; message: string }[] = [];
  if (!party?.name) errors.push({ field: 'party.name', message: 'The client name is required' });
  if (!party?.email) errors.push({ field: 'party.email', message: 'The client email is required' });
  const items = (d.items as unknown as LineInput[]) ?? [];
  if ((d.type === 'QUOTATION' || d.type === 'INVOICE') && !items.length) errors.push({ field: 'items', message: 'Add at least one line item' });
  if ((d.type === 'PROPOSAL' || d.type === 'AGREEMENT') && !((d.sections as unknown[]) ?? []).length) errors.push({ field: 'sections', message: 'Add the scope and terms sections' });
  if (d.type === 'INVOICE' && !d.dueDate) errors.push({ field: 'dueDate', message: 'Set a due date' });
  if (errors.length) throw ApiError.validation(errors);
}

export async function issue(actor: Actor, id: string) {
  const issued = await prisma.$transaction(
    async (tx) => {
      await lockDoc(tx, id);
      const d = await loadDoc(tx, actor, id);
      assertTypeAccess(actor, d.type);
      if (d.status !== 'DRAFT') throw ApiError.conflict('This document has already been issued');
      assertIssuable(d);
      const profile = await getProfile(tx);
      const issueDate = d.issueDate ?? new Date();
      let number: string;
      if (d.revisionOfId) {
        const original = await tx.businessDocument.findUniqueOrThrow({ where: { id: d.revisionOfId } });
        const base = (original.number ?? '').replace(/-R\d+$/, '');
        number = `${base}-R${d.revision}`;
      } else number = await nextDocumentNumber(tx, d.type, profile, issueDate);
      const snapshot = await buildSnapshot(d, number, issueDate, true);
      const updated = await tx.businessDocument.update({
        where: { id },
        data: {
          status: 'ISSUED',
          number,
          issueDate,
          issuedAt: new Date(),
          issuedById: actor.id,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          subtotalPaise: snapshot.totals.subtotalPaise,
          discountPaise: snapshot.totals.discountPaise,
          taxPaise: snapshot.totals.taxPaise,
          totalPaise: snapshot.totals.totalPaise,
        },
      });
      if (d.revisionOfId) {
        await tx.businessDocument.updateMany({ where: { id: d.revisionOfId, status: { notIn: ['VOID', 'SUPERSEDED'] } }, data: { status: 'SUPERSEDED' } });
        await audit(tx, actor, { action: 'document.superseded', entityType: 'BusinessDocument', entityId: d.revisionOfId, after: { by: number } });
      }
      await audit(tx, actor, { action: 'document.issued', entityType: 'BusinessDocument', entityId: id, after: { number, totalPaise: snapshot.totals.totalPaise, gst: Boolean(snapshot.totals.gst) } });
      if (d.leadId) await leadActivity(tx, d.leadId, actor, 'DOCUMENT', `${labelFor(snapshot)} ${number} issued (${formatPaise(snapshot.totals.totalPaise)})`);
      return updated;
    },
    { timeout: 20_000 },
  );
  await cachePdf(issued.id).catch((err) => console.error('[documents] could not store PDF:', err instanceof Error ? err.message : err));
  return issued;
}

/** Stores the issued PDF privately (when storage is configured). The snapshot remains the source of truth. */
async function cachePdf(id: string) {
  if (!storageConfigured()) return;
  const d = await prisma.businessDocument.findUniqueOrThrow({ where: { id } });
  if (d.pdfFileId || !d.snapshot) return;
  const { pdf } = await renderDocumentPdf(d.snapshot as unknown as DocumentSnapshot);
  const file = await storeGenerated(prisma, d.createdById, pdf, fileName(d));
  await prisma.businessDocument.updateMany({ where: { id, pdfFileId: null }, data: { pdfFileId: file.id } });
}

const fileName = (d: Pick<BusinessDocument, 'type' | 'number' | 'title'>) => `${d.type.charAt(0)}${d.type.slice(1).toLowerCase()}-${(d.number ?? 'draft').replace(/[/\\]/g, '-')}.pdf`;

/** PDF for download: issued -> stored copy or the frozen snapshot; draft -> preview with a DRAFT watermark. */
export async function documentPdf(actor: Actor, id: string): Promise<{ pdf: Buffer; filename: string }> {
  const d = await loadDoc(prisma, actor, id);
  if (d.status === 'DRAFT') {
    const snapshot = await buildSnapshot(d, null, d.issueDate, false);
    return { pdf: (await renderDocumentPdf(snapshot, { draft: true })).pdf, filename: fileName(d) };
  }
  const mark = d.status === 'VOID' ? 'VOID' : d.status === 'SUPERSEDED' ? 'SUPERSEDED' : undefined;
  if (d.pdfFileId && !mark) {
    const stored = await readStored(d.pdfFileId);
    if (stored) return { pdf: stored.data, filename: fileName(d) };
  }
  if (!d.snapshot) throw ApiError.notFound('Document has no issued version');
  // Void / superseded copies are re-rendered from the frozen snapshot with a watermark.
  const { pdf } = await renderDocumentPdf(d.snapshot as unknown as DocumentSnapshot, { watermark: mark });
  return { pdf, filename: fileName(d) };
}

export async function send(actor: Actor, id: string, input: { to?: string; cc?: string[]; message?: string | null }) {
  const d = await loadDoc(prisma, actor, id);
  assertTypeAccess(actor, d.type);
  if (d.status === 'DRAFT') throw ApiError.conflict('Issue the document before sending it');
  if (d.status === 'VOID' || d.status === 'SUPERSEDED') throw ApiError.conflict('Void or superseded documents cannot be sent');
  const party = d.party as unknown as PartyInput;
  const to = (input.to ?? party.email).trim();
  const { pdf, filename } = await documentPdf(actor, id);
  const snapshot = d.snapshot as unknown as DocumentSnapshot;
  const label = labelFor(snapshot);
  const profile = await getProfile();
  const company = profile.tradeName || 'Globalantic';
  const html = layout(
    `${label} ${d.number}`,
    `<p style="font-size:14px;line-height:1.6;">Hello ${esc(party.name)},</p>
     ${input.message ? `<p style="font-size:14px;line-height:1.6;white-space:pre-line;">${esc(input.message)}</p>` : `<p style="font-size:14px;line-height:1.6;">Please find attached ${esc(label.toLowerCase())} <strong>${esc(d.number)}</strong> — ${esc(d.title)}.</p>`}
     <table style="border-collapse:collapse;margin:12px 0;font-size:13px;">
       <tr><td style="padding:4px 0;color:#666;">Amount</td><td style="padding:4px 0 4px 12px;font-weight:600;">${esc(formatPaise(d.totalPaise, d.currency))}</td></tr>
       ${d.type === 'INVOICE' && d.dueDate ? `<tr><td style="padding:4px 0;color:#666;">Due date</td><td style="padding:4px 0 4px 12px;font-weight:600;">${esc(d.dueDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }))}</td></tr>` : ''}
       ${d.validUntil && (d.type === 'QUOTATION' || d.type === 'PROPOSAL') ? `<tr><td style="padding:4px 0;color:#666;">Valid until</td><td style="padding:4px 0 4px 12px;font-weight:600;">${esc(d.validUntil.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }))}</td></tr>` : ''}
     </table>
     <p style="font-size:13px;color:#555;">Reply to this email with any questions. — ${esc(company)}</p>`,
  );
  const result = await sendLogged(
    { kind: 'document.sent', entityType: 'BusinessDocument', entityId: id },
    { to: [to, ...(input.cc ?? [])], subject: `${label} ${d.number} — ${d.title}`, html, replyTo: profile.email || undefined, attachments: [{ filename, content: pdf }] },
  );
  await prisma.$transaction(async (tx) => {
    if (result.status === 'SENT') {
      await tx.businessDocument.updateMany({ where: { id, status: 'ISSUED' }, data: { status: 'SENT' } });
      await tx.businessDocument.update({ where: { id }, data: { sentAt: new Date() } });
      if (d.leadId) {
        await leadActivity(tx, d.leadId, actor, 'EMAIL', `${label} ${d.number} emailed to ${to}`);
        if (d.type === 'QUOTATION' || d.type === 'PROPOSAL') await advanceLead(tx, d.leadId, actor, 'PROPOSAL_SENT', `${label} ${d.number} sent`);
      }
    }
    await audit(tx, actor, { action: 'document.sent', entityType: 'BusinessDocument', entityId: id, after: { to, cc: input.cc?.length ?? 0, delivery: result.status } });
  });
  return { delivery: result.status, error: result.status === 'FAILED' ? result.error : undefined };
}

export async function recordOutcome(actor: Actor, id: string, input: { outcome: 'ACCEPTED' | 'DECLINED'; note: string }) {
  return prisma.$transaction(async (tx) => {
    await lockDoc(tx, id);
    const d = await loadDoc(tx, actor, id);
    assertTypeAccess(actor, d.type);
    if (d.type !== 'QUOTATION' && d.type !== 'PROPOSAL') throw ApiError.conflict('Only quotations and proposals are accepted or declined');
    if (d.status !== 'ISSUED' && d.status !== 'SENT') throw ApiError.conflict(`A ${d.status.toLowerCase()} document cannot change outcome`);
    const updated = await tx.businessDocument.update({ where: { id }, data: { status: input.outcome, outcomeNote: input.note, ...(input.outcome === 'ACCEPTED' ? { acceptedAt: new Date() } : { declinedAt: new Date() }) } });
    await audit(tx, actor, { action: input.outcome === 'ACCEPTED' ? 'document.accepted' : 'document.declined', entityType: 'BusinessDocument', entityId: id, reason: input.note });
    if (d.leadId) {
      await leadActivity(tx, d.leadId, actor, 'DOCUMENT', `${d.type === 'QUOTATION' ? 'Quotation' : 'Proposal'} ${d.number} ${input.outcome.toLowerCase()}: ${input.note}`);
      if (input.outcome === 'ACCEPTED') await advanceLead(tx, d.leadId, actor, 'NEGOTIATION', `${d.number} accepted`);
    }
    return updated;
  });
}

/** Accepted quotation/proposal -> draft agreement or invoice; signed agreement -> draft invoice. */
export async function convert(actor: Actor, id: string, target: 'AGREEMENT' | 'INVOICE') {
  const d = await loadDoc(prisma, actor, id);
  assertTypeAccess(actor, target);
  const ok = ((d.type === 'QUOTATION' || d.type === 'PROPOSAL') && d.status === 'ACCEPTED') || (d.type === 'AGREEMENT' && d.status === 'SIGNED' && target === 'INVOICE');
  if (!ok) throw ApiError.conflict(d.type === 'AGREEMENT' ? 'Only a signed agreement can be converted to an invoice' : 'Record the acceptance first');
  const draft = await prisma.businessDocument.create({
    data: {
      type: target,
      title: d.title,
      sourceId: d.id,
      clientId: d.clientId,
      leadId: d.leadId,
      studentId: d.studentId,
      party: d.party as Prisma.InputJsonValue,
      items: d.items as Prisma.InputJsonValue,
      sections: (target === 'AGREEMENT' ? d.sections : []) as Prisma.InputJsonValue,
      notes: d.notes,
      terms: target === 'AGREEMENT' ? d.terms : null,
      applyGst: d.applyGst,
      createdById: actor.id,
      subtotalPaise: d.subtotalPaise,
      discountPaise: d.discountPaise,
      taxPaise: d.taxPaise,
      totalPaise: d.totalPaise,
    },
  });
  await audit(prisma, actor, { action: 'document.converted', entityType: 'BusinessDocument', entityId: draft.id, after: { from: d.number, to: target } });
  return draft;
}

export async function revise(actor: Actor, id: string) {
  const d = await loadDoc(prisma, actor, id);
  assertTypeAccess(actor, d.type);
  if (!REVISABLE.includes(d.type)) throw ApiError.conflict('Issued invoices cannot be revised. Void it and issue a new one.');
  if (!['ISSUED', 'SENT', 'DECLINED'].includes(d.status)) throw ApiError.conflict(`A ${d.status.toLowerCase()} document cannot be revised`);
  const openRevision = await prisma.businessDocument.findFirst({ where: { revisionOfId: id, status: 'DRAFT' } });
  if (openRevision) return openRevision;
  const draft = await prisma.businessDocument.create({
    data: {
      type: d.type,
      title: d.title,
      revision: d.revision + 1,
      revisionOfId: d.id,
      sourceId: d.sourceId,
      clientId: d.clientId,
      leadId: d.leadId,
      studentId: d.studentId,
      templateId: d.templateId,
      party: d.party as Prisma.InputJsonValue,
      items: d.items as Prisma.InputJsonValue,
      sections: d.sections as Prisma.InputJsonValue,
      notes: d.notes,
      terms: d.terms,
      applyGst: d.applyGst,
      validUntil: d.validUntil,
      dueDate: d.dueDate,
      subtotalPaise: d.subtotalPaise,
      discountPaise: d.discountPaise,
      taxPaise: d.taxPaise,
      totalPaise: d.totalPaise,
      createdById: actor.id,
    },
  });
  await audit(prisma, actor, { action: 'document.revision_started', entityType: 'BusinessDocument', entityId: draft.id, after: { of: d.number, revision: draft.revision } });
  return draft;
}

/** Agreements become SIGNED only with an uploaded signed copy (no e-signature provider is configured). */
export async function recordSigned(actor: Actor, id: string, input: { fileId: string; signedOn: Date; note: string }) {
  return prisma.$transaction(async (tx) => {
    await lockDoc(tx, id);
    const d = await loadDoc(tx, actor, id);
    assertTypeAccess(actor, d.type);
    if (d.type !== 'AGREEMENT') throw ApiError.conflict('Only agreements are signed');
    if (d.status !== 'ISSUED' && d.status !== 'SENT') throw ApiError.conflict(`A ${d.status.toLowerCase()} agreement cannot be marked signed`);
    if (input.signedOn.getTime() > Date.now() + 86_400_000) throw ApiError.validation([{ field: 'signedOn', message: 'The signing date cannot be in the future' }]);
    await assertAttachable(tx, actor.id, input.fileId, 'SIGNED_DOCUMENT');
    const updated = await tx.businessDocument.update({ where: { id }, data: { status: 'SIGNED', signedAt: input.signedOn, signedById: actor.id, signedNote: input.note, signedCopyFileId: input.fileId } });
    await audit(tx, actor, { action: 'document.signed_copy_recorded', entityType: 'BusinessDocument', entityId: id, after: { fileId: input.fileId, signedOn: input.signedOn.toISOString() }, reason: input.note });
    if (d.leadId) {
      await leadActivity(tx, d.leadId, actor, 'DOCUMENT', `Agreement ${d.number} signed (${input.note})`);
      await advanceLead(tx, d.leadId, actor, 'WON', `Agreement ${d.number} signed`);
    }
    return updated;
  });
}

export async function signedCopy(actor: Actor, id: string) {
  const d = await loadDoc(prisma, actor, id);
  if (!d.signedCopyFileId) throw ApiError.notFound('No signed copy');
  const f = await readStored(d.signedCopyFileId);
  if (!f) throw ApiError.notFound('Signed copy not found');
  return f;
}

/** Records money received against an invoice and issues a numbered receipt for it. */
export async function recordPayment(actor: Actor, invoiceId: string, input: { amountPaise: number; method: string; reference: string; paidOn: Date; note?: string | null }) {
  assertTypeAccess(actor, 'RECEIPT');
  const receipt = await prisma.$transaction(
    async (tx) => {
      await lockDoc(tx, invoiceId);
      const inv = await loadDoc(tx, actor, invoiceId);
      if (inv.type !== 'INVOICE') throw ApiError.conflict('Payments are recorded on invoices');
      if (!['ISSUED', 'SENT', 'PARTIALLY_PAID'].includes(inv.status)) throw ApiError.conflict(`A ${inv.status.toLowerCase()} invoice cannot take payments`);
      const balance = inv.totalPaise - inv.amountPaidPaise;
      if (input.amountPaise <= 0 || input.amountPaise > balance) throw ApiError.validation([{ field: 'amountPaise', message: `Enter an amount up to the balance of ${formatPaise(balance, inv.currency)}` }]);
      if (input.paidOn.getTime() > Date.now() + 86_400_000) throw ApiError.validation([{ field: 'paidOn', message: 'The payment date cannot be in the future' }]);
      const dup = await tx.businessDocument.findFirst({ where: { type: 'RECEIPT', sourceId: invoiceId, paymentRef: input.reference.trim(), status: { not: 'VOID' } } });
      if (dup) throw ApiError.conflict(`This reference was already recorded on receipt ${dup.number}`);
      const profile = await getProfile(tx);
      const now = new Date();
      const number = await nextDocumentNumber(tx, 'RECEIPT', profile, now);
      const items: LineInput[] = [{ description: `Payment against ${inv.number} — ${inv.title}`, quantity: 1, unitPaise: input.amountPaise }];
      const r = await tx.businessDocument.create({
        data: {
          type: 'RECEIPT',
          status: 'ISSUED',
          number,
          title: `Payment receipt — ${inv.title}`,
          sourceId: inv.id,
          clientId: inv.clientId,
          leadId: inv.leadId,
          studentId: inv.studentId,
          party: inv.party as Prisma.InputJsonValue,
          items: items as unknown as Prisma.InputJsonValue,
          notes: clean(input.note),
          issueDate: now,
          issuedAt: now,
          issuedById: actor.id,
          subtotalPaise: input.amountPaise,
          totalPaise: input.amountPaise,
          amountPaidPaise: input.amountPaise,
          paymentMethod: input.method,
          paymentRef: input.reference.trim(),
          paymentDate: input.paidOn,
          createdById: actor.id,
        },
      });
      const snapshot = await buildSnapshot(r, number, now, false, {
        receipt: { purpose: inv.title, againstNumber: inv.number, date: input.paidOn.toISOString(), method: input.method.replace(/_/g, ' ').toLowerCase(), reference: input.reference.trim() },
        disclaimer: `Receipt for a payment against invoice ${inv.number}.`,
      });
      await tx.businessDocument.update({ where: { id: r.id }, data: { snapshot: snapshot as unknown as Prisma.InputJsonValue } });
      const paid = inv.amountPaidPaise + input.amountPaise;
      await tx.businessDocument.update({ where: { id: inv.id }, data: { amountPaidPaise: paid, status: paid >= inv.totalPaise ? 'PAID' : 'PARTIALLY_PAID' } });
      await audit(tx, actor, { action: 'document.payment_recorded', entityType: 'BusinessDocument', entityId: inv.id, after: { receipt: number, amountPaise: input.amountPaise, paidPaise: paid, method: input.method, reference: input.reference.trim() } });
      if (inv.leadId) await leadActivity(tx, inv.leadId, actor, 'DOCUMENT', `Payment ${formatPaise(input.amountPaise, inv.currency)} recorded on ${inv.number} (receipt ${number})`);
      return r;
    },
    { timeout: 20_000 },
  );
  await cachePdf(receipt.id).catch((err) => console.error('[documents] could not store receipt PDF:', err instanceof Error ? err.message : err));
  return receipt;
}

export async function voidDocument(actor: Actor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await lockDoc(tx, id);
    const d = await loadDoc(tx, actor, id);
    assertTypeAccess(actor, d.type);
    if (d.status === 'DRAFT') throw ApiError.conflict('Delete the draft instead');
    if (d.status === 'VOID') throw ApiError.conflict('Already void');
    if (d.type === 'INVOICE' && d.amountPaidPaise > 0) throw ApiError.conflict('Payments were recorded on this invoice. Void its receipts first.');
    if (d.type === 'RECEIPT' && d.sourceId) {
      const inv = await tx.businessDocument.findUniqueOrThrow({ where: { id: d.sourceId } });
      const paid = Math.max(0, inv.amountPaidPaise - d.totalPaise);
      await tx.businessDocument.update({ where: { id: inv.id }, data: { amountPaidPaise: paid, status: paid === 0 ? (inv.sentAt ? 'SENT' : 'ISSUED') : 'PARTIALLY_PAID' } });
    }
    const updated = await tx.businessDocument.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date(), voidReason: reason } });
    await audit(tx, actor, { action: 'document.voided', entityType: 'BusinessDocument', entityId: id, before: { status: d.status }, after: { status: 'VOID' }, reason });
    if (d.leadId) await leadActivity(tx, d.leadId, actor, 'DOCUMENT', `${d.number} voided: ${reason}`);
    return updated;
  });
}

// ===========================================================================
// CRM integration
// ===========================================================================

async function leadActivity(db: Db, leadId: string, actor: Actor, type: string, body: string) {
  await db.leadActivity.create({ data: { leadId, actorId: actor.id, type, body } });
  await db.contactLead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } });
}

const STAGE_ORDER: ContactStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'];
/** Moves a lead forward (never backwards, never out of WON/LOST) and records it on the timeline. */
async function advanceLead(db: Db, leadId: string, actor: Actor, to: ContactStatus, note: string) {
  const lead = await db.contactLead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) return;
  const from = STAGE_ORDER.indexOf(lead.status);
  if (from < 0 || from >= STAGE_ORDER.indexOf(to)) return;
  await db.contactLead.update({ where: { id: leadId }, data: { status: to, ...(to === 'WON' ? { followUpAt: null } : {}) } });
  await db.leadActivity.create({ data: { leadId, actorId: actor.id, type: 'STATUS_CHANGED', body: note, meta: { from: lead.status, to, automatic: true } } });
}

