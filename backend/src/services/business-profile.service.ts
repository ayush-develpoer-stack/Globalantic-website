import type { BusinessDocumentType, BusinessProfile, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { audit, type Actor } from '../lib/audit';
import type { CompanySnapshot } from '../lib/pdf/documents';

/**
 * Company details and numbering rules for generated documents (single row, id "default").
 * Fields start empty and are filled in by an authorised admin; renderers omit blank fields,
 * so no GSTIN, registration number or signatory is ever printed unless it was configured.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface NumberingRule {
  prefix: string;
  /** Indian financial year (Apr–Mar) in the number, e.g. QTN/2026-27/0001; otherwise the calendar year */
  financialYear: boolean;
  padding: number;
}

export const DEFAULT_NUMBERING: Record<BusinessDocumentType, NumberingRule> = {
  QUOTATION: { prefix: 'QTN', financialYear: true, padding: 4 },
  PROPOSAL: { prefix: 'PRP', financialYear: true, padding: 4 },
  AGREEMENT: { prefix: 'AGR', financialYear: true, padding: 4 },
  INVOICE: { prefix: 'INV', financialYear: true, padding: 4 },
  RECEIPT: { prefix: 'RCP', financialYear: true, padding: 4 },
};

export async function getProfile(db: Db = prisma): Promise<BusinessProfile> {
  return db.businessProfile.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
}

export function numberingRules(p: BusinessProfile): Record<BusinessDocumentType, NumberingRule> {
  const saved = (p.numbering ?? {}) as Partial<Record<BusinessDocumentType, Partial<NumberingRule>>>;
  const out = { ...DEFAULT_NUMBERING };
  for (const t of Object.keys(out) as BusinessDocumentType[]) out[t] = { ...out[t], ...(saved[t] ?? {}) };
  return out;
}

/** GST is applied only when the company is registered and a GSTIN is on file. */
export const gstAvailable = (p: BusinessProfile) => p.gstRegistered && /^[0-9A-Z]{15}$/.test(p.gstin);

/** What is still missing before documents look complete (shown in the admin, never auto-filled). */
export function profileGaps(p: BusinessProfile): string[] {
  const gaps: string[] = [];
  if (!p.legalName) gaps.push('Legal name');
  if (!p.addressLine1 || !p.city || !p.state) gaps.push('Registered address');
  if (!p.email) gaps.push('Contact email');
  if (!p.signatoryName) gaps.push('Authorised signatory');
  if (p.gstRegistered && !gstAvailable(p)) gaps.push('Valid GSTIN (GST is switched on but no valid GSTIN is saved)');
  return gaps;
}

export function companySnapshot(p: BusinessProfile): CompanySnapshot {
  return {
    tradeName: p.tradeName,
    legalName: p.legalName,
    addressLines: [p.addressLine1, p.addressLine2, [p.city, p.state, p.postalCode].filter(Boolean).join(' '), p.country && p.country !== 'India' ? p.country : ''].filter(Boolean),
    stateCode: p.stateCode,
    state: p.state,
    email: p.email,
    phone: p.phone,
    website: p.website,
    gstRegistered: gstAvailable(p),
    gstin: gstAvailable(p) ? p.gstin : '',
    pan: p.pan,
    registrationNo: p.registrationNo,
    bankDetails: p.bankDetails,
    upiId: p.upiId,
    signatoryName: p.signatoryName,
    signatoryTitle: p.signatoryTitle,
    footerNote: p.footerNote,
  };
}

export type ProfileInput = Partial<Omit<BusinessProfile, 'id' | 'updatedAt' | 'updatedById' | 'numbering'>> & { numbering?: Partial<Record<BusinessDocumentType, NumberingRule>> };

export async function updateProfile(actor: Actor, input: ProfileInput) {
  return prisma.$transaction(async (tx) => {
    const before = await getProfile(tx);
    const { numbering, ...fields } = input;
    const merged = numbering ? { ...numberingRules(before), ...numbering } : undefined;
    const after = await tx.businessProfile.update({
      where: { id: 'default' },
      data: { ...fields, ...(merged ? { numbering: merged as unknown as Prisma.InputJsonValue } : {}), updatedById: actor.id },
    });
    const changed = Object.keys(input).filter((k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
    await audit(tx, actor, {
      action: 'business_profile.updated',
      entityType: 'BusinessProfile',
      entityId: 'default',
      before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])) as Prisma.InputJsonValue,
      after: Object.fromEntries(changed.map((k) => [k, (after as Record<string, unknown>)[k]])) as Prisma.InputJsonValue,
    });
    return { ...after, gaps: profileGaps(after), gstAvailable: gstAvailable(after), numbering: numberingRules(after) };
  });
}

/** Indian financial year label for a date (IST), e.g. 2026-10-16 -> "2026-27", 2027-02-01 -> "2026-27". */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Next gap-free number for a document type under the configured rule (row-locked counter). */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, type: BusinessDocumentType, profile: BusinessProfile, date = new Date()): Promise<string> {
  const rule = numberingRules(profile)[type];
  const period = rule.financialYear ? financialYear(date) : String(new Date(date.getTime() + 330 * 60_000).getUTCFullYear());
  const key = `DOC:${rule.prefix}/${period}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "document_counters" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "document_counters"."value" + 1
    RETURNING "value"`;
  return `${rule.prefix}/${period}/${String(rows[0].value).padStart(rule.padding, '0')}`;
}
