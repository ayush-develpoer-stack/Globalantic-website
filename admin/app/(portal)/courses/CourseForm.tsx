'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { COURSE_LEVELS, DELIVERY_MODES, PROGRAM_TYPES } from '@globalantic/types';
import { Alert, Button, Card, Input, Select, Textarea, rupeesToPaise } from '@globalantic/ui';
import { enumOptions, paiseToRupees } from '@/lib/admin';
import { ImageField } from '@/lib/upload';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export interface CourseFormValues {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  programType: string;
  durationLabel: string;
  durationWeeks: string;
  mode: string;
  level: string;
  skills: string[];
  eligibility: string;
  fee: string;
  discount: string;
  discountLabel: string;
  thumbnailUrl: string;
  bannerUrl: string;
  seoTitle: string;
  seoDescription: string;
  minAttendancePercent: string;
  order: string;
}

export function toFormValues(c?: Row): CourseFormValues {
  return {
    slug: c?.slug ?? '',
    title: c?.title ?? '',
    shortDescription: c?.shortDescription ?? '',
    description: c?.description ?? '',
    category: c?.category ?? '',
    programType: c?.programType ?? 'TRAINING',
    durationLabel: c?.durationLabel ?? '',
    durationWeeks: c?.durationWeeks ? String(c.durationWeeks) : '',
    mode: c?.mode ?? 'ONLINE',
    level: c?.level ?? 'BEGINNER',
    skills: Array.isArray(c?.skills) ? c!.skills : [],
    eligibility: c?.eligibility ?? '',
    fee: c ? paiseToRupees(c.feePaise) : '',
    discount: c ? paiseToRupees(c.discountPaise) : '0',
    discountLabel: c?.discountLabel ?? '',
    thumbnailUrl: c?.thumbnailUrl ?? '',
    bannerUrl: c?.bannerUrl ?? '',
    seoTitle: c?.seoTitle ?? '',
    seoDescription: c?.seoDescription ?? '',
    minAttendancePercent: String(c?.minAttendancePercent ?? 75),
    order: String(c?.order ?? 0),
  };
}

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className={s.stackSm}>
      <Input
        label={label}
        hint="Press Enter or comma to add"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        maxLength={80}
      />
      {values.length > 0 && (
        <ul className={s.tags} aria-label={`${label} added`}>
          {values.map((v) => (
            <li key={v} className={s.tag}>
              {v}
              <button type="button" className={s.tagRemove} onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Validates locally (rupee amounts) and builds the API payload. */
function toPayload(v: CourseFormValues): { payload?: Row; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const feePaise = rupeesToPaise(v.fee);
  const discountPaise = rupeesToPaise(v.discount || '0');
  if (!Number.isFinite(feePaise) || feePaise < 0) errors.feePaise = 'Enter a valid fee in rupees';
  if (!Number.isFinite(discountPaise) || discountPaise < 0) errors.discountPaise = 'Enter a valid discount in rupees';
  if (!errors.feePaise && !errors.discountPaise && discountPaise > feePaise) errors.discountPaise = 'Discount cannot exceed the fee';
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    payload: {
      slug: v.slug.trim(),
      title: v.title,
      shortDescription: v.shortDescription,
      description: v.description,
      category: v.category,
      programType: v.programType,
      durationLabel: v.durationLabel,
      durationWeeks: v.durationWeeks || undefined,
      mode: v.mode,
      level: v.level,
      skills: v.skills,
      eligibility: v.eligibility,
      feePaise,
      discountPaise,
      discountLabel: v.discountLabel,
      thumbnailUrl: v.thumbnailUrl,
      bannerUrl: v.bannerUrl,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      minAttendancePercent: v.minAttendancePercent,
      order: v.order,
    },
  };
}

export function CourseForm({ initial, submitLabel, onSubmit }: { initial: CourseFormValues; submitLabel: string; onSubmit: (payload: Row) => Promise<unknown> }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof CourseFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { payload, errors: local } = toPayload(v);
    setErrors(local);
    if (!payload) return;
    setPending(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card title="Basics">
        <div className={s.formGrid}>
          <Input label="Title" required value={v.title} onChange={set('title')} error={errors.title} maxLength={200} />
          <Input label="Slug" required value={v.slug} onChange={set('slug')} error={errors.slug} hint="Lowercase letters, numbers and hyphens (used in the URL)" maxLength={160} />
          <Input label="Category" required value={v.category} onChange={set('category')} error={errors.category} maxLength={80} />
          <Select label="Programme type" value={v.programType} onChange={set('programType')} options={enumOptions(PROGRAM_TYPES)} />
          <Select label="Mode" value={v.mode} onChange={set('mode')} options={enumOptions(DELIVERY_MODES)} />
          <Select label="Level" value={v.level} onChange={set('level')} options={enumOptions(COURSE_LEVELS)} />
          <Input label="Duration label" required placeholder="e.g. 12 weeks" value={v.durationLabel} onChange={set('durationLabel')} error={errors.durationLabel} maxLength={80} />
          <Input label="Duration (weeks)" type="number" min={1} max={104} value={v.durationWeeks} onChange={set('durationWeeks')} error={errors.durationWeeks} />
          <Textarea label="Short description" required containerClassName={s.span2} value={v.shortDescription} onChange={set('shortDescription')} error={errors.shortDescription} rows={2} maxLength={500} />
          <Textarea label="Full description" required containerClassName={s.span2} value={v.description} onChange={set('description')} error={errors.description} rows={6} />
          <Textarea label="Eligibility" required containerClassName={s.span2} value={v.eligibility} onChange={set('eligibility')} error={errors.eligibility} rows={3} />
          <div className={s.span2}>
            <TagInput label="Skills covered" values={v.skills} onChange={(skills) => setV((x) => ({ ...x, skills }))} />
          </div>
        </div>
      </Card>
      <Card title="Fees">
        <div className={s.formGrid}>
          <Input label="Fee (₹)" required inputMode="decimal" value={v.fee} onChange={set('fee')} error={errors.feePaise} hint="Amount in rupees. Students are always charged the server-side amount." />
          <Input label="Discount (₹)" inputMode="decimal" value={v.discount} onChange={set('discount')} error={errors.discountPaise} />
          <Input label="Discount label" placeholder="e.g. Early-bird offer" value={v.discountLabel} onChange={set('discountLabel')} error={errors.discountLabel} maxLength={120} />
          <Input label="Minimum attendance for certificate (%)" type="number" min={0} max={100} value={v.minAttendancePercent} onChange={set('minAttendancePercent')} error={errors.minAttendancePercent} />
        </div>
      </Card>
      <Card title="Media & SEO">
        <div className={s.formGrid}>
          <ImageField label="Thumbnail" purpose="COURSE_IMAGE" value={v.thumbnailUrl} onChange={(url) => setV((x) => ({ ...x, thumbnailUrl: url }))} error={errors.thumbnailUrl} />
          <ImageField label="Banner" purpose="COURSE_IMAGE" value={v.bannerUrl} onChange={(url) => setV((x) => ({ ...x, bannerUrl: url }))} error={errors.bannerUrl} />
          <Input label="SEO title" value={v.seoTitle} onChange={set('seoTitle')} error={errors.seoTitle} maxLength={200} />
          <Input label="Display order" type="number" min={0} value={v.order} onChange={set('order')} error={errors.order} />
          <Textarea label="SEO description" containerClassName={s.span2} value={v.seoDescription} onChange={set('seoDescription')} error={errors.seoDescription} rows={2} maxLength={400} />
        </div>
      </Card>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
