'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { StoredFileMeta, StudentAssignment } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  DescriptionList,
  ErrorState,
  Input,
  PageHeader,
  StatusBadge,
  Textarea,
  formatDateTime,
  useAsync,
  useToast,
} from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

/** The API returns the attached file's metadata on the submission (not yet in the shared type). */
type SubmissionFile = StoredFileMeta | null | undefined;
const fileOf = (a: StudentAssignment): SubmissionFile => (a.submission as unknown as { file?: SubmissionFile } | null)?.file;

function FileLink({ file }: { file: StoredFileMeta }) {
  return (
    <a href={api().files.url(file.id)} download={file.name} className={s.link}>
      Download {file.name} ({Math.max(1, Math.round(file.sizeBytes / 1024))} KB)
    </a>
  );
}

function SubmissionForm({ a, onSaved }: { a: StudentAssignment; onSaved: () => void }) {
  const toast = useToast();
  const [content, setContent] = useState(a.submission?.content ?? '');
  const [linkUrl, setLinkUrl] = useState(a.submission?.linkUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const existingFile = fileOf(a);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (pending) return;
    if (!content.trim() && !linkUrl.trim() && !file && !existingFile) {
      setErrors({ content: 'Add your answer, a link or a file' });
      return;
    }
    if (file && file.size > MAX_BYTES) {
      setErrors({ file: 'The file is larger than 5 MB' });
      return;
    }
    if (linkUrl.trim() && !linkUrl.trim().startsWith('https://')) {
      setErrors({ linkUrl: 'Only https:// links are allowed' });
      return;
    }
    setPending(true);
    try {
      let fileId = existingFile?.id;
      if (file) {
        setStage('uploading');
        try {
          fileId = (await api().files.upload(file, 'ASSIGNMENT_SUBMISSION')).id;
        } catch (err) {
          setErrors({ file: fieldErrorMap(err).file ?? errorMessage(err) });
          setError(`Upload failed: ${errorMessage(err)}`);
          return;
        }
      }
      setStage('saving');
      const r = await api().student.submit(a.id, { content: content.trim() || undefined, linkUrl: linkUrl.trim() || undefined, fileId });
      setFile(null);
      toast(r.status === 'LATE' ? 'Submitted (after the due date)' : 'Submission saved');
      onSaved();
    } catch (err) {
      setErrors(fieldErrorMap(err));
      setError(errorMessage(err));
    } finally {
      setPending(false);
      setStage('idle');
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Textarea label="Your answer" rows={8} maxLength={10000} value={content} onChange={(e) => setContent(e.target.value)} error={errors.content} />
      <Input
        label="Link to your work"
        type="url"
        inputMode="url"
        placeholder="https://github.com/you/project"
        hint="Optional. Use a public https:// link (GitHub, Google Drive, etc.)."
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        error={errors.linkUrl}
      />
      {existingFile && !file && (
        <p className={s.body}>
          Attached file: <FileLink file={existingFile} /> — choose a new file below to replace it.
        </p>
      )}
      <Input
        label="Attach a file"
        type="file"
        accept={ACCEPT}
        hint="Optional. PDF, PNG, JPEG or WEBP, up to 5 MB."
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        error={errors.file ?? errors.fileId}
        disabled={pending}
      />
      <div className={s.actions}>
        <Button type="submit" loading={pending} disabled={pending}>
          {stage === 'uploading' ? 'Uploading file…' : stage === 'saving' ? 'Saving…' : a.submission ? 'Update submission' : 'Submit'}
        </Button>
      </div>
    </form>
  );
}

export default function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle('Assignment');
  const state = useAsync(() => api().student.assignment(id), `assignment-${id}`);
  if (state.status === 404) return <ErrorState title="Assignment not found" message="It may have been removed, or it is not part of your batch." />;

  return (
    <AsyncView state={state} loadingRows={4}>
      {(a) => {
        const sub = a.submission;
        const locked = sub?.status === 'GRADED';
        const closed = a.status !== 'PUBLISHED';
        const overdue = new Date(a.dueAt).getTime() < Date.now();
        return (
          <div className={s.stack}>
            <PageHeader eyebrow={`${a.batch.course.title} · ${a.batch.name}`} title={a.title} actions={sub ? <StatusBadge status={sub.status} /> : <StatusBadge status={a.status} />} />
            <div className={s.grid2}>
              <Card title="Instructions">
                <p className={s.body}>{a.description}</p>
                {a.resourceUrl && (
                  <p style={{ marginTop: 12 }}>
                    <a href={a.resourceUrl} target="_blank" rel="noopener noreferrer" className={s.link}>
                      Open resource<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </p>
                )}
              </Card>
              <Card title="Details">
                <DescriptionList
                  items={[
                    { label: 'Due', value: formatDateTime(a.dueAt) },
                    { label: 'Maximum marks', value: a.maxMarks },
                    { label: 'Submitted', value: sub ? formatDateTime(sub.submittedAt) : 'Not yet' },
                    { label: 'Marks', value: sub?.marks !== null && sub?.marks !== undefined ? `${sub.marks}/${a.maxMarks}` : '—' },
                    { label: 'Graded', value: formatDateTime(sub?.gradedAt ?? null) },
                  ]}
                />
              </Card>
            </div>

            {sub?.feedback && (
              <Alert tone={sub.status === 'RETURNED' ? 'warning' : 'info'} title={sub.status === 'RETURNED' ? 'Returned for changes' : 'Trainer feedback'}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{sub.feedback}</p>
              </Alert>
            )}

            <Card title="Your submission">
              {locked ? (
                <div className={s.stackSm}>
                  <Alert tone="success">This assignment has been graded and is locked.</Alert>
                  {sub?.content && <p className={s.body}>{sub.content}</p>}
                  {sub?.linkUrl && (
                    <a href={sub.linkUrl} target="_blank" rel="noopener noreferrer" className={s.link}>
                      {sub.linkUrl}
                    </a>
                  )}
                  {fileOf(a) && <FileLink file={fileOf(a)!} />}
                </div>
              ) : closed ? (
                <Alert tone="warning">This assignment is closed for submissions.</Alert>
              ) : (
                <div className={s.stackSm}>
                  {overdue && <Alert tone="warning">The due date has passed. Your submission will be marked late.</Alert>}
                  <SubmissionForm a={a} onSaved={state.reload} />
                </div>
              )}
            </Card>
          </div>
        );
      }}
    </AsyncView>
  );
}
