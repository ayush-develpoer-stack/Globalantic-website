'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Textarea, formatINR, rupeesToPaise } from '@globalantic/ui';
import { paiseToRupees } from './admin';
import s from './admin.module.css';

type Row = Record<string, any>;

export const DOC_TYPE_LABEL: Record<string, string> = {
  QUOTATION: 'Quotation',
  PROPOSAL: 'Proposal',
  AGREEMENT: 'Agreement',
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
};
export const docTypeOptions = Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({ value, label }));
export const DOC_STATUSES = ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'DECLINED', 'SIGNED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'SUPERSEDED'];
export const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

// --- Party ---------------------------------------------------------------------------------------

export interface PartyForm {
  name: string;
  company: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
}

export const emptyParty: PartyForm = { name: '', company: '', email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', stateCode: '', postalCode: '', country: 'India', gstin: '' };

export function partyFromRow(p: Row | null | undefined): PartyForm {
  const out = { ...emptyParty };
  if (!p) return out;
  for (const k of Object.keys(out) as (keyof PartyForm)[]) out[k] = p[k] ?? out[k] ?? '';
  return out;
}

/** Empty strings become null so optional fields are cleared on the server. */
export function partyToApi(p: PartyForm): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(p)) out[k] = v.trim() === '' ? null : v.trim();
  out.name = p.name.trim();
  out.email = p.email.trim();
  return out;
}

export function PartyFields({ value, onChange, errors = {}, prefix = '' }: { value: PartyForm; onChange: (v: PartyForm) => void; errors?: Record<string, string>; prefix?: string }) {
  const f = (k: keyof PartyForm, label: string, extra: Row = {}) => (
    <Input label={label} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} error={errors[`${prefix}${k}`]} {...extra} />
  );
  return (
    <div className={s.formGrid}>
      {f('name', 'Contact name', { required: true, maxLength: 160 })}
      {f('company', 'Company', { maxLength: 160 })}
      {f('email', 'Email', { type: 'email', required: true, maxLength: 200 })}
      {f('phone', 'Phone', { maxLength: 30 })}
      {f('addressLine1', 'Address line 1', { maxLength: 200 })}
      {f('addressLine2', 'Address line 2', { maxLength: 200 })}
      {f('city', 'City', { maxLength: 100 })}
      {f('state', 'State', { maxLength: 100 })}
      {f('stateCode', 'GST state code', { maxLength: 2, inputMode: 'numeric', hint: '2 digits, e.g. 23 for Madhya Pradesh. Needed for GST place of supply.' })}
      {f('postalCode', 'PIN code', { maxLength: 12 })}
      {f('country', 'Country', { maxLength: 60 })}
      {f('gstin', 'Client GSTIN (if any)', { maxLength: 15 })}
    </div>
  );
}

// --- Line items ----------------------------------------------------------------------------------

export interface LineForm {
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  gst: string;
  sac: string;
}

export const emptyLine = (gstPercent = ''): LineForm => ({ description: '', quantity: '1', rate: '', discount: '', gst: gstPercent, sac: '' });

export function linesFromApi(items: Row[] | null | undefined): LineForm[] {
  return (items ?? []).map((it) => ({
    description: it.description ?? '',
    quantity: String(it.quantity ?? 1),
    rate: paiseToRupees(it.unitPaise),
    discount: it.discountPaise ? paiseToRupees(it.discountPaise) : '',
    gst: it.taxRateBp ? String(it.taxRateBp / 100) : '',
    sac: it.sac ?? '',
  }));
}

export function linesToApi(lines: LineForm[]): { items: Row[]; error: string | null } {
  const items: Row[] = [];
  for (const [i, l] of lines.entries()) {
    if (!l.description.trim() && !l.rate.trim()) continue;
    const quantity = Number(l.quantity);
    const unitPaise = rupeesToPaise(l.rate || '0');
    const discountPaise = l.discount.trim() ? rupeesToPaise(l.discount) : 0;
    const taxRateBp = l.gst.trim() ? Math.round(Number(l.gst) * 100) : 0;
    if (!l.description.trim()) return { items, error: `Line ${i + 1}: add a description` };
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.round(quantity * 100) !== quantity * 100) return { items, error: `Line ${i + 1}: quantity must be positive with at most 2 decimals` };
    if (!Number.isFinite(unitPaise) || unitPaise < 0) return { items, error: `Line ${i + 1}: enter a valid rate` };
    if (!Number.isFinite(discountPaise) || discountPaise < 0) return { items, error: `Line ${i + 1}: enter a valid discount` };
    if (!Number.isFinite(taxRateBp) || taxRateBp < 0 || taxRateBp > 2800) return { items, error: `Line ${i + 1}: GST must be between 0 and 28%` };
    items.push({ description: l.description.trim(), quantity, unitPaise, ...(discountPaise ? { discountPaise } : {}), ...(taxRateBp ? { taxRateBp } : {}), ...(l.sac.trim() ? { sac: l.sac.trim() } : {}) });
  }
  return { items, error: null };
}

/** Running estimate while editing. The saved and issued totals always come from the server. */
function estimate(lines: LineForm[], gst: boolean) {
  let sub = 0;
  let tax = 0;
  for (const l of lines) {
    const q = Number(l.quantity) || 0;
    const gross = Math.round(q * (rupeesToPaise(l.rate || '0') || 0));
    const taxable = Math.max(0, gross - (rupeesToPaise(l.discount || '0') || 0));
    sub += taxable;
    if (gst) tax += Math.round((taxable * Math.round((Number(l.gst) || 0) * 100)) / 10_000);
  }
  return { sub, tax, total: sub + tax };
}

export function LineItemsEditor({ lines, onChange, showGst }: { lines: LineForm[]; onChange: (l: LineForm[]) => void; showGst: boolean }) {
  const set = (i: number, patch: Partial<LineForm>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const est = estimate(lines, showGst);
  return (
    <div className={s.stackSm}>
      {lines.map((l, i) => (
        <div key={i} className={s.moduleCard}>
          <div className={s.rowBetween}>
            <span className={s.strong}>Item {i + 1}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
              <Trash2 size={16} aria-hidden /> Remove
            </Button>
          </div>
          <Textarea label="Description" rows={2} maxLength={1000} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
          <div className={s.formGrid}>
            <Input label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
            <Input label="Rate (₹)" inputMode="decimal" value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} />
            <Input label="Discount (₹, optional)" inputMode="decimal" value={l.discount} onChange={(e) => set(i, { discount: e.target.value })} />
            {showGst && <Input label="GST %" inputMode="decimal" value={l.gst} onChange={(e) => set(i, { gst: e.target.value })} />}
            <Input label="SAC / HSN (optional)" inputMode="numeric" maxLength={8} value={l.sac} onChange={(e) => set(i, { sac: e.target.value })} />
          </div>
        </div>
      ))}
      <div className={s.rowBetween}>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, emptyLine()])}>
          <Plus size={16} aria-hidden /> Add item
        </Button>
        <span className={s.muted}>
          Estimate: {formatINR(est.sub)}
          {showGst && est.tax > 0 ? ` + GST ${formatINR(est.tax)} = ${formatINR(est.total)}` : ''} · final totals are calculated by the server
        </span>
      </div>
    </div>
  );
}

// --- Sections ------------------------------------------------------------------------------------

export interface SectionForm {
  heading: string;
  body: string;
}

export function SectionsEditor({ sections, onChange, hint }: { sections: SectionForm[]; onChange: (v: SectionForm[]) => void; hint?: string }) {
  const set = (i: number, patch: Partial<SectionForm>) => onChange(sections.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className={s.stackSm}>
      {hint && <p className={s.muted}>{hint}</p>}
      {sections.map((sec, i) => (
        <div key={i} className={s.moduleCard}>
          <div className={s.rowBetween}>
            <span className={s.strong}>Section {i + 1}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(sections.filter((_, j) => j !== i))} aria-label={`Remove section ${i + 1}`}>
              <Trash2 size={16} aria-hidden /> Remove
            </Button>
          </div>
          <Input label="Heading" maxLength={160} value={sec.heading} onChange={(e) => set(i, { heading: e.target.value })} />
          <Textarea label="Text" rows={5} maxLength={20000} value={sec.body} onChange={(e) => set(i, { body: e.target.value })} />
        </div>
      ))}
      <div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...sections, { heading: '', body: '' }])}>
          <Plus size={16} aria-hidden /> Add section
        </Button>
      </div>
    </div>
  );
}

export const cleanSections = (sections: SectionForm[]) => sections.filter((x) => x.heading.trim() || x.body.trim()).map((x) => ({ heading: x.heading.trim(), body: x.body.trim() }));

/** Totals block from the server's computed totals. */
export function TotalsList({ totals, paidPaise }: { totals: Row | null | undefined; paidPaise?: number }) {
  if (!totals) return null;
  const rows: [string, string, boolean?][] = [['Subtotal', formatINR(totals.subtotalPaise)]];
  if (totals.discountPaise) rows.push(['Discount', `− ${formatINR(totals.discountPaise)}`]);
  if (totals.gst) {
    rows.push(['Taxable value', formatINR(totals.taxablePaise)]);
    if (totals.gst.intraState) {
      rows.push(['CGST', formatINR(totals.cgstPaise)]);
      rows.push(['SGST', formatINR(totals.sgstPaise)]);
    } else rows.push(['IGST', formatINR(totals.igstPaise)]);
  }
  rows.push(['Total', formatINR(totals.totalPaise), true]);
  if (paidPaise) {
    rows.push(['Paid', formatINR(paidPaise)]);
    rows.push(['Balance due', formatINR(Math.max(0, totals.totalPaise - paidPaise)), true]);
  }
  return (
    <dl className={s.stackSm} style={{ gap: 6 }}>
      {rows.map(([k, v, strong]) => (
        <div key={k} className={s.rowBetween}>
          <dt className={strong ? s.strong : s.muted}>{k}</dt>
          <dd className={strong ? s.strong : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Email delivery rows (EmailLog). */
export function EmailLogList({ emails }: { emails: Row[] | null | undefined }) {
  if (!emails?.length) return <p className={s.muted}>No emails recorded yet.</p>;
  return (
    <ul className={s.list}>
      {emails.map((e) => (
        <li key={e.id} className={s.listItem}>
          <div className={s.rowBetween}>
            <span className={s.strong}>{e.subject ?? e.kind}</span>
            <span className={s.small}>{new Date(e.createdAt).toLocaleString('en-IN')}</span>
          </div>
          <span className={s.small}>
            {e.to} · <EmailStatus status={e.status} />
          </span>
          {e.error && <span className={s.small}>Error: {e.error}</span>}
        </li>
      ))}
    </ul>
  );
}

export function EmailStatus({ status }: { status: string }) {
  const text = status === 'SKIPPED' ? 'Not sent (email not configured)' : status === 'FAILED' ? 'Failed' : 'Sent';
  return <span style={{ fontWeight: 700, color: status === 'SENT' ? 'var(--success)' : status === 'FAILED' ? 'var(--danger)' : 'var(--warning)' }}>{text}</span>;
}

/** Honest wording for an email delivery result. */
export function deliveryMessage(status: string, error?: string): string {
  if (status === 'SENT') return 'Email sent';
  if (status === 'SKIPPED') return 'Email is not configured on the server — nothing was sent';
  return `Email could not be delivered${error ? `: ${error}` : ''}`;
}
