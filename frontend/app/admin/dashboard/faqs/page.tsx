'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminShell';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { ListToolbar } from '@/components/admin/ListToolbar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/Toast';
import { useListParams } from '@/hooks/useListParams';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { applyListQuery } from '@/lib/query';
import { faqSchema, validate } from '@/lib/validation/admin';
import { faqService } from '@/services/admin/faq.service';
import type { Faq } from '@/types';
import styles from '../../admin.module.css';

type FormValues = { question: string; answer: string; category: string; order: string };
type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { question: '', answer: '', category: 'general', order: '0' };

/** CMS → FAQs: questions shown on the public site (GET /api/faqs, filterable by category). */
export default function FaqsPage() {
  const toast = useToast();
  const { query, setQuery, resetQuery, hasFilters } = useListParams();
  const { data, error, loading, reload } = useServiceQuery(() => faqService.list(), 'faqs');

  const categories = useMemo(() => [...new Set((data ?? []).map((f) => f.category))].sort(), [data]);
  const page = useMemo(
    () =>
      applyListQuery(data ?? [], query, {
        searchFields: ['question', 'answer', 'category'],
        sortableFields: ['question', 'category', 'order'],
        defaultSort: 'category',
        matchStatus: (f, status) => f.category === status,
      }),
    [data, query],
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Faq | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function openEditor(row: Faq | null) {
    setEditing(row);
    setValues(row ? { question: row.question, answer: row.answer, category: row.category, order: String(row.order) } : EMPTY);
    setErrors({});
    setFormError(null);
    setEditorOpen(true);
  }

  function setValue(name: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  async function handleSave() {
    if (saving) return; // no double submits
    setFormError(null);
    const checked = validate(faqSchema, values);
    if (!checked.ok) {
      setErrors(Object.fromEntries(checked.errors.map((e) => [e.field, e.message])) as FieldErrors);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      if (editing) await faqService.update(editing.id, checked.data);
      else await faqService.create(checked.data);
      toast.success(editing ? 'FAQ updated' : 'FAQ created', 'The public FAQ list now shows this change.');
      setEditorOpen(false);
      reload();
    } catch (err) {
      if (isServiceError(err) && err.fieldErrors.length > 0) {
        setErrors(Object.fromEntries(err.fieldErrors.map((e) => [e.field, e.message])) as FieldErrors);
      }
      setFormError(errorMessage(err, 'Could not save the FAQ.'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await faqService.remove(deleting.id);
      toast.success('FAQ deleted', 'It no longer appears on the website.');
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error('Delete failed', errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: Column<Faq>[] = [
    { key: 'question', label: 'Question', sortable: true, render: (row) => <span className={styles.cellStrong}>{row.question}</span> },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'order', label: 'Order', sortable: true },
    {
      key: '__actions',
      label: 'Actions',
      hideLabel: true,
      align: 'end',
      render: (row) => (
        <div className={styles.rowActions}>
          <button type="button" className={styles.linkBtn} onClick={() => openEditor(row)}>
            <Pencil size={14} aria-hidden /> Edit<span className="sr-only"> {row.question}</span>
          </button>
          <button type="button" className={[styles.linkBtn, styles.dangerBtn].join(' ')} onClick={() => setDeleting(row)}>
            <Trash2 size={14} aria-hidden /> Delete<span className="sr-only"> {row.question}</span>
          </button>
        </div>
      ),
    },
  ];

  const newButton = (
    <Button size="sm" onClick={() => openEditor(null)}>
      <Plus size={16} aria-hidden /> New FAQ
    </Button>
  );

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="No FAQs match your filters"
      description="Try a different search term or category."
      action={
        <Button variant="outline" size="sm" onClick={resetQuery}>
          Reset filters
        </Button>
      }
    />
  ) : (
    <EmptyState title="No FAQs yet" description="Add the first question to show it on the website." action={newButton} />
  );

  return (
    <>
      <PageHeader title="FAQs" description="Frequently asked questions shown on the website, grouped by category." actions={newButton} />

      <ListToolbar
        search={query.search ?? ''}
        onSearch={(search) => setQuery({ search })}
        searchPlaceholder="Search questions…"
        status={query.status}
        statuses={categories}
        statusLabel="Category"
        onStatus={(status) => setQuery({ status })}
        hasFilters={hasFilters}
        onReset={resetQuery}
      />

      {error ? (
        <div className={styles.panel}>
          <ErrorState title="Could not load FAQs" message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <DataTable<Faq>
            caption="FAQs"
            columns={columns}
            rows={page.items}
            loading={loading}
            empty={empty}
            sort={query.sort}
            direction={query.direction ?? 'asc'}
            onSortChange={(sort, direction) => setQuery({ sort, direction })}
          />
          {page.meta.total > 0 && (
            <Pagination
              meta={page.meta}
              itemLabel="FAQs"
              onPageChange={(p) => setQuery({ page: p })}
              onPageSizeChange={(pageSize) => setQuery({ pageSize })}
            />
          )}
        </>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        dismissible={!saving}
        title={editing ? 'Edit FAQ' : 'New FAQ'}
        description="Fields marked * are required."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create FAQ'}
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
            <div className={styles.fullRow}>
              <Field label="Question" htmlFor="faq-question" required error={errors.question}>
                <Input id="faq-question" invalid={Boolean(errors.question)} aria-required value={values.question} maxLength={300} onChange={(e) => setValue('question', e.target.value)} />
              </Field>
            </div>
            <div className={styles.fullRow}>
              <Field label="Answer" htmlFor="faq-answer" required error={errors.answer}>
                <Textarea id="faq-answer" rows={5} invalid={Boolean(errors.answer)} aria-required value={values.answer} maxLength={4000} onChange={(e) => setValue('answer', e.target.value)} />
              </Field>
            </div>
            <div>
              <Field label="Category" htmlFor="faq-category" required error={errors.category}>
                <Input
                  id="faq-category"
                  invalid={Boolean(errors.category)}
                  aria-required
                  aria-describedby="faq-category-help"
                  value={values.category}
                  spellCheck={false}
                  list="faq-categories"
                  onChange={(e) => setValue('category', e.target.value.toLowerCase())}
                />
                <datalist id="faq-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <span id="faq-category-help" className={styles.help}>
                  Lowercase, e.g. general, training.
                </span>
              </Field>
            </div>
            <div>
              <Field label="Order" htmlFor="faq-order" error={errors.order}>
                <Input id="faq-order" type="number" inputMode="numeric" min={0} invalid={Boolean(errors.order)} value={values.order} onChange={(e) => setValue('order', e.target.value)} />
              </Field>
            </div>
          </div>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this FAQ?"
        description={deleting ? `“${deleting.question}” will be removed from the website. This cannot be undone.` : ''}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
