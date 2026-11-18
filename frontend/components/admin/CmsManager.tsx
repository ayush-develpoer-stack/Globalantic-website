'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Eye, EyeOff, ImageUp, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/StateView';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useListParams } from '@/hooks/useListParams';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { cmsSchemas, validate } from '@/lib/validation/admin';
import { CMS_STATUS_FILTERS, cmsService } from '@/services/admin/cms.service';
import { IMAGE_ACCEPT, checkImageFile, uploadService } from '@/services/admin/upload.service';
import type { CmsRecord, CmsResource } from '@/types';
import { PageHeader } from './AdminShell';
import { DataTable, type Column } from './DataTable';
import { ListToolbar } from './ListToolbar';
import styles from '@/app/admin/admin.module.css';

export type FieldType = 'text' | 'textarea' | 'slug' | 'number' | 'boolean' | 'stringList' | 'json' | 'image';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
}

export interface ListColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

interface CmsManagerProps {
  resource: CmsResource;
  /** Plural title, e.g. "Services". */
  title: string;
  /** Singular noun, e.g. "service". */
  singular: string;
  description: string;
  fields: FieldDef[];
  listColumns: ListColumn[];
}

type FormValues = Record<string, string | boolean>;
type FieldErrors = Record<string, string>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toFormValues(fields: FieldDef[], row: CmsRecord | null): FormValues {
  const values: FormValues = {};
  for (const f of fields) {
    const v = row ? row[f.name] : undefined;
    switch (f.type) {
      case 'boolean':
        values[f.name] = row ? Boolean(v) : f.name === 'published';
        break;
      case 'stringList':
        values[f.name] = Array.isArray(v) ? v.map((x) => String(x)).join('\n') : '';
        break;
      case 'json':
        values[f.name] = v === null || v === undefined ? '' : JSON.stringify(v, null, 2);
        break;
      default:
        values[f.name] = v === null || v === undefined ? '' : String(v);
    }
  }
  return values;
}

/** Converts form strings into the API payload shape; JSON parse errors become field errors. */
function buildPayload(fields: FieldDef[], values: FormValues): { data: Record<string, unknown>; errors: FieldErrors } {
  const data: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const raw = values[f.name];
    switch (f.type) {
      case 'boolean':
        data[f.name] = Boolean(raw);
        break;
      case 'number': {
        const s = String(raw ?? '').trim();
        if (s !== '') data[f.name] = s; // zod coerces and validates
        break;
      }
      case 'stringList':
        data[f.name] = String(raw ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        break;
      case 'json': {
        const s = String(raw ?? '').trim();
        if (s === '') {
          data[f.name] = [];
          break;
        }
        try {
          const parsed: unknown = JSON.parse(s);
          if (!Array.isArray(parsed)) errors[f.name] = 'Must be a JSON array, e.g. [ { … } ]';
          else data[f.name] = parsed;
        } catch {
          errors[f.name] = 'Invalid JSON — check quotes, commas and brackets';
        }
        break;
      }
      default:
        data[f.name] = String(raw ?? '');
    }
  }
  return { data, errors };
}

export function CmsManager({ resource, title, singular, description, fields, listColumns }: CmsManagerProps) {
  const toast = useToast();
  const { query, setQuery, resetQuery, hasFilters } = useListParams();
  const { data, error, loading, reload, setData } = useServiceQuery(
    () => cmsService.list(resource, query),
    `${resource}:${JSON.stringify(query)}`,
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CmsRecord | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [initialValues, setInitialValues] = useState<FormValues>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [deleting, setDeleting] = useState<CmsRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

  const hasPublished = fields.some((f) => f.name === 'published' && f.type === 'boolean');
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initialValues), [values, initialValues]);
  const capSingular = singular.charAt(0).toUpperCase() + singular.slice(1);

  function openEditor(row: CmsRecord | null) {
    const initial = toFormValues(fields, row);
    setEditing(row);
    setValues(initial);
    setInitialValues(initial);
    setFieldErrors({});
    setFormError(null);
    setSlugTouched(Boolean(row));
    setEditorOpen(true);
  }

  function setValue(name: string, value: string | boolean) {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      // Suggest a slug from the title for new records until the slug is edited.
      if (name === 'title' && !slugTouched && typeof value === 'string' && 'slug' in prev) next.slug = slugify(value);
      return next;
    });
    if (name === 'slug') setSlugTouched(true);
    if (fieldErrors[name]) setFieldErrors(({ [name]: _removed, ...rest }) => rest);
  }

  async function handleSave() {
    if (saving) return; // no double submits
    setFormError(null);
    const built = buildPayload(fields, values);
    const checked = validate(cmsSchemas[resource], built.data);
    const errors: FieldErrors = { ...built.errors };
    if (!checked.ok) for (const e of checked.errors) errors[e.field] ??= e.message;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const count = Object.keys(errors).length;
      setFormError(`Please fix ${count} ${count === 1 ? 'field' : 'fields'} highlighted below.`);
      return;
    }

    setSaving(true);
    try {
      const saved = editing
        ? await cmsService.update(resource, editing.id, built.data)
        : await cmsService.create(resource, built.data);
      toast.success(editing ? `${capSingular} updated` : `${capSingular} created`, `“${saved.title}” was saved.`);
      setEditorOpen(false);
      reload();
    } catch (err) {
      if (isServiceError(err) && err.fieldErrors.length > 0) {
        setFieldErrors(Object.fromEntries(err.fieldErrors.map((e) => [e.field, e.message])));
      }
      setFormError(errorMessage(err, 'Could not save. Please review the fields and try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(row: CmsRecord) {
    setPublishBusyId(row.id);
    try {
      const updated = await cmsService.setPublished(resource, row.id, !row.published);
      setData((current) =>
        current ? { ...current, items: current.items.map((r) => (r.id === row.id ? updated : r)) } : current,
      );
      toast.success(updated.published ? 'Published' : 'Moved to drafts', `“${row.title}” is now ${updated.published ? 'live on the website' : 'hidden from the website'}.`);
    } catch (err) {
      toast.error('Could not change visibility', errorMessage(err));
    } finally {
      setPublishBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await cmsService.remove(resource, deleting.id);
      toast.success(`${capSingular} deleted`, `“${deleting.title}” was removed.`);
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error('Delete failed', errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: Column<CmsRecord>[] = [
    ...listColumns.map((c): Column<CmsRecord> => {
      const field = fields.find((f) => f.name === c.key);
      const base = { key: c.key, label: c.label, sortable: c.sortable };
      if (c.key === 'title') {
        return { ...base, render: (row) => <span className={styles.cellStrong}>{row.title}</span> };
      }
      if (c.key === 'published') {
        return {
          ...base,
          label: 'Visibility',
          render: (row) => <StatusBadge status={row.published ? 'Published' : 'Draft'} tone={row.published ? 'success' : 'neutral'} />,
        };
      }
      if (field?.type === 'boolean') {
        return { ...base, render: (row) => (row[c.key] ? 'Yes' : 'No') };
      }
      if (c.key === 'updatedAt' || c.key === 'publishedAt') {
        return { ...base, render: (row) => formatDate(row[c.key] as string | null) };
      }
      return base;
    }),
    {
      key: '__actions',
      label: 'Actions',
      hideLabel: true,
      align: 'end',
      render: (row) => (
        <div className={styles.rowActions}>
          {hasPublished && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => togglePublished(row)}
              disabled={publishBusyId === row.id}
              aria-busy={publishBusyId === row.id || undefined}
            >
              {row.published ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              {row.published ? 'Unpublish' : 'Publish'}
              <span className="sr-only"> {row.title}</span>
            </button>
          )}
          <button type="button" className={styles.linkBtn} onClick={() => openEditor(row)}>
            <Pencil size={14} aria-hidden /> Edit<span className="sr-only"> {row.title}</span>
          </button>
          <button type="button" className={[styles.linkBtn, styles.dangerBtn].join(' ')} onClick={() => setDeleting(row)}>
            <Trash2 size={14} aria-hidden /> Delete<span className="sr-only"> {row.title}</span>
          </button>
        </div>
      ),
    },
  ];

  const newButton = (
    <Button size="sm" onClick={() => openEditor(null)}>
      <Plus size={16} aria-hidden /> New {singular}
    </Button>
  );

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title={`No ${title.toLowerCase()} match your filters`}
      description="Try a different search term or visibility filter."
      action={
        <Button variant="outline" size="sm" onClick={resetQuery}>
          Reset filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      title={`No ${title.toLowerCase()} yet`}
      description={`Create the first ${singular} to show it on the website.`}
      action={newButton}
    />
  );

  return (
    <>
      <PageHeader title={title} description={description} actions={newButton} />

      <ListToolbar
        search={query.search ?? ''}
        onSearch={(search) => setQuery({ search })}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
        status={query.status}
        statuses={hasPublished ? CMS_STATUS_FILTERS : undefined}
        statusLabel="Visibility"
        onStatus={hasPublished ? (status) => setQuery({ status }) : undefined}
        hasFilters={hasFilters}
        onReset={resetQuery}
      />

      {error ? (
        <div className={styles.panel}>
          <ErrorState title={`Could not load ${title.toLowerCase()}`} message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <DataTable<CmsRecord>
            caption={title}
            columns={columns}
            rows={data?.items ?? []}
            loading={loading}
            empty={empty}
            sort={query.sort}
            direction={query.direction ?? 'asc'}
            onSortChange={(sort, direction) => setQuery({ sort, direction })}
          />
          {data && data.meta.total > 0 && (
            <Pagination
              meta={data.meta}
              itemLabel={title.toLowerCase()}
              onPageChange={(page) => setQuery({ page })}
              onPageSizeChange={(pageSize) => setQuery({ pageSize })}
            />
          )}
        </>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        dismissible={!saving}
        size="lg"
        title={editing ? `Edit ${singular}` : `New ${singular}`}
        description={editing ? `Editing “${editing.title}”` : `Fields marked * are required.`}
        footer={
          <>
            {dirty && !saving && <span className={styles.dirtyNote}>Unsaved changes</span>}
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : `Create ${singular}`}
            </Button>
          </>
        }
      >
        <form
          className={styles.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {formError && (
            <p className={styles.formError} role="alert">
              <AlertCircle size={18} aria-hidden /> {formError}
            </p>
          )}
          <div className={styles.formGrid}>
            {fields.map((f) => (
              <FieldControl key={f.name} field={f} value={values[f.name]} error={fieldErrors[f.name]} onChange={(v) => setValue(f.name, v)} />
            ))}
          </div>
          {/* Lets Enter in a single-line input submit the form. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete this ${singular}?`}
        description={deleting ? `“${deleting.title}” will be permanently removed from the website. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

interface FieldControlProps {
  field: FieldDef;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean) => void;
}

function FieldControl({ field, value, error, onChange }: FieldControlProps): ReactNode {
  const id = `cms-${field.name}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const wide = field.type === 'textarea' || field.type === 'stringList' || field.type === 'json';

  if (field.type === 'image') {
    return <ImageFieldControl field={field} value={String(value ?? '')} error={error} onChange={onChange} />;
  }

  if (field.type === 'boolean') {
    return (
      <div className={[styles.checkRow, styles.fullRow].join(' ')}>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{field.label}</label>
      </div>
    );
  }

  const common = {
    id,
    invalid: Boolean(error),
    'aria-describedby': helpId,
    'aria-required': field.required || undefined,
  };

  const control = wide ? (
    <Textarea
      {...common}
      rows={field.type === 'textarea' ? 5 : 4}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={field.type === 'json' ? styles.monoField : undefined}
      placeholder={field.type === 'stringList' ? 'One item per line' : field.type === 'json' ? '[ … ]' : undefined}
    />
  ) : (
    <Input
      {...common}
      type={field.type === 'number' ? 'number' : 'text'}
      inputMode={field.type === 'number' ? 'numeric' : undefined}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={field.type === 'slug' ? false : undefined}
    />
  );

  return (
    <div className={wide ? styles.fullRow : undefined}>
      <Field label={field.label} htmlFor={id} required={field.required} error={error}>
        {control}
        {field.help && (
          <span id={helpId} className={styles.help}>
            {field.help}
          </span>
        )}
      </Field>
    </div>
  );
}

/**
 * Single image URL field: manual URL entry plus "Upload image" (stored by the
 * API's public image store; the returned URL is written into the field).
 */
function ImageFieldControl({ field, value, error, onChange }: { field: FieldDef; value: string; error?: string; onChange: (value: string) => void }) {
  const id = `cms-${field.name}`;
  const helpId = `${id}-help`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    const problem = checkImageFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadService.uploadImage(file);
      if (!uploaded.url) throw new Error('The server did not return an image URL.');
      onChange(uploaded.url);
    } catch (err) {
      setUploadError(isServiceError(err) && err.fieldErrors[0] ? err.fieldErrors[0].message : errorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const shownError = error ?? uploadError ?? undefined;
  return (
    <div className={styles.fullRow}>
      <Field label={field.label} htmlFor={id} required={field.required} error={shownError}>
        <div className={styles.imageField}>
          <Input
            id={id}
            type="text"
            inputMode="url"
            invalid={Boolean(shownError)}
            aria-describedby={helpId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            spellCheck={false}
          />
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploading} disabled={uploading}>
            <ImageUp size={16} aria-hidden /> {uploading ? 'Uploading…' : 'Upload image'}
          </Button>
        </div>
        <span id={helpId} className={styles.help}>
          {field.help ?? 'Paste an image URL or upload a PNG, JPEG or WEBP (max 5 MB).'}
        </span>
        {value && /^https?:\/\//.test(value) && (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary URL
          <img src={value} alt={`Preview of ${field.label.toLowerCase()}`} className={styles.imagePreview} />
        )}
      </Field>
    </div>
  );
}
