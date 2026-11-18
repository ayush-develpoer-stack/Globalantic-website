import { Prisma, type ContactLead, type ContactStatus, type LeadPriority } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { nextNumber } from '../lib/counters';
import { canonicalEmail, normalizePhone } from '../lib/identity';
import { orderByFrom } from '../lib/pagination';
import { effectivePermissions } from '../lib/permissions';
import { AfterCommit, notify } from './notification.service';
import { businessRecipients, recordAdminEvent, shouldEmail } from './admin-events.service';
import { landingPath, leadChannel } from '../lib/channel';
import { sendContactAcknowledgement, sendContactNotification, send, layout, esc } from './email.service';

/**
 * Sales CRM for website enquiries (contact_leads).
 *
 * Public side: validated, spam-checked enquiries become leads with a reference, attribution
 * (source / landing page / UTM), duplicate linking, rule-based assignment, a first follow-up date,
 * an acknowledgement email to the enquirer and alerts to the team (email + in-app).
 * Staff side: pipeline stages, priority, assignment, follow-ups, notes and an activity timeline,
 * summary/funnel metrics and CSV export. ADMIN sees every lead; other staff with leads.manage
 * (e.g. SALES) see leads assigned to them plus unassigned ones.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const OPEN_STAGES: ContactStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'IN_PROGRESS'];
const CLOSED_STAGES: ContactStatus[] = ['WON', 'LOST', 'CONVERTED', 'CLOSED'];
const PIPELINE: ContactStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'];
const DUPLICATE_WINDOW_DAYS = 90;
const FIRST_FOLLOW_UP_HOURS = 24;
const STALE_NEW_HOURS = 48;
const STALE_OPEN_DAYS = 7;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const nullable = (v: string | undefined | null) => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

// ===========================================================================
// Public enquiries
// ===========================================================================

export interface EnquiryInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  service?: string;
  budget?: string;
  timeline?: string;
  message: string;
  contactPreference?: string;
  marketingConsent?: boolean;
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

export type EnquiryResult = { spam: true } | { spam: false; id: string; reference: string; duplicate: boolean };

/** Bot signals: honeypot filled, or submitted faster than a person can fill the form. */
function looksLikeSpam(input: EnquiryInput): boolean {
  if (input.website && input.website.trim() !== '') return true;
  if (input.elapsedMs !== undefined && input.elapsedMs < 2500) return true;
  return false;
}

const urlCount = (s: string) => (s.match(/https?:\/\/|www\./gi) ?? []).length;

/** Active staff who may own leads. */
async function canOwnLeads(db: Db, userId: string): Promise<boolean> {
  const u = await db.user.findFirst({ where: { id: userId, status: 'ACTIVE', deletedAt: null }, include: { permissionGrants: { select: { permission: true } } } });
  if (!u) return false;
  return effectivePermissions(u.role, u.permissionGrants.map((g) => g.permission)).includes('leads.manage');
}

async function ruleAssignee(db: Db, service: string | null): Promise<string | null> {
  const rules = await db.leadAssignmentRule.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  const ordered = [
    ...rules.filter((r) => r.service && service && r.service.toLowerCase() === service.toLowerCase()),
    ...rules.filter((r) => !r.service),
  ];
  for (const r of ordered) if (await canOwnLeads(db, r.assigneeId)) return r.assigneeId;
  return null;
}

async function leadManagers(db: Db): Promise<{ id: string; email: string }[]> {
  // Admins (always) — used when a new lead has no owner yet.
  return db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null }, select: { id: true, email: true } });
}

export async function createEnquiry(input: EnquiryInput, meta: { ipHash?: string | null }): Promise<EnquiryResult> {
  if (looksLikeSpam(input)) {
    console.warn('[crm] enquiry dropped by spam checks');
    return { spam: true };
  }
  if (urlCount(input.message) > 3) {
    throw ApiError.validation([{ field: 'message', message: 'Please include at most 3 links. You can share more after we reply.' }]);
  }

  const emailNormalized = canonicalEmail(input.email);
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
  const service = nullable(input.service);
  const after = new AfterCommit();

  const result = await prisma.$transaction(async (tx) => {
    // Repeat enquiry from the same person within the window -> link to the first open lead.
    const original = await tx.contactLead.findFirst({
      where: {
        duplicateOfId: null,
        status: { in: OPEN_STAGES },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86_400_000) },
        OR: [{ emailNormalized }, ...(phoneNormalized ? [{ phoneNormalized }] : [])],
      },
      orderBy: { createdAt: 'asc' },
    });
    const assignedToId = original?.assignedToId ?? (await ruleAssignee(tx, service));
    const now = new Date();
    const lead = await tx.contactLead.create({
      data: {
        reference: await nextNumber(tx, 'LEAD'),
        name: input.name.trim(),
        email: input.email.trim(),
        phone: nullable(input.phone),
        company: nullable(input.company),
        service,
        budget: nullable(input.budget),
        timeline: nullable(input.timeline),
        message: input.message.trim(),
        contactPreference: nullable(input.contactPreference),
        marketingConsent: Boolean(input.marketingConsent),
        consentAt: input.marketingConsent ? now : null,
        source: nullable(input.source) ?? 'website',
        landingPage: nullable(input.landingPage),
        referrer: nullable(input.referrer),
        utmSource: nullable(input.utmSource),
        utmMedium: nullable(input.utmMedium),
        utmCampaign: nullable(input.utmCampaign),
        utmTerm: nullable(input.utmTerm),
        utmContent: nullable(input.utmContent),
        emailNormalized,
        phoneNormalized,
        ipHash: meta.ipHash ?? null,
        duplicateOfId: original?.id ?? null,
        assignedToId,
        followUpAt: original ? null : new Date(now.getTime() + FIRST_FOLLOW_UP_HOURS * 3_600_000),
        lastActivityAt: now,
      },
    });
    await tx.leadActivity.create({
      data: { leadId: lead.id, type: 'CREATED', body: 'Enquiry received from the website', meta: { source: lead.source, utmSource: lead.utmSource, utmCampaign: lead.utmCampaign, assignedBy: assignedToId ? (original ? 'existing_owner' : 'rule') : null } },
    });
    if (original) {
      await tx.leadActivity.create({ data: { leadId: original.id, type: 'REPEAT_ENQUIRY', body: lead.message.slice(0, 2000), meta: { leadId: lead.id, reference: lead.reference, service } } });
      await tx.contactLead.update({ where: { id: original.id }, data: { lastActivityAt: now } });
    }

    // Admin notification centre: the owner (+ admins) once assigned, every lead manager while unassigned.
    await recordAdminEvent(
      tx,
      {
        dedupeKey: `lead.created:${lead.id}`,
        category: 'lead',
        type: 'LEAD',
        severity: original ? 'info' : 'important',
        title: original ? `Repeat enquiry: ${lead.name}` : `New lead: ${lead.name}${service ? ` (${service})` : ''}`,
        body: `${lead.reference}${service ? ` · ${service}` : ''} · source: ${lead.source}`,
        link: `/leads/${original?.id ?? lead.id}`,
        entityType: 'ContactLead',
        entityId: lead.id,
        restrictTo: assignedToId ? [assignedToId] : undefined,
        email: false, // the dedicated lead email below carries the full enquiry
      },
      after,
    );
    const ownerEmail = assignedToId ? (await tx.user.findUnique({ where: { id: assignedToId }, select: { email: true } }))?.email : null;
    if (await shouldEmail('lead', original ? 'info' : 'important', tx)) {
      const teamTo = [...new Set([...(await businessRecipients(tx)), ...(ownerEmail ? [ownerEmail] : [])])];
      after.add(() => sendContactNotification({ ...lead, duplicateOf: original?.reference ?? null }, teamTo));
    } else if (ownerEmail) {
      after.add(() => sendContactNotification({ ...lead, duplicateOf: original?.reference ?? null }, ownerEmail));
    }
    after.add(() => sendContactAcknowledgement({ name: lead.name, email: lead.email, service, reference: lead.reference }));
    return { spam: false as const, id: lead.id, reference: lead.reference!, duplicate: Boolean(original) };
  });
  // Emails go out after the lead is safely stored; a transport failure never loses the lead.
  await after.flush();
  return result;
}

export async function trackEvent(input: { type: string; label?: string; page?: string; service?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string }) {
  await prisma.marketingEvent.create({
    data: {
      type: input.type,
      label: nullable(input.label),
      page: nullable(input.page?.split('?')[0]),
      service: nullable(input.service),
      utmSource: nullable(input.utmSource),
      utmMedium: nullable(input.utmMedium),
      utmCampaign: nullable(input.utmCampaign),
    },
  });
}

// ===========================================================================
// Staff: scope, list, detail
// ===========================================================================

const isAdmin = (actor: Actor) => actor.role === 'ADMIN';

/** Non-admin staff work on leads assigned to them and on unassigned ones. */
function scopeWhere(actor: Actor): Prisma.ContactLeadWhereInput {
  return isAdmin(actor) ? {} : { OR: [{ assignedToId: actor.id }, { assignedToId: null }] };
}

async function loadLead(db: Db, actor: Actor, id: string) {
  const lead = await db.contactLead.findFirst({ where: { id, ...scopeWhere(actor) } });
  if (!lead) throw ApiError.notFound('Lead not found');
  return lead;
}

export interface LeadListQuery {
  status?: ContactStatus;
  priority?: LeadPriority;
  assignedToId?: string;
  service?: string;
  source?: string;
  utmCampaign?: string;
  search?: string;
  followUp?: 'overdue' | 'today' | 'upcoming';
  includeDuplicates?: boolean;
  from?: string;
  to?: string;
  sort?: string;
  skip: number;
  take: number;
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00+05:30`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999+05:30`) } : {}),
  };
}

function listWhere(actor: Actor, q: Omit<LeadListQuery, 'skip' | 'take' | 'sort'>): Prisma.ContactLeadWhereInput {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const created = dateRange(q.from, q.to);
  return {
    AND: [
      scopeWhere(actor),
      q.includeDuplicates ? {} : { duplicateOfId: null },
      q.status ? { status: q.status } : {},
      q.priority ? { priority: q.priority } : {},
      q.assignedToId === 'none' ? { assignedToId: null } : q.assignedToId === 'me' ? { assignedToId: actor.id } : q.assignedToId ? { assignedToId: q.assignedToId } : {},
      q.service ? { service: { equals: q.service, mode: 'insensitive' } } : {},
      q.source ? { source: { startsWith: q.source, mode: 'insensitive' } } : {},
      q.utmCampaign ? { utmCampaign: { equals: q.utmCampaign, mode: 'insensitive' } } : {},
      created ? { createdAt: created } : {},
      q.followUp === 'overdue' ? { followUpAt: { lt: now }, status: { in: OPEN_STAGES } } : {},
      q.followUp === 'today' ? { followUpAt: { gte: now, lte: endOfToday }, status: { in: OPEN_STAGES } } : {},
      q.followUp === 'upcoming' ? { followUpAt: { gt: endOfToday }, status: { in: OPEN_STAGES } } : {},
      q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { company: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search } },
              { reference: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
}

const LIST_SELECT = {
  id: true,
  reference: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  service: true,
  budget: true,
  timeline: true,
  status: true,
  priority: true,
  source: true,
  utmSource: true,
  utmCampaign: true,
  followUpAt: true,
  lastActivityAt: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { duplicates: true } },
} satisfies Prisma.ContactLeadSelect;

export async function listLeads(actor: Actor, q: LeadListQuery) {
  const where = listWhere(actor, q);
  const orderBy = orderByFrom<Prisma.ContactLeadOrderByWithRelationInput>(
    q.sort,
    {
      createdAt: (d) => ({ createdAt: d }),
      followUpAt: (d) => ({ followUpAt: { sort: d, nulls: 'last' } }),
      name: (d) => ({ name: d }),
      status: (d) => ({ status: d }),
      priority: (d) => ({ priority: d }),
      lastActivityAt: (d) => ({ lastActivityAt: { sort: d, nulls: 'last' } }),
    },
    { createdAt: 'desc' },
  );
  const [items, total] = await Promise.all([prisma.contactLead.findMany({ where, orderBy, skip: q.skip, take: q.take, select: LIST_SELECT }), prisma.contactLead.count({ where })]);
  return { items, total };
}

export async function getLead(actor: Actor, id: string) {
  await loadLead(prisma, actor, id);
  const lead = await prisma.contactLead.findUniqueOrThrow({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      duplicateOf: { select: { id: true, reference: true, name: true, status: true } },
      duplicates: { orderBy: { createdAt: 'desc' }, select: { id: true, reference: true, createdAt: true, service: true, message: true, source: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { id: true, name: true } } } },
    },
  });
  const { ipHash, emailNormalized, phoneNormalized, ...safe } = lead;
  void ipHash;
  void emailNormalized;
  void phoneNormalized;
  return safe;
}

// ===========================================================================
// Staff: changes
// ===========================================================================

export interface LeadUpdate {
  status?: ContactStatus;
  priority?: LeadPriority;
  assignedToId?: string | null;
  followUpAt?: Date | null;
  service?: string | null;
  budget?: string | null;
  timeline?: string | null;
  company?: string | null;
  phone?: string | null;
  note?: string;
}

export async function updateLead(actor: Actor, id: string, input: LeadUpdate) {
  const after = new AfterCommit();
  await prisma.$transaction(async (tx) => {
    const before = await loadLead(tx, actor, id);
    const data: Prisma.ContactLeadUncheckedUpdateInput = {};
    const acts: { type: string; body?: string | null; meta?: Prisma.InputJsonValue }[] = [];

    if (input.status && input.status !== before.status) {
      data.status = input.status;
      if (CLOSED_STAGES.includes(input.status)) data.followUpAt = null;
      acts.push({ type: 'STATUS_CHANGED', body: input.note ?? null, meta: { from: before.status, to: input.status } });
    } else if (input.note) {
      acts.push({ type: 'NOTE', body: input.note });
    }
    if (input.priority && input.priority !== before.priority) {
      data.priority = input.priority;
      acts.push({ type: 'PRIORITY_CHANGED', meta: { from: before.priority, to: input.priority } });
    }
    if (input.assignedToId !== undefined && input.assignedToId !== before.assignedToId) {
      if (input.assignedToId) {
        if (!isAdmin(actor) && input.assignedToId !== actor.id) throw ApiError.forbidden('You can only assign leads to yourself');
        if (!(await canOwnLeads(tx, input.assignedToId))) throw ApiError.validation([{ field: 'assignedToId', message: 'This person cannot own leads' }]);
      } else if (!isAdmin(actor) && before.assignedToId !== actor.id) {
        throw ApiError.forbidden('Only an admin can unassign this lead');
      }
      data.assignedToId = input.assignedToId;
      acts.push({ type: 'ASSIGNED', meta: { from: before.assignedToId, to: input.assignedToId } });
      if (input.assignedToId && input.assignedToId !== actor.id) {
        await notify(tx, input.assignedToId, { type: 'LEAD', title: `Lead assigned to you: ${before.name}`, body: `${before.reference ?? ''} ${before.service ?? ''}`.trim(), link: `${env.adminPortalUrl}/leads/${id}` }, after);
      }
    }
    if (input.followUpAt !== undefined && (input.followUpAt?.getTime() ?? null) !== (before.followUpAt?.getTime() ?? null)) {
      data.followUpAt = input.followUpAt;
      acts.push({ type: 'FOLLOW_UP_SET', meta: { at: input.followUpAt?.toISOString() ?? null } });
    }
    const details: Record<string, unknown> = {};
    for (const k of ['service', 'budget', 'timeline', 'company', 'phone'] as const) {
      if (input[k] !== undefined && (input[k] ?? null) !== (before[k] ?? null)) {
        data[k] = input[k];
        details[k] = { from: before[k], to: input[k] };
      }
    }
    if (input.phone !== undefined) data.phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
    if (Object.keys(details).length) acts.push({ type: 'DETAILS_UPDATED', meta: details as Prisma.InputJsonValue });
    if (!acts.length) return;

    data.lastActivityAt = new Date();
    await tx.contactLead.update({ where: { id }, data });
    for (const a of acts) await tx.leadActivity.create({ data: { leadId: id, actorId: actor.id, type: a.type, body: a.body ?? null, meta: a.meta } });
    await audit(tx, actor, { action: 'lead.updated', entityType: 'ContactLead', entityId: id, before: { status: before.status, priority: before.priority, assignedToId: before.assignedToId }, after: { status: data.status ?? before.status, priority: data.priority ?? before.priority, assignedToId: data.assignedToId === undefined ? before.assignedToId : data.assignedToId } });
  });
  await after.flush();
  return getLead(actor, id);
}

export async function addNote(actor: Actor, id: string, body: string, type: 'NOTE' | 'CONSULTATION' | 'CALL' | 'EMAIL' | 'WHATSAPP' = 'NOTE') {
  await prisma.$transaction(async (tx) => {
    await loadLead(tx, actor, id);
    await tx.leadActivity.create({ data: { leadId: id, actorId: actor.id, type, body } });
    await tx.contactLead.update({ where: { id }, data: { lastActivityAt: new Date() } });
  });
  return getLead(actor, id);
}

export async function createManualLead(actor: Actor, input: { name: string; email: string; phone?: string; company?: string; service?: string; budget?: string; timeline?: string; message: string; source: string; priority: LeadPriority; assignedToId?: string }) {
  const assignedToId = input.assignedToId ?? (isAdmin(actor) ? null : actor.id);
  if (assignedToId && !isAdmin(actor) && assignedToId !== actor.id) throw ApiError.forbidden('You can only assign leads to yourself');
  return prisma.$transaction(async (tx) => {
    if (assignedToId && !(await canOwnLeads(tx, assignedToId))) throw ApiError.validation([{ field: 'assignedToId', message: 'This person cannot own leads' }]);
    const now = new Date();
    const lead = await tx.contactLead.create({
      data: {
        reference: await nextNumber(tx, 'LEAD'),
        name: input.name,
        email: input.email,
        phone: nullable(input.phone),
        company: nullable(input.company),
        service: nullable(input.service),
        budget: nullable(input.budget),
        timeline: nullable(input.timeline),
        message: input.message,
        source: input.source,
        priority: input.priority,
        assignedToId,
        emailNormalized: canonicalEmail(input.email),
        phoneNormalized: input.phone ? normalizePhone(input.phone) : null,
        followUpAt: new Date(now.getTime() + FIRST_FOLLOW_UP_HOURS * 3_600_000),
        lastActivityAt: now,
      },
    });
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId: actor.id, type: 'CREATED', body: 'Lead added manually', meta: { source: input.source } } });
    await audit(tx, actor, { action: 'lead.created', entityType: 'ContactLead', entityId: lead.id, after: { source: input.source } });
    return lead;
  });
}

export async function assignees() {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', deletedAt: null, role: { in: ['ADMIN', 'SALES', 'EDITOR', 'FINANCE', 'HR'] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, permissionGrants: { select: { permission: true } } },
  });
  return users
    .filter((u) => effectivePermissions(u.role, u.permissionGrants.map((g) => g.permission)).includes('leads.manage'))
    .map(({ permissionGrants, ...u }) => {
      void permissionGrants;
      return u;
    });
}

export async function getRules() {
  return prisma.leadAssignmentRule.findMany({ orderBy: { createdAt: 'asc' }, include: { assignee: { select: { id: true, name: true } } } });
}

export async function setRules(actor: Actor, rules: { service?: string | null; assigneeId: string; active: boolean }[]) {
  return prisma.$transaction(async (tx) => {
    for (const [i, r] of rules.entries()) {
      if (!(await canOwnLeads(tx, r.assigneeId))) throw ApiError.validation([{ field: `rules.${i}.assigneeId`, message: 'This person cannot own leads' }]);
    }
    await tx.leadAssignmentRule.deleteMany({});
    // createdAt order = rule order
    for (const [i, r] of rules.entries()) {
      await tx.leadAssignmentRule.create({ data: { service: nullable(r.service ?? null), assigneeId: r.assigneeId, active: r.active, createdAt: new Date(Date.now() + i) } });
    }
    await audit(tx, actor, { action: 'lead.rules_updated', entityType: 'LeadAssignmentRule', entityId: 'all', after: { count: rules.length } });
    return tx.leadAssignmentRule.findMany({ orderBy: { createdAt: 'asc' }, include: { assignee: { select: { id: true, name: true } } } });
  });
}

// ===========================================================================
// Reports, funnel, export, reminders
// ===========================================================================

const RANK = new Map(PIPELINE.map((s, i) => [s, i]));
/** Highest pipeline stage a lead ever reached (current stage or any recorded stage change). */
function reachedRank(lead: { status: ContactStatus; activities: { type: string; meta: Prisma.JsonValue }[] }): number {
  let r = lead.status === 'CONVERTED' ? RANK.get('WON')! : RANK.get(lead.status) ?? 0;
  for (const a of lead.activities) {
    if (a.type !== 'STATUS_CHANGED') continue;
    const to = (a.meta as { to?: ContactStatus } | null)?.to;
    if (to && RANK.has(to)) r = Math.max(r, RANK.get(to)!);
  }
  return r;
}

/** Counts rows per key (and how many of them were won), most frequent first. */
function tally<T>(rows: T[], key: (r: T) => string, isWon: (r: T) => boolean): [string, number, number][] {
  const m = new Map<string, [number, number]>();
  for (const r of rows) {
    const k = key(r);
    const c = m.get(k) ?? [0, 0];
    c[0] += 1;
    if (isWon(r)) c[1] += 1;
    m.set(k, c);
  }
  return [...m.entries()].map(([k, [n, w]]) => [k, n, w] as [string, number, number]).sort((a, b) => b[1] - a[1]);
}

export async function summary(actor: Actor, q: { from?: string; to?: string }) {
  const created = dateRange(q.from, q.to);
  const base: Prisma.ContactLeadWhereInput = { AND: [scopeWhere(actor), { duplicateOfId: null }, created ? { createdAt: created } : {}] };
  const now = new Date();
  const [byStatus, bySource, byCampaign, byService, overdue, staleNew, staleOpen, repeat, leads, events] = await Promise.all([
    prisma.contactLead.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.contactLead.groupBy({ by: ['source'], where: base, _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 20 }),
    prisma.contactLead.groupBy({ by: ['utmSource', 'utmCampaign'], where: { AND: [base, { utmSource: { not: null } }] }, _count: { _all: true }, orderBy: { _count: { utmSource: 'desc' } }, take: 20 }),
    prisma.contactLead.groupBy({ by: ['service'], where: base, _count: { _all: true }, orderBy: { _count: { service: 'desc' } }, take: 20 }),
    prisma.contactLead.count({ where: { AND: [scopeWhere(actor), { duplicateOfId: null }, { status: { in: OPEN_STAGES } }, { followUpAt: { lt: now } }] } }),
    prisma.contactLead.count({ where: { AND: [scopeWhere(actor), { duplicateOfId: null }, { status: 'NEW' }, { createdAt: { lt: hoursAgo(STALE_NEW_HOURS) } }] } }),
    prisma.contactLead.count({ where: { AND: [scopeWhere(actor), { duplicateOfId: null }, { status: { in: OPEN_STAGES.filter((s) => s !== 'NEW') } }, { OR: [{ lastActivityAt: { lt: hoursAgo(STALE_OPEN_DAYS * 24) } }, { lastActivityAt: null }] }] } }),
    prisma.contactLead.count({ where: { AND: [scopeWhere(actor), { duplicateOfId: { not: null } }, created ? { createdAt: created } : {}] } }),
    prisma.contactLead.findMany({ where: base, select: { status: true, referrer: true, utmSource: true, utmMedium: true, landingPage: true, activities: { where: { type: { in: ['STATUS_CHANGED', 'CONSULTATION'] } }, select: { type: true, meta: true } } } }),
    prisma.marketingEvent.groupBy({ by: ['type'], where: created ? { createdAt: created } : {}, _count: { _all: true } }),
  ]);
  const count = (t: string) => events.find((e) => e.type === t)?._count._all ?? 0;
  const reached = (stage: ContactStatus) => leads.filter((l) => reachedRank(l) >= RANK.get(stage)!).length;
  const consultations = leads.filter((l) => l.activities.some((a) => a.type === 'CONSULTATION')).length;
  const won = leads.filter((l) => l.status === 'WON' || l.status === 'CONVERTED').length;
  const channels = tally(leads, (l) => leadChannel(l), (l) => l.status === 'WON' || l.status === 'CONVERTED');
  const landingPages = tally(leads, (l) => landingPath(l.landingPage), (l) => l.status === 'WON' || l.status === 'CONVERTED').slice(0, 15);
  const lost = leads.filter((l) => l.status === 'LOST' || l.status === 'CLOSED').length;
  return {
    range: { from: q.from ?? null, to: q.to ?? null },
    totals: {
      leads: leads.length,
      repeatEnquiries: repeat,
      open: leads.filter((l) => OPEN_STAGES.includes(l.status)).length,
      won,
      lost,
      winRate: won + lost ? Math.round((won * 1000) / (won + lost)) / 10 : null,
      overdueFollowUps: overdue,
      staleNew,
      staleOpen,
    },
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    bySource: bySource.map((s) => ({ source: s.source ?? 'unknown', leads: s._count._all })),
    byCampaign: byCampaign.map((s) => ({ utmSource: s.utmSource, utmCampaign: s.utmCampaign, leads: s._count._all })),
    byService: byService.map((s) => ({ service: s.service ?? 'Not specified', leads: s._count._all })),
    // Derived from the recorded referrer/UTM of each enquiry (best effort; see lib/channel.ts).
    byChannel: channels.map(([channel, n, won]) => ({ channel, leads: n, won })),
    byLandingPage: landingPages.map(([page, n, won]) => ({ page, leads: n, won })),
    // Visitors and service-page views are not measured (no analytics provider is configured).
    funnel: [
      { stage: 'Visitors', value: null, note: 'Not measured — no analytics provider configured' },
      { stage: 'CTA clicks', value: count('cta_click'), note: 'Anonymous click counter' },
      { stage: 'WhatsApp clicks', value: count('whatsapp_click'), note: 'Opens a chat; messages are not synced to the CRM' },
      { stage: 'Enquiries', value: leads.length },
      { stage: 'Qualified', value: reached('QUALIFIED') },
      { stage: 'Consultation', value: consultations, note: 'Leads with a logged consultation' },
      { stage: 'Proposal', value: reached('PROPOSAL_SENT') },
      { stage: 'Customer', value: won },
    ],
  };
}

export async function exportLeads(actor: Actor, q: Omit<LeadListQuery, 'skip' | 'take'>) {
  const rows = await prisma.contactLead.findMany({ where: listWhere(actor, q), orderBy: { createdAt: 'desc' }, take: 5000, include: { assignedTo: { select: { name: true } } } });
  await audit(prisma, actor, { action: 'report.exported', entityType: 'Report', entityId: 'leads', after: { rows: rows.length, filters: { ...q, search: q.search ? '[set]' : undefined } } });
  return rows.map((l: ContactLead & { assignedTo: { name: string } | null }) => ({
    reference: l.reference ?? '',
    created: l.createdAt.toISOString(),
    name: l.name,
    email: l.email,
    phone: l.phone ?? '',
    company: l.company ?? '',
    service: l.service ?? '',
    budget: l.budget ?? '',
    timeline: l.timeline ?? '',
    stage: l.status,
    priority: l.priority,
    owner: l.assignedTo?.name ?? '',
    followUp: l.followUpAt?.toISOString() ?? '',
    source: l.source ?? '',
    utmSource: l.utmSource ?? '',
    utmMedium: l.utmMedium ?? '',
    utmCampaign: l.utmCampaign ?? '',
    landingPage: l.landingPage ?? '',
    marketingConsent: l.marketingConsent ? 'yes' : 'no',
    repeatOf: l.duplicateOfId ?? '',
  }));
}

/**
 * Follow-up reminders and stale-lead alerts (in-app + email). Idempotent per lead per ~20 h.
 * Run by a scheduler (POST /api/crm/reminders/dispatch with CRON_SECRET) or by an admin from the CRM.
 */
export async function dispatchReminders(actor: Actor | null) {
  const now = new Date();
  const recent = hoursAgo(20);
  const due = await prisma.contactLead.findMany({
    where: {
      duplicateOfId: null,
      status: { in: OPEN_STAGES },
      OR: [{ followUpAt: { lt: now } }, { status: 'NEW', createdAt: { lt: hoursAgo(STALE_NEW_HOURS) } }],
      NOT: { activities: { some: { type: 'REMINDER_SENT', createdAt: { gte: recent } } } },
    },
    take: 500,
    include: { assignedTo: { select: { id: true, email: true, name: true } } },
  });
  const admins = await leadManagers(prisma);
  const after = new AfterCommit();
  let sent = 0;
  for (const lead of due) {
    const overdue = Boolean(lead.followUpAt && lead.followUpAt < now);
    const recipients = lead.assignedTo ? [lead.assignedTo] : admins;
    await prisma.$transaction(async (tx) => {
      for (const r of recipients) {
        await notify(tx, r.id, {
          type: 'LEAD_REMINDER',
          title: overdue ? `Follow-up due: ${lead.name}` : `Uncontacted lead: ${lead.name}`,
          body: `${lead.reference ?? ''} · ${lead.status.replace('_', ' ').toLowerCase()}${lead.followUpAt ? ` · due ${lead.followUpAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`,
          link: `${env.adminPortalUrl}/leads/${lead.id}`,
        });
      }
      await tx.leadActivity.create({ data: { leadId: lead.id, actorId: actor?.id ?? null, type: 'REMINDER_SENT', meta: { overdue, to: recipients.map((r) => r.id) } } });
    });
    const emails = recipients.map((r) => r.email);
    after.add(() =>
      send({
        to: emails,
        subject: `${overdue ? 'Follow-up due' : 'Uncontacted lead'}: ${lead.name}${lead.reference ? ` (${lead.reference})` : ''}`,
        html: layout(overdue ? 'Follow-up due' : 'Lead waiting for first contact', `<p style="font-size:14px;">${esc(lead.name)}${lead.service ? ` — ${esc(lead.service)}` : ''}</p><p><a href="${esc(`${env.adminPortalUrl}/leads/${lead.id}`)}" style="color:#6D22E6;font-weight:600;">Open in the CRM</a></p>`),
      }),
    );
    sent += 1;
  }
  await after.flush();
  if (actor) await audit(prisma, actor, { action: 'lead.reminders_dispatched', entityType: 'ContactLead', entityId: 'reminders', after: { leads: sent } });
  return { leads: sent };
}
