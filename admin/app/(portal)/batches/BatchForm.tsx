'use client';

import { useState } from 'react';
import { errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { DELIVERY_MODES } from '@globalantic/types';
import { Alert, Button, Card, Input, Select, rupeesToPaise, toDateInput } from '@globalantic/ui';
import { enumOptions, paiseToRupees } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export interface BatchFormProps {
  /** Existing batch (edit) or undefined (create). */
  batch?: Row;
  courses?: { value: string; label: string }[];
  defaultCourseId?: string;
  submitLabel: string;
  onSubmit: (payload: Row) => Promise<unknown>;
}

export function BatchForm({ batch, courses, defaultCourseId, submitLabel, onSubmit }: BatchFormProps) {
  const editing = Boolean(batch);
  const [v, setV] = useState({
    courseId: batch?.courseId ?? defaultCourseId ?? '',
    name: batch?.name ?? '',
    startDate: toDateInput(batch?.startDate),
    endDate: toDateInput(batch?.endDate),
    registrationDeadline: toDateInput(batch?.registrationDeadline),
    mode: batch?.mode ?? 'ONLINE',
    venue: batch?.venue ?? '',
    capacity: batch ? String(batch.capacity) : '',
    fee: batch?.feePaise !== null && batch?.feePaise !== undefined ? paiseToRupees(batch.feePaise) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const local: Record<string, string> = {};
    let feePaise: number | undefined;
    if (v.fee.trim() !== '') {
      feePaise = rupeesToPaise(v.fee);
      if (!Number.isFinite(feePaise) || feePaise < 0) local.feePaise = 'Enter a valid amount in rupees';
    }
    if (!editing && !v.courseId) local.courseId = 'Choose a course';
    setErrors(local);
    if (Object.keys(local).length) return;
    const payload: Row = {
      name: v.name,
      startDate: v.startDate,
      endDate: v.endDate,
      registrationDeadline: v.registrationDeadline,
      mode: v.mode,
      venue: v.venue,
      capacity: v.capacity,
      // Empty fee while editing clears the override (the batch falls back to the course fee).
      ...(feePaise !== undefined ? { feePaise } : editing ? { feePaise: null } : {}),
      ...(editing ? {} : { courseId: v.courseId }),
    };
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
    <form onSubmit={submit} noValidate>
      <Card title="Batch details">
        <div className={s.stack}>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className={s.formGrid}>
            {!editing && <Select label="Course" required value={v.courseId} onChange={set('courseId')} options={courses ?? []} placeholder="Choose a course" error={errors.courseId} />}
            <Input label="Batch name" required value={v.name} onChange={set('name')} error={errors.name} maxLength={120} placeholder="e.g. Jan 2027 – Morning" />
            <Input label="Start date" type="date" required value={v.startDate} onChange={set('startDate')} error={errors.startDate} />
            <Input label="End date" type="date" required value={v.endDate} onChange={set('endDate')} error={errors.endDate} />
            <Input label="Registration deadline" type="date" required value={v.registrationDeadline} onChange={set('registrationDeadline')} error={errors.registrationDeadline} />
            <Select label="Mode" value={v.mode} onChange={set('mode')} options={enumOptions(DELIVERY_MODES)} />
            <Input label="Venue" value={v.venue} onChange={set('venue')} error={errors.venue} hint="For offline/hybrid batches" maxLength={300} />
            <Input label="Capacity (seats)" type="number" min={1} required value={v.capacity} onChange={set('capacity')} error={errors.capacity} />
            <Input
              label="Fee override (₹)"
              inputMode="decimal"
              value={v.fee}
              onChange={set('fee')}
              error={errors.feePaise}
              hint={editing ? 'Leave as is to keep the current fee. Clearing an existing override is not supported here.' : 'Leave empty to use the course fee.'}
            />
          </div>
          <div className={s.actions}>
            <Button type="submit" loading={pending}>{submitLabel}</Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
