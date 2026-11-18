'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { PROJECT_STATUSES } from '@globalantic/types';
import { Alert, Button, Input, Modal, Select, Textarea, toDateInput, useToast } from '@globalantic/ui';
import { enumOptions } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

/** Create (no `project`) or edit an existing project. */
export function ProjectFormModal({ project, onClose, onDone }: { project?: Row; onClose: () => void; onDone: (p: Row) => void }) {
  const toast = useToast();
  const editing = Boolean(project);
  const [v, setV] = useState({
    code: project?.code ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'ACTIVE',
    startDate: toDateInput(project?.startDate),
    endDate: toDateInput(project?.endDate),
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    if (pending) return;
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      setFields({ endDate: 'End date must be after the start date' });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    const common = { name: v.name, description: v.description || null, status: v.status, startDate: v.startDate || null, endDate: v.endDate || null };
    try {
      const saved = editing ? await api().hr.updateProject(project!.id, common) : await api().hr.createProject({ ...common, code: v.code });
      toast(editing ? 'Project updated' : 'Project created');
      onDone(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open size="lg" onClose={onClose} title={editing ? 'Edit project' : 'New project'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>{editing ? 'Save' : 'Create project'}</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Code" required value={v.code} onChange={set('code')} error={fields.code} disabled={editing} maxLength={20} hint={editing ? 'Codes cannot change' : 'Letters, numbers and hyphens, e.g. WEB-01'} />
        <Input label="Name" required value={v.name} onChange={set('name')} error={fields.name} maxLength={160} />
        <Select label="Status" value={v.status} onChange={set('status')} options={enumOptions(PROJECT_STATUSES)} error={fields.status} />
        <div />
        <Input label="Start date" type="date" value={v.startDate} onChange={set('startDate')} error={fields.startDate} />
        <Input label="End date" type="date" value={v.endDate} onChange={set('endDate')} error={fields.endDate} />
        <Textarea containerClassName={s.span2} label="Description" value={v.description} onChange={set('description')} error={fields.description} rows={3} maxLength={4000} />
      </div>
    </Modal>
  );
}
