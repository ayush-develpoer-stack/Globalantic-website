'use client';

import { Input, Textarea, rupeesToPaise } from '@globalantic/ui';
import { paiseToRupees } from './admin';
import s from './admin.module.css';

type Row = Record<string, any>;

export interface ProgramForm {
  slug: string;
  title: string;
  summary: string;
  description: string;
  fee: string;
  passPercent: string;
  maxAttempts: string;
  questionsPerAttempt: string;
  timeLimitMinutes: string;
  certificateTitle: string;
}

export const emptyProgram: ProgramForm = { slug: '', title: '', summary: '', description: '', fee: '999', passPercent: '60', maxAttempts: '3', questionsPerAttempt: '', timeLimitMinutes: '30', certificateTitle: 'Certificate of Completion' };

export const ENROLLMENT_STATUSES = [
  { value: 'PENDING_PAYMENT', label: 'Pending payment' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
];

export function programFromApi(p: Row): ProgramForm {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    description: p.description,
    fee: paiseToRupees(p.feePaise),
    passPercent: String(p.passPercent),
    maxAttempts: String(p.maxAttempts),
    questionsPerAttempt: p.questionsPerAttempt ? String(p.questionsPerAttempt) : '',
    timeLimitMinutes: String(p.timeLimitMinutes),
    certificateTitle: p.certificateTitle,
  };
}

export function programToApi(v: ProgramForm): { data: Row } | { error: string } {
  const feePaise = rupeesToPaise(v.fee);
  if (!Number.isInteger(feePaise) || feePaise < 100) return { error: 'Enter a fee of at least ₹1.' };
  const int = (x: string) => Number.parseInt(x, 10);
  return {
    data: {
      slug: v.slug.trim(),
      title: v.title.trim(),
      summary: v.summary.trim(),
      description: v.description.trim(),
      feePaise,
      passPercent: int(v.passPercent),
      maxAttempts: int(v.maxAttempts),
      questionsPerAttempt: v.questionsPerAttempt.trim() ? int(v.questionsPerAttempt) : null,
      timeLimitMinutes: int(v.timeLimitMinutes),
      certificateTitle: v.certificateTitle.trim(),
    },
  };
}

export function ProgramFields({ value: v, onChange, errors = {}, disabled }: { value: ProgramForm; onChange: (v: ProgramForm) => void; errors?: Record<string, string>; disabled?: boolean }) {
  const set = (patch: Partial<ProgramForm>) => onChange({ ...v, ...patch });
  return (
    <fieldset className={s.formGrid} disabled={disabled}>
      <Input label="Title" required maxLength={160} value={v.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
      <Input label="URL slug" required maxLength={120} value={v.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} error={errors.slug} hint="Lowercase letters, numbers and hyphens" />
      <div className={s.span2}>
        <Textarea label="Summary" rows={2} required maxLength={400} value={v.summary} onChange={(e) => set({ summary: e.target.value })} error={errors.summary} />
      </div>
      <div className={s.span2}>
        <Textarea label="Description" rows={6} required maxLength={10000} value={v.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} hint="Shown on the public program page. Describe what students learn and the completion rules honestly; do not claim accreditation." />
      </div>
      <Input label="Fee (₹)" required inputMode="decimal" value={v.fee} onChange={(e) => set({ fee: e.target.value })} error={errors.feePaise} hint="Changes apply to new registrations only" />
      <Input label="Certificate title" required maxLength={80} value={v.certificateTitle} onChange={(e) => set({ certificateTitle: e.target.value })} error={errors.certificateTitle} />
      <Input label="Pass mark (%)" required inputMode="numeric" value={v.passPercent} onChange={(e) => set({ passPercent: e.target.value })} error={errors.passPercent} />
      <Input label="Assessment attempts" required inputMode="numeric" value={v.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} error={errors.maxAttempts} />
      <Input label="Questions per attempt (optional)" inputMode="numeric" value={v.questionsPerAttempt} onChange={(e) => set({ questionsPerAttempt: e.target.value })} error={errors.questionsPerAttempt} hint="Leave blank to use every active question" />
      <Input label="Time limit (minutes)" required inputMode="numeric" value={v.timeLimitMinutes} onChange={(e) => set({ timeLimitMinutes: e.target.value })} error={errors.timeLimitMinutes} />
    </fieldset>
  );
}
