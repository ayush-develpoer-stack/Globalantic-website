'use client';

import { useState } from 'react';
import { errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { ASSIGNMENT_STATUSES, enumLabel } from '@globalantic/types';
import { Alert, Button, Input, Select, Textarea } from '@globalantic/ui';
import s from './page.module.css';

export interface AssignmentValues {
  title: string;
  description: string;
  resourceUrl: string;
  dueAt: string; // datetime-local value
  maxMarks: string;
  status: string;
}

export const emptyAssignment: AssignmentValues = { title: '', description: '', resourceUrl: '', dueAt: '', maxMarks: '10', status: 'PUBLISHED' };

/** ISO -> value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validate(v: AssignmentValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.title.trim().length < 3) e.title = 'Enter a title (at least 3 characters).';
  if (v.description.trim().length < 3) e.description = 'Describe the task.';
  if (v.resourceUrl.trim() && !/^https:\/\/\S+$/.test(v.resourceUrl.trim())) e.resourceUrl = 'Only https:// links are allowed.';
  if (!v.dueAt || Number.isNaN(new Date(v.dueAt).getTime())) e.dueAt = 'Choose a due date and time.';
  const m = Number(v.maxMarks);
  if (!Number.isInteger(m) || m < 1 || m > 1000) e.maxMarks = 'Maximum marks must be a whole number from 1 to 1000.';
  return e;
}

export function AssignmentForm({
  initial = emptyAssignment,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AssignmentValues;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<AssignmentValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof AssignmentValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        title: v.title.trim(),
        description: v.description.trim(),
        resourceUrl: v.resourceUrl.trim(),
        dueAt: new Date(v.dueAt).toISOString(),
        maxMarks: Number(v.maxMarks),
        status: v.status,
      });
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.formGrid}>
      {error && (
        <div className={s.full}>
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <Input containerClassName={s.full} label="Title" required maxLength={200} value={v.title} onChange={set('title')} error={errors.title} />
      <Textarea containerClassName={s.full} label="Description" required rows={5} maxLength={10000} value={v.description} onChange={set('description')} error={errors.description} />
      <Input
        containerClassName={s.full}
        label="Resource link"
        type="url"
        placeholder="https://"
        hint="Optional. Only https:// links are accepted."
        value={v.resourceUrl}
        onChange={set('resourceUrl')}
        error={errors.resourceUrl}
      />
      <Input label="Due" type="datetime-local" required value={v.dueAt} onChange={set('dueAt')} error={errors.dueAt} />
      <Input label="Maximum marks" type="number" min={1} max={1000} required value={v.maxMarks} onChange={set('maxMarks')} error={errors.maxMarks} />
      <Select
        label="Status"
        value={v.status}
        onChange={set('status')}
        options={ASSIGNMENT_STATUSES.map((st) => ({ value: st, label: enumLabel(st) }))}
        hint="Draft is hidden from students; Closed stops new submissions."
      />
      <div className={`${s.actions} ${s.full}`}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
