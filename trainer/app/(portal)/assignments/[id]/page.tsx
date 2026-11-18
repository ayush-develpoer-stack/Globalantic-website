'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@globalantic/api-client';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Textarea,
  formatDateTime,
  useAsync,
  useToast,
} from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import { AssignmentForm, toLocalInput } from '@/lib/AssignmentForm';
import s from '@/lib/page.module.css';

interface Submission {
  id: string;
  studentId: string;
  status: string;
  content: string | null;
  linkUrl: string | null;
  file?: { id: string; originalName: string; mimeType: string; sizeBytes: number } | null;
  submittedAt: string;
  marks: number | null;
  feedback: string | null;
  student: { id: string; name: string; email: string };
}

function FileDownload({ file }: { file: NonNullable<Submission['file']> }) {
  return (
    <a className={s.link} href={api().files.url(file.id)} download={file.originalName}>
      Download file<span className="sr-only"> {file.originalName}</span>
    </a>
  );
}

interface Detail {
  assignment: { id: string; batchId: string; title: string; description: string; resourceUrl: string | null; dueAt: string; maxMarks: number; status: string };
  submissions: Submission[];
  expected: number;
}

interface RosterRow {
  enrollmentId: string;
  status: string;
  student: { id: string; name: string; email: string };
}

export default function AssignmentDetailPage() {
  const id = useParam('id');
  const toast = useToast();
  const state = useAsync(async () => {
    const detail = (await api().trainer.assignment(id)) as Detail;
    const roster = (await api().trainer.roster(detail.assignment.batchId)) as RosterRow[];
    return { ...detail, roster };
  }, `assignment:${id}`);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [grading, setGrading] = useState<Submission | null>(null);

  return (
    <Guarded state={state} what="Assignment">
      {(d) => {
        const a = d.assignment;
        const submitted = new Set(d.submissions.map((x) => x.student.id));
        const missing = d.roster.filter((r) => r.status === 'ACTIVE' && !submitted.has(r.student.id));
        return (
          <div className={s.stack}>
            <PageHeader
              eyebrow={<Link href={`/batches/${a.batchId}/assignments`}>← Back to batch assignments</Link>}
              title={a.title}
              description={<span className={s.row}><StatusBadge status={a.status} /> Due {formatDateTime(a.dueAt)}</span>}
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                  {a.status !== 'CLOSED' && (
                    <Button variant="ghost" size="sm" onClick={() => setClosing(true)}>Close submissions</Button>
                  )}
                </>
              }
            />
            <Card title="Details">
              <DescriptionList
                items={[
                  { label: 'Maximum marks', value: a.maxMarks },
                  { label: 'Submissions', value: `${d.submissions.length} of ${d.expected} active students` },
                  { label: 'Resource', value: a.resourceUrl ? <a className={s.link} href={a.resourceUrl} target="_blank" rel="noopener noreferrer">{a.resourceUrl}</a> : '—' },
                ]}
              />
              <p className={s.body} style={{ marginTop: 12 }}>{a.description}</p>
            </Card>

            <Card title="Submissions">
              {d.submissions.length === 0 ? (
                <EmptyState title="No submissions yet" />
              ) : (
                <DataTable
                  caption="Student submissions"
                  rows={d.submissions}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'student', header: 'Student', render: (r) => r.student.name },
                    { key: 'at', header: 'Submitted', render: (r) => formatDateTime(r.submittedAt), hideOnMobile: true },
                    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'file', header: 'File', render: (r) => (r.file ? <FileDownload file={r.file} /> : '—'), hideOnMobile: true },
                    { key: 'marks', header: 'Marks', render: (r) => (r.marks === null ? '—' : `${r.marks}/${a.maxMarks}`) },
                    { key: 'act', header: <span className="sr-only">Actions</span>, render: (r) => <Button size="sm" variant="outline" onClick={() => setGrading(r)}>{r.status === 'GRADED' ? 'Regrade' : 'Grade'}</Button> },
                  ]}
                />
              )}
            </Card>

            <Card title={`No submission yet (${missing.length})`}>
              {missing.length === 0 ? (
                <p className={s.muted}>Every active student has submitted.</p>
              ) : (
                <ul className={s.list}>
                  {missing.map((r) => (
                    <li key={r.enrollmentId} className={s.spread}>
                      <Link className={s.link} href={`/students/${r.enrollmentId}`}>{r.student.name}</Link>
                      <span className={s.small}>{r.student.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Modal open={editing} onClose={() => setEditing(false)} title="Edit assignment" size="lg">
              <AssignmentForm
                initial={{ title: a.title, description: a.description, resourceUrl: a.resourceUrl ?? '', dueAt: toLocalInput(a.dueAt), maxMarks: String(a.maxMarks), status: a.status }}
                submitLabel="Save changes"
                onCancel={() => setEditing(false)}
                onSubmit={async (payload) => {
                  await api().trainer.updateAssignment(id, payload);
                  setEditing(false);
                  toast('Assignment updated.');
                  state.reload();
                }}
              />
            </Modal>
            <ConfirmDialog
              open={closing}
              title="Close submissions?"
              message="Students will no longer be able to submit or resubmit this assignment. You can reopen it by editing the status."
              confirmLabel="Close submissions"
              onClose={() => setClosing(false)}
              onConfirm={async () => {
                await api().trainer.updateAssignment(id, { status: 'CLOSED' });
                toast('Submissions closed.');
                state.reload();
              }}
            />
            <GradeModal
              submission={grading}
              maxMarks={a.maxMarks}
              onClose={() => setGrading(null)}
              onSaved={() => {
                setGrading(null);
                toast('Grade saved. The student has been notified.');
                state.reload();
              }}
            />
          </div>
        );
      }}
    </Guarded>
  );
}

function GradeModal({ submission, maxMarks, onClose, onSaved }: { submission: Submission | null; maxMarks: number; onClose: () => void; onSaved: () => void }) {
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const [returnIt, setReturnIt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  if (submission && openFor !== submission.id) {
    setOpenFor(submission.id);
    setMarks(submission.marks === null ? '' : String(submission.marks));
    setFeedback(submission.feedback ?? '');
    setReturnIt(false);
    setError(null);
    setFieldError(undefined);
  }
  if (!submission && openFor !== null) setOpenFor(null);

  const save = async () => {
    const m = Number(marks);
    if (marks === '' || !Number.isInteger(m) || m < 0 || m > maxMarks) {
      setFieldError(`Enter a whole number from 0 to ${maxMarks}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api().trainer.grade(submission!.id, { marks: m, ...(feedback.trim() ? { feedback: feedback.trim() } : {}), returnForResubmission: returnIt });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={Boolean(submission)}
      onClose={pending ? () => {} : onClose}
      title={submission ? `Grade — ${submission.student.name}` : 'Grade'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} loading={pending}>Save grade</Button>
        </>
      }
    >
      {submission && (
        <>
          {submission.linkUrl && (
            <p>
              Link:{' '}
              <a className={s.link} href={submission.linkUrl} target="_blank" rel="noopener noreferrer nofollow">
                {submission.linkUrl}
              </a>
            </p>
          )}
          {submission.file && (
            <p>
              File: <FileDownload file={submission.file} /> ({submission.file.originalName})
            </p>
          )}
          {submission.content && <p className={s.body}>{submission.content}</p>}
          {error && <Alert tone="danger">{error}</Alert>}
          <Input label={`Marks (out of ${maxMarks})`} type="number" min={0} max={maxMarks} required value={marks} onChange={(e) => setMarks(e.target.value)} error={fieldError} />
          <Textarea label="Feedback" rows={4} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          <Checkbox label="Return for resubmission (the student can submit again)" checked={returnIt} onChange={(e) => setReturnIt(e.target.checked)} />
        </>
      )}
    </Modal>
  );
}
