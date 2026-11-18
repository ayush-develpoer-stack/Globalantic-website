'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { StudentApplication } from '@globalantic/types';
import { Alert, Button, Card, Field, Textarea, formatDateTime, useToast } from '@globalantic/ui';
import s from '@/components/page.module.css';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const ALLOWED = ACCEPT.split(',');

/** True when admissions has asked for more information and the student has not answered yet. */
export function infoRequestOpen(app: Pick<StudentApplication, 'status' | 'infoRequestedAt' | 'infoRespondedAt'>): boolean {
  if (app.status !== 'UNDER_REVIEW' || !app.infoRequestedAt) return false;
  if (!app.infoRespondedAt) return true;
  return new Date(app.infoRespondedAt).getTime() < new Date(app.infoRequestedAt).getTime();
}

/** Notice + response form for an open information request; summary once answered. */
export function InfoRequestPanel({ app, onDone }: { app: StudentApplication; onDone: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const busy = useRef(false);
  const open = infoRequestOpen(app);

  if (!app.infoRequest) return null;

  if (!open) {
    return app.infoResponse ? (
      <Card title="Information request">
        <p className={s.small}>Admissions asked on {formatDateTime(app.infoRequestedAt)}:</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{app.infoRequest}</p>
        <p className={s.small} style={{ marginTop: 12 }}>
          Your response was sent on {formatDateTime(app.infoRespondedAt)}:
        </p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{app.infoResponse}</p>
      </Card>
    ) : null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const local: Record<string, string> = {};
    const text = message.trim();
    if (text.length < 3) local.message = 'Please write at least 3 characters.';
    if (text.length > 4000) local.message = 'Please keep your response under 4000 characters.';
    if (file && !ALLOWED.includes(file.type)) local.file = 'Only PDF, PNG, JPEG or WEBP files are allowed.';
    if (file && file.size > MAX_BYTES) local.file = 'The file is too large (max 5 MB).';
    setErrors(local);
    setError(null);
    if (Object.keys(local).length) return;
    busy.current = true;
    try {
      let documentFileId: string | undefined;
      if (file) {
        setPhase('uploading');
        documentFileId = (await api().files.upload(file, 'ADMISSION_DOCUMENT')).id;
      }
      setPhase('saving');
      await api().student.respondToInfoRequest(app.id, { message: text, documentFileId });
      toast('Your response was sent to admissions');
      setMessage('');
      setFile(null);
      onDone();
    } catch (err) {
      const fields = fieldErrorMap(err);
      if (fields.documentFileId) fields.file = fields.documentFileId;
      setErrors(fields);
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setPhase('idle');
    }
  };

  return (
    <Card title="Admissions needs more information">
      <Alert tone="warning" title={`Requested on ${formatDateTime(app.infoRequestedAt)}`}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{app.infoRequest}</p>
      </Alert>
      <form onSubmit={submit} noValidate className={s.stack} style={{ marginTop: 16 }}>
        <Textarea
          label="Your response"
          required
          rows={5}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={errors.message}
          hint="3–4000 characters"
        />
        <Field label="Supporting document (optional)" error={errors.file} hint="PDF, PNG, JPEG or WEBP, up to 5 MB">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="file"
              accept={ACCEPT}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        {error && !Object.keys(errors).length && <Alert tone="danger">{error}</Alert>}
        <div className={s.actions}>
          <Button type="submit" loading={phase !== 'idle'} disabled={phase !== 'idle'}>
            {phase === 'uploading' ? 'Uploading file…' : phase === 'saving' ? 'Sending…' : 'Send response'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
