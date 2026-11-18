'use client';

import { Card, Checkbox, Input, Textarea, toDateInput } from '@globalantic/ui';
import { LineItemsEditor, SectionsEditor, cleanSections, linesFromApi, linesToApi, type LineForm, type SectionForm } from './docs';
import s from './admin.module.css';

type Row = Record<string, any>;

export interface DocForm {
  title: string;
  lines: LineForm[];
  sections: SectionForm[];
  notes: string;
  terms: string;
  applyGst: boolean;
  issueDate: string;
  validUntil: string;
  dueDate: string;
}

export const emptyDoc = (): DocForm => ({ title: '', lines: [], sections: [], notes: '', terms: '', applyGst: false, issueDate: '', validUntil: '', dueDate: '' });

export function docFromApi(d: Row): DocForm {
  return {
    title: d.title ?? '',
    lines: linesFromApi(d.items),
    sections: ((d.sections as Row[]) ?? []).map((x) => ({ heading: x.heading ?? '', body: x.body ?? '' })),
    notes: d.notes ?? '',
    terms: d.terms ?? '',
    applyGst: Boolean(d.applyGst),
    issueDate: toDateInput(d.issueDate),
    validUntil: toDateInput(d.validUntil),
    dueDate: toDateInput(d.dueDate),
  };
}

/** Body for create/update. Returns an error string when line items are invalid. */
export function docToApi(type: string, v: DocForm): { body: Row } | { error: string } {
  const { items, error } = linesToApi(v.lines);
  if (error) return { error };
  return {
    body: {
      title: v.title.trim(),
      items,
      sections: cleanSections(v.sections),
      notes: v.notes.trim() || null,
      terms: v.terms.trim() || null,
      applyGst: v.applyGst,
      issueDate: v.issueDate || null,
      ...(type === 'QUOTATION' || type === 'PROPOSAL' ? { validUntil: v.validUntil || null } : {}),
      ...(type === 'INVOICE' ? { dueDate: v.dueDate || null } : {}),
    },
  };
}

/** Fields shared by new documents and draft edits. Totals shown here are estimates; the server computes the real ones. */
export function DocumentFields({ type, value: v, onChange, errors = {}, gstAvailable }: { type: string; value: DocForm; onChange: (v: DocForm) => void; errors?: Record<string, string>; gstAvailable: boolean }) {
  const set = (patch: Partial<DocForm>) => onChange({ ...v, ...patch });
  const sectionsFirst = type === 'PROPOSAL' || type === 'AGREEMENT';
  const sections = (
    <Card title={type === 'AGREEMENT' ? 'Scope, timeline and terms' : 'Sections'}>
      <SectionsEditor
        sections={v.sections}
        onChange={(sections) => set({ sections })}
        hint={type === 'AGREEMENT' ? 'Agreements need at least one section (e.g. scope of work, deliverables, timeline, payment terms, confidentiality). Use only terms your business has approved.' : type === 'PROPOSAL' ? 'Proposals need at least one section (e.g. understanding, approach, deliverables, timeline).' : 'Optional extra sections.'}
      />
      {errors.sections && <p className={s.small} role="alert">{errors.sections}</p>}
    </Card>
  );
  return (
    <div className={s.stack}>
      <Card title="Document">
        <div className={s.formGrid}>
          <div className={s.span2}>
            <Input label="Title" maxLength={200} value={v.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} hint="e.g. Website development — phase 1" />
          </div>
          <Input label="Issue date (optional)" type="date" value={v.issueDate} onChange={(e) => set({ issueDate: e.target.value })} error={errors.issueDate} hint="Defaults to the day it is issued" />
          {(type === 'QUOTATION' || type === 'PROPOSAL') && <Input label="Valid until" type="date" value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} error={errors.validUntil} />}
          {type === 'INVOICE' && <Input label="Due date" type="date" required value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} error={errors.dueDate} />}
          <div className={s.span2}>
            <Checkbox label="Apply GST" checked={v.applyGst} disabled={!gstAvailable && !v.applyGst} onChange={(e) => set({ applyGst: e.target.checked })} />
            <p className={s.small}>
              {gstAvailable
                ? 'GST is charged per line at the rate you enter. CGST + SGST or IGST is chosen from the company and client state codes.'
                : 'GST is unavailable: the company is not set up as GST-registered with a valid GSTIN (Documents → Company details).'}
            </p>
          </div>
        </div>
      </Card>
      {sectionsFirst && sections}
      <Card title="Line items">
        <LineItemsEditor lines={v.lines} onChange={(lines) => set({ lines })} showGst={v.applyGst && gstAvailable} />
        {errors.items && <p className={s.small} role="alert">{errors.items}</p>}
      </Card>
      {!sectionsFirst && sections}
      <Card title="Notes and terms">
        <div className={s.stackSm}>
          <Textarea label="Notes (optional)" rows={3} maxLength={5000} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
          <Textarea label="Terms (optional)" rows={5} maxLength={20000} value={v.terms} onChange={(e) => set({ terms: e.target.value })} hint="Only terms your business has approved." />
        </div>
      </Card>
    </div>
  );
}
