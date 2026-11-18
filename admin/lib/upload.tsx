'use client';

import { useId, useRef, useState } from 'react';
import { api, apiBaseUrl, errorMessage } from '@globalantic/api-client';
import { Button, Input } from '@globalantic/ui';
import s from './admin.module.css';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const PUBLIC_FILE = /^https?:\/\/[^/]+\/api\/files\/public\/([0-9a-f-]{36})$/i;

/** Client-side hint only — the server checks the real type from the bytes. */
export function checkImage(file: File): string | null {
  if (file.size === 0) return 'The file is empty';
  if (file.size > MAX_BYTES) return 'The image is larger than 5 MB';
  if (file.type && !IMAGE_TYPES.includes(file.type)) return 'Only PNG, JPEG or WEBP images are allowed';
  return null;
}

/**
 * Uploaded images are stored as the RELATIVE path /api/files/public/<id>, never as the absolute
 * URL the API returns (which carries whatever host the API runs on — e.g. localhost during local
 * work — and would break once the content is served from production).
 */
export function toStoredImageRef(url: string): string {
  const m = PUBLIC_FILE.exec(url.trim());
  return m ? `/api/files/public/${m[1]}` : url;
}

/** Turns a stored image reference into something an <img> can load (null if not displayable). */
export function resolveImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith('/api/files/public/')) {
    try {
      return `${new URL(apiBaseUrl()).origin}${src}`;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Image field with an "Upload image" option. Uploads go to the public image store
 * (COURSE_IMAGE / CMS_IMAGE) and the relative reference fills the field; a manual https:// URL
 * can still be typed. With `onAltChange`, an alt-text input is shown (required when an image is set).
 */
export function ImageField({
  label,
  value,
  onChange,
  error,
  purpose,
  alt,
  onAltChange,
  altError,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  purpose: 'COURSE_IMAGE' | 'CMS_IMAGE';
  alt?: string;
  onAltChange?: (alt: string) => void;
  altError?: string;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file || pending) return;
    const hint = checkImage(file);
    if (hint) {
      setUploadError(hint);
      return;
    }
    setPending(true);
    setUploadError(null);
    try {
      const meta = await api().files.upload(file, purpose);
      if (!meta.url) throw new Error('The server did not return a public URL for this image.');
      // Course thumbnails must stay absolute (the training API validates a full URL); CMS images are stored relative.
      onChange(purpose === 'CMS_IMAGE' ? toStoredImageRef(meta.url) : meta.url);
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = resolveImageSrc(value);
  return (
    <div className={s.stackSm}>
      <Input label={label} placeholder="https://… or upload an image" value={value} onChange={(e) => onChange(purpose === 'CMS_IMAGE' ? toStoredImageRef(e.target.value) : e.target.value)} error={error ?? uploadError ?? undefined} />
      <div className={s.row}>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="sr-only"
          aria-label={`Upload ${label.toLowerCase()} (PNG, JPEG or WEBP, up to 5 MB)`}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button type="button" size="sm" variant="outline" loading={pending} onClick={() => fileRef.current?.click()}>
          {pending ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')} disabled={pending}>
            Remove
          </Button>
        )}
        <span className={s.small}>PNG, JPEG or WEBP · max 5 MB</span>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary image URL
        <img src={preview} alt={alt?.trim() || `${label} preview`} className={s.imagePreview} />
      )}
      {onAltChange && value && (
        <Input
          label="Alt text"
          required
          value={alt ?? ''}
          error={altError}
          hint="Describe what the image shows for screen-reader users, e.g. “Homepage of the travel website on a laptop”."
          onChange={(e) => onAltChange(e.target.value)}
        />
      )}
    </div>
  );
}
