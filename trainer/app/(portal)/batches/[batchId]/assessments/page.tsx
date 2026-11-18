'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { ASSESSMENT_TYPES, enumLabel } from '@globalantic/types';
import { Alert, Badge, Button, Card, DataTable, EmptyState, Input, Modal, Select, formatDate, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface AssessmentRow {
  id: string;
  title: string;
  type: string;
  maxMarks: number;
  passMarks: number;
  heldOn: string | null;
  resultsPublished: boolean;
  _count: { results: number };
}

const empty = { title: '', type: 'TEST', maxMarks: '100', passMarks: '40', heldOn: '' };

export default function AssessmentsPage() {
  const batchId = useParam('batchId');
  const toast = useToast();
  const state = useAsync(() => api().trainer.assessments(batchId) as Promise<AssessmentRow[]>, `ass:${batchId}`);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async () => {
    const errs: Record<string, string> = {};
    const max = Number(v.maxMarks);
    const pass = Number(v.passMarks);
    if (v.title.trim().length < 3) errs.title = 'Enter a title (at least 3 characters).';
    if (!Number.isInteger(max) || max < 1 || max > 1000) errs.maxMarks = 'Whole number from 1 to 1000.';
    if (!Number.isInteger(pass) || pass < 0 || pass > max) errs.passMarks = 'Whole number, not more than the maximum.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    try {
      await api().trainer.createAssessment(batchId, { title: v.title.trim(), type: v.type, maxMarks: max, passMarks: pass, ...(v.heldOn ? { heldOn: v.heldOn } : {}) });
      setOpen(false);
      setV(empty);
      toast('Assessment created.');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Assessments" actions={<Button size="sm" onClick={() => setOpen(true)}>New assessment</Button>}>
      <Guarded state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No assessments yet" description="Create quizzes, tests, projects and the final assessment." />
          ) : (
            <DataTable
              caption="Assessments in this batch"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: 'Title', render: (r) => <Link className={s.link} href={`/assessments/${r.id}`}>{r.title}</Link> },
                { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'FINAL' ? 'primary' : 'neutral'}>{enumLabel(r.type)}</Badge> },
                { key: 'marks', header: 'Pass / max', render: (r) => `${r.passMarks} / ${r.maxMarks}`, hideOnMobile: true },
                { key: 'held', header: 'Held on', render: (r) => formatDate(r.heldOn), hideOnMobile: true },
                { key: 'results', header: 'Results', render: (r) => r._count.results },
                { key: 'pub', header: 'Visibility', render: (r) => <Badge tone={r.resultsPublished ? 'success' : 'warning'}>{r.resultsPublished ? 'Published' : 'Not published'}</Badge> },
              ]}
            />
          )
        }
      </Guarded>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New assessment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={create} loading={pending}>Create</Button>
          </>
        }
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Title" required maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={errors.title} />
        <Select label="Type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={ASSESSMENT_TYPES.map((t) => ({ value: t, label: enumLabel(t) }))} hint="Students must pass every Final assessment to be eligible for a certificate." />
        <div className={s.formGrid}>
          <Input label="Maximum marks" type="number" min={1} max={1000} required value={v.maxMarks} onChange={(e) => setV({ ...v, maxMarks: e.target.value })} error={errors.maxMarks} />
          <Input label="Pass marks" type="number" min={0} required value={v.passMarks} onChange={(e) => setV({ ...v, passMarks: e.target.value })} error={errors.passMarks} />
        </div>
        <Input label="Held on" type="date" value={v.heldOn} onChange={(e) => setV({ ...v, heldOn: e.target.value })} />
      </Modal>
    </Card>
  );
}
