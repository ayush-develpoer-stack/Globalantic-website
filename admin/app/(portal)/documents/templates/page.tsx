'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, Checkbox, Input, Modal, PageHeader, Select, Textarea, Toolbar, useAsync, useSession } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import { DOC_TYPE_LABEL, LineItemsEditor, SectionsEditor, cleanSections, docTypeOptions, linesFromApi, linesToApi, type LineForm, type SectionForm } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function TemplateModal({ template, open, onClose, onSaved }: { template: Row | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('QUOTATION');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [lines, setLines] = useState<LineForm[]>([]);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!open) return;
    setType(template?.type ?? 'QUOTATION');
    setName(template?.name ?? '');
    setTitle(template?.title ?? '');
    setSections(((template?.sections as Row[]) ?? []).map((x) => ({ heading: x.heading, body: x.body })));
    setLines(linesFromApi(template?.items));
    setNotes(template?.notes ?? '');
    setTerms(template?.terms ?? '');
    setError(null);
    setErrors({});
  }, [open, template]);
  const save = async () => {
    const { items, error: lineError } = linesToApi(lines);
    if (lineError) return setError(lineError);
    setPending(true);
    setError(null);
    setErrors({});
    const body = { type, name: name.trim(), title: title.trim() || null, sections: cleanSections(sections), items, notes: notes.trim() || null, terms: terms.trim() || null };
    try {
      if (template) await api().documents.updateTemplate(template.id, body);
      else await api().documents.createTemplate(body);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={template ? 'Edit template' : 'New template'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save template</Button></>}>
      <div className={s.stack}>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className={s.formGrid}>
          <Select label="Document type" value={type} onChange={(e) => setType(e.target.value)} options={docTypeOptions} />
          <Input label="Template name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <div className={s.span2}>
            <Input label="Default document title (optional)" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <Card title="Sections">
          <SectionsEditor sections={sections} onChange={setSections} hint="Use only wording your business has approved." />
        </Card>
        <Card title="Default line items (optional)">
          <LineItemsEditor lines={lines} onChange={setLines} showGst />
        </Card>
        <Textarea label="Notes" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Textarea label="Terms" rows={5} maxLength={20000} value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function TemplatesPage() {
  const { can } = useSession();
  const canEdit = can('documents.settings');
  const { ask, dialog } = useConfirm();
  const [type, setType] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const state = useAsync(() => api().documents.templates({ type: type || undefined, includeArchived: archived ? 'true' : undefined }), `doc-templates-${type}-${archived}`);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>}
        title="Document templates"
        description={canEdit ? 'Reusable titles, sections, terms and default items. Drafts copy them; issued documents never change when a template changes.' : 'Reusable starting points for documents. Only admins can change them.'}
        actions={canEdit ? <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>New template</Button> : undefined}
      />
      <Toolbar>
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" options={docTypeOptions} />
        <div className={s.filterCheck}>
          <Checkbox label="Show archived" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        </div>
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No templates yet', description: canEdit ? 'Create a template for documents you send often.' : undefined }}>
        {(rows) => (
          <ul className={s.list}>
            {rows.map((t: Row) => (
              <li key={t.id} className={s.listItem}>
                <div className={s.rowBetween}>
                  <span className={s.strong}>{t.name}</span>
                  <span className={s.row}>
                    <Badge tone="primary">{DOC_TYPE_LABEL[t.type]}</Badge>
                    {t.archivedAt && <Badge tone="warning">Archived</Badge>}
                  </span>
                </div>
                <span className={s.small}>{(t.sections as Row[]).length} section(s) · {(t.items as Row[]).length} default item(s){t.title ? ` · “${t.title}”` : ''}</span>
                {canEdit && (
                  <div className={s.actions}>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: t.archivedAt ? 'Restore template?' : 'Archive template?', confirmLabel: t.archivedAt ? 'Restore' : 'Archive', onConfirm: async () => { await api().documents.archiveTemplate(t.id, !t.archivedAt); state.reload(); }, success: 'Template updated' })}>
                      {t.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
      <TemplateModal template={editing} open={open} onClose={() => setOpen(false)} onSaved={state.reload} />
      {dialog}
    </>
  );
}
