'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, PageHeader, formatDate, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface ResultsData {
  assessment: { id: string; batchId: string; title: string; type: string; maxMarks: number; passMarks: number; heldOn: string | null; resultsPublished: boolean };
  rows: { enrollmentId: string; student: { id: string; name: string }; marks: number | null; remarks: string | null }[];
}

type Draft = Record<string, { marks: string; remarks: string }>;

export default function AssessmentResultsPage() {
  const id = useParam('id');
  const toast = useToast();
  const state = useAsync(() => api().trainer.results(id) as Promise<ResultsData>, `results:${id}`);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (state.data) setDraft(Object.fromEntries(state.data.rows.map((r) => [r.enrollmentId, { marks: r.marks === null ? '' : String(r.marks), remarks: r.remarks ?? '' }])));
  }, [state.data]);

  return (
    <Guarded state={state} what="Assessment">
      {(d) => {
        const a = d.assessment;
        const save = async () => {
          const bad = new Set<string>();
          const rows: { enrollmentId: string; marks: number; remarks?: string }[] = [];
          for (const [enrollmentId, v] of Object.entries(draft)) {
            if (v.marks.trim() === '') continue;
            const m = Number(v.marks);
            if (!Number.isInteger(m) || m < 0 || m > a.maxMarks) bad.add(enrollmentId);
            else rows.push({ enrollmentId, marks: m, ...(v.remarks.trim() ? { remarks: v.remarks.trim() } : {}) });
          }
          setInvalid(bad);
          if (bad.size) {
            setError(`Marks must be whole numbers from 0 to ${a.maxMarks}.`);
            return;
          }
          if (!rows.length) {
            setError('Enter marks for at least one student.');
            return;
          }
          setSaving(true);
          setError(null);
          try {
            const r = await api().trainer.saveResults(id, rows);
            toast(`Saved ${r.saved} result${r.saved === 1 ? '' : 's'}.`);
            state.reload();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow={<Link href={`/batches/${a.batchId}/assessments`}>← Back to batch assessments</Link>}
              title={a.title}
              description={
                <span className={s.row}>
                  <Badge tone={a.type === 'FINAL' ? 'primary' : 'neutral'}>{enumLabel(a.type)}</Badge>
                  <span>Pass {a.passMarks} of {a.maxMarks}{a.heldOn ? ` · held ${formatDate(a.heldOn)}` : ''}</span>
                  <Badge tone={a.resultsPublished ? 'success' : 'warning'}>{a.resultsPublished ? 'Published to students' : 'Not published'}</Badge>
                </span>
              }
              actions={!a.resultsPublished ? <Button variant="outline" size="sm" onClick={() => setPublishing(true)}>Publish results</Button> : undefined}
            />
            <Card title="Results">
              {d.rows.length === 0 ? (
                <EmptyState title="No students in this batch" />
              ) : (
                <div className={s.stack}>
                  {error && <Alert tone="danger">{error}</Alert>}
                  {a.resultsPublished && <Alert tone="info">Results are already visible to students. Corrections are recorded in the audit log.</Alert>}
                  <DataTable
                    caption={`Marks for ${a.title}`}
                    rows={d.rows}
                    rowKey={(r) => r.enrollmentId}
                    columns={[
                      { key: 'name', header: 'Student', render: (r) => r.student.name },
                      {
                        key: 'marks',
                        header: `Marks / ${a.maxMarks}`,
                        render: (r) => (
                          <input
                            className={s.marksInput}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={a.maxMarks}
                            aria-label={`Marks for ${r.student.name}`}
                            aria-invalid={invalid.has(r.enrollmentId) || undefined}
                            value={draft[r.enrollmentId]?.marks ?? ''}
                            onChange={(e) => setDraft((x) => ({ ...x, [r.enrollmentId]: { ...x[r.enrollmentId], marks: e.target.value } }))}
                          />
                        ),
                      },
                      {
                        key: 'result',
                        header: 'Result',
                        hideOnMobile: true,
                        render: (r) => {
                          const v = draft[r.enrollmentId]?.marks;
                          if (!v) return '—';
                          return Number(v) >= a.passMarks ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Below pass</Badge>;
                        },
                      },
                      {
                        key: 'remarks',
                        header: 'Remarks',
                        render: (r) => (
                          <input
                            className={s.remarksInput}
                            maxLength={500}
                            aria-label={`Remarks for ${r.student.name}`}
                            value={draft[r.enrollmentId]?.remarks ?? ''}
                            onChange={(e) => setDraft((x) => ({ ...x, [r.enrollmentId]: { ...x[r.enrollmentId], remarks: e.target.value } }))}
                          />
                        ),
                      },
                    ]}
                  />
                  <div className={s.actions}>
                    <Button onClick={save} loading={saving}>Save results</Button>
                  </div>
                </div>
              )}
            </Card>
            <ConfirmDialog
              open={publishing}
              title="Publish results?"
              message="Students will see their marks and receive a notification. Save any unsaved marks first."
              confirmLabel="Publish"
              onClose={() => setPublishing(false)}
              onConfirm={async () => {
                await api().trainer.publishResults(id);
                toast('Results published.');
                state.reload();
              }}
            />
          </div>
        );
      }}
    </Guarded>
  );
}
