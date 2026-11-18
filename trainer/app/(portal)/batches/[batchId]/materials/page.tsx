'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { MATERIAL_TYPES, enumLabel, type LearningMaterial } from '@globalantic/types';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Input, Select, Textarea, formatDate, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

const empty = { title: '', description: '', type: 'LINK', url: '' };
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

export default function MaterialsPage() {
  const batchId = useParam('batchId');
  const toast = useToast();
  const state = useAsync(() => api().trainer.materials(batchId), `mat:${batchId}`);
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<LearningMaterial | null>(null);
  const [source, setSource] = useState<'link' | 'file'>('link');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (v.title.trim().length < 3) errs.title = 'Enter a title (at least 3 characters).';
    if (source === 'link' && !/^https:\/\/\S+$/.test(v.url.trim())) errs.url = 'Enter an https:// link.';
    if (source === 'file' && !file) errs.file = 'Choose a file to upload.';
    if (source === 'file' && file && file.size > MAX_BYTES) errs.file = 'The file is larger than 5 MB.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    try {
      const description = v.description.trim() ? { description: v.description.trim() } : {};
      if (source === 'file' && file) {
        let fileId: string;
        try {
          fileId = (await api().files.upload(file, 'LEARNING_MATERIAL')).id;
        } catch (err) {
          setErrors({ file: fieldErrorMap(err).file ?? errorMessage(err) });
          setError(`Upload failed: ${errorMessage(err)}`);
          return;
        }
        await api().trainer.addMaterial(batchId, { title: v.title.trim(), type: 'DOCUMENT', fileId, ...description });
      } else {
        await api().trainer.addMaterial(batchId, { title: v.title.trim(), type: v.type, url: v.url.trim(), ...description });
      }
      setV(empty);
      setFile(null);
      setFileKey((k) => k + 1);
      toast('Material added. Students have been notified.');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={s.grid2}>
      <Card title="Add material">
        <form onSubmit={add} noValidate className={s.formGrid}>
          {error && (
            <div className={s.full}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <Input containerClassName={s.full} label="Title" required maxLength={200} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={errors.title} />
          <Select
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as 'link' | 'file')}
            options={[
              { value: 'link', label: 'Link (https://)' },
              { value: 'file', label: 'Upload a file' },
            ]}
          />
          {source === 'link' ? (
            <>
              <Select label="Type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={MATERIAL_TYPES.map((t) => ({ value: t, label: enumLabel(t) }))} />
              <Input containerClassName={s.full} label="Link" type="url" required placeholder="https://" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} error={errors.url} hint="Only https:// links." />
            </>
          ) : (
            <Input
              key={fileKey}
              label="File"
              type="file"
              accept={ACCEPT}
              required
              hint="PDF, PNG, JPEG or WEBP, up to 5 MB. Only students of this batch can download it."
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              error={errors.file ?? errors.fileId}
              disabled={pending}
            />
          )}
          <Textarea containerClassName={s.full} label="Description" rows={3} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          <div className={`${s.actions} ${s.full}`}>
            <Button type="submit" loading={pending}>Add material</Button>
          </div>
        </form>
      </Card>
      <Card title="Learning materials">
        <Guarded state={state}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="No materials yet" />
            ) : (
              <ul className={s.list}>
                {items.map((m) => (
                  <li key={m.id} className={s.item}>
                    <div className={s.itemHead}>
                      {m.file ? (
                        <a className={s.link} href={api().files.url(m.file.id)} download={m.file.name}>{m.title}</a>
                      ) : (
                        <a className={s.link} href={m.url ?? undefined} target="_blank" rel="noopener noreferrer">{m.title}</a>
                      )}
                      <Badge>{enumLabel(m.type)}</Badge>
                    </div>
                    {m.description && <p className={s.body}>{m.description}</p>}
                    <div className={s.spread}>
                      <span className={s.small}>Added {formatDate(m.createdAt)}</span>
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Guarded>
      </Card>
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove material?"
        message={removing ? `"${removing.title}" will no longer be visible to students.` : undefined}
        confirmLabel="Remove"
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await api().trainer.removeMaterial(removing!.id);
          toast('Material removed.');
          state.reload();
        }}
      />
    </div>
  );
}
