'use client';

import { useRef, useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, Button, Input } from '@globalantic/ui';
import { checkImage, resolveImageSrc, toStoredImageRef } from './upload';
import s from './admin.module.css';

/** Ordered list of image URLs: upload several, add an https URL, reorder and remove. */
export function GalleryField({ label, value, onChange, max = 30, error }: { label: string; value: string[]; onChange: (v: string[]) => void; max?: number; error?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setPending(true);
    setUploadError(null);
    const added: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) {
        const hint = checkImage(file);
        if (hint) throw new Error(`${file.name}: ${hint}`);
        const meta = await api().files.upload(file, 'CMS_IMAGE');
        if (!meta.url) throw new Error('The server did not return a public URL for this image.');
        added.push(toStoredImageRef(meta.url));
      }
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      if (added.length) onChange([...value, ...added]);
      setPending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className={s.stackSm}>
      <strong>{label}</strong>
      {(uploadError || error) && <Alert tone="danger">{uploadError ?? error}</Alert>}
      {value.length === 0 && <p className={s.small}>No images yet.</p>}
      <ul className={s.list}>
        {value.map((src, i) => (
          <li key={`${src}-${i}`} className={s.listItem}>
            <div className={s.rowBetween}>
              <span className={s.row}>
                {resolveImageSrc(src) && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an arbitrary image URL
                  <img src={resolveImageSrc(src)!} alt={`${label} ${i + 1}`} style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                )}
                <span className={s.small} style={{ wordBreak: 'break-all' }}>{src}</span>
              </span>
              <span className={s.actions}>
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move image ${i + 1} up`}>↑</Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`Move image ${i + 1} down`}>↓</Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, k) => k !== i))} aria-label={`Remove image ${i + 1}`}>Remove</Button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      {value.length < max && (
        <div className={s.row}>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Upload images to ${label.toLowerCase()}`} onChange={(e) => void upload(e.target.files)} />
          <Button size="sm" variant="outline" loading={pending} onClick={() => fileRef.current?.click()}>{pending ? 'Uploading…' : 'Upload images'}</Button>
          <Input label="…or add an https:// URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" variant="ghost" disabled={!/^https:\/\//.test(url.trim())} onClick={() => { onChange([...value, url.trim()]); setUrl(''); }}>Add URL</Button>
        </div>
      )}
    </div>
  );
}
