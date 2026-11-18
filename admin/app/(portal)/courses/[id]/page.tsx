'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, DataTable, EmptyState, Input, PageHeader, StatusBadge, Tabs, Textarea, buttonClass, formatDate, useAsync, useToast } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';
import { CourseForm, toFormValues } from '../CourseForm';

type Row = Record<string, any>;
interface ModuleDraft { key: string; title: string; description: string; topics: string; durationHours: string }

let keySeq = 0;
const toDraft = (m?: Row): ModuleDraft => ({
  key: `m${(keySeq += 1)}`,
  title: m?.title ?? '',
  description: m?.description ?? '',
  topics: Array.isArray(m?.topics) ? m!.topics.join('\n') : '',
  durationHours: m?.durationHours ? String(m.durationHours) : '',
});

function SyllabusEditor({ courseId, modules, onSaved }: { courseId: string; modules: Row[]; onSaved: () => void }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<ModuleDraft[]>(() => modules.map(toDraft));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDrafts(modules.map(toDraft)), [modules]);

  const update = (key: string, patch: Partial<ModuleDraft>) => setDrafts((d) => d.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const move = (i: number, dir: -1 | 1) =>
    setDrafts((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const copy = [...d];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const save = async () => {
    setError(null);
    if (drafts.some((m) => m.title.trim().length < 2)) {
      setError('Every module needs a title (at least 2 characters).');
      return;
    }
    setPending(true);
    try {
      await api().admin.setModules(
        courseId,
        drafts.map((m) => ({
          title: m.title.trim(),
          description: m.description.trim() || undefined,
          topics: m.topics.split('\n').map((t) => t.trim()).filter(Boolean),
          durationHours: m.durationHours || undefined,
        })),
      );
      toast('Syllabus saved');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Syllabus" actions={<Button size="sm" variant="outline" onClick={() => setDrafts((d) => [...d, toDraft()])}><Plus size={16} aria-hidden /> Add module</Button>}>
      <div className={s.stack}>
        {error && <Alert tone="danger">{error}</Alert>}
        {drafts.length === 0 && <EmptyState title="No modules yet" description="A course needs at least one module before it can be published." />}
        {drafts.map((m, i) => (
          <fieldset key={m.key} className={s.moduleCard}>
            <div className={s.rowBetween}>
              <legend className={s.strong}>Module {i + 1}</legend>
              <div className={s.actions}>
                <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move module ${i + 1} up`}><ArrowUp size={16} aria-hidden /></Button>
                <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === drafts.length - 1} aria-label={`Move module ${i + 1} down`}><ArrowDown size={16} aria-hidden /></Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => d.filter((x) => x.key !== m.key))} aria-label={`Remove module ${i + 1}`}><Trash2 size={16} aria-hidden /></Button>
              </div>
            </div>
            <div className={s.formGrid}>
              <Input label="Title" required value={m.title} onChange={(e) => update(m.key, { title: e.target.value })} maxLength={200} />
              <Input label="Duration (hours)" type="number" min={1} value={m.durationHours} onChange={(e) => update(m.key, { durationHours: e.target.value })} />
              <Textarea label="Description" containerClassName={s.span2} rows={2} value={m.description} onChange={(e) => update(m.key, { description: e.target.value })} />
              <Textarea label="Topics" hint="One topic per line" containerClassName={s.span2} rows={4} value={m.topics} onChange={(e) => update(m.key, { topics: e.target.value })} />
            </div>
          </fieldset>
        ))}
        <div className={s.actions}>
          <Button onClick={save} loading={pending}>Save syllabus</Button>
        </div>
      </div>
    </Card>
  );
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const [tab, setTab] = useState<'details' | 'syllabus' | 'batches'>('details');
  const state = useAsync(() => api().admin.course(id), `course-${id}`);

  const setStatus = (status: string, label: string, tone: 'primary' | 'danger' = 'primary') =>
    ask({
      title: `${label}?`,
      message: status === 'ARCHIVED' ? 'Archived courses disappear from the public site and cannot get new batches.' : status === 'DRAFT' ? 'The course will be hidden from the public site.' : 'The course will be visible on the public training site.',
      confirmLabel: label,
      tone,
      onConfirm: async () => {
        await api().admin.setCourseStatus(id, status);
        state.reload();
      },
      success: 'Course status updated',
    });

  return (
    <AsyncView state={state}>
      {(c) => (
        <>
          <PageHeader
            eyebrow={<Link href="/courses" className={s.link}>← Courses</Link>}
            title={c.title}
            description={<>/{c.slug} · <StatusBadge status={c.status} /></>}
            actions={
              <>
                {c.status !== 'PUBLISHED' && c.status !== 'ARCHIVED' && <Button size="sm" onClick={() => setStatus('PUBLISHED', 'Publish')}>Publish</Button>}
                {c.status === 'PUBLISHED' && <Button size="sm" variant="outline" onClick={() => setStatus('DRAFT', 'Unpublish')}>Unpublish</Button>}
                {c.status === 'ARCHIVED' && <Button size="sm" variant="outline" onClick={() => setStatus('DRAFT', 'Restore as draft')}>Restore as draft</Button>}
                {c.status !== 'ARCHIVED' && <Button size="sm" variant="danger" onClick={() => setStatus('ARCHIVED', 'Archive', 'danger')}>Archive</Button>}
              </>
            }
          />
          <Tabs label="Course sections" value={tab} onChange={setTab} items={[{ value: 'details', label: 'Details' }, { value: 'syllabus', label: 'Syllabus', count: c.modules.length }, { value: 'batches', label: 'Batches', count: c.batches.length }]} />
          {tab === 'details' && (
            <CourseForm
              key={c.updatedAt}
              initial={toFormValues(c)}
              submitLabel="Save changes"
              onSubmit={async (payload) => {
                await api().admin.updateCourse(id, payload);
                toast('Course saved');
                state.reload();
              }}
            />
          )}
          {tab === 'syllabus' && <SyllabusEditor courseId={id} modules={c.modules} onSaved={state.reload} />}
          {tab === 'batches' && (
            <Card title="Batches" actions={<Link href={`/batches/new?courseId=${id}`} className={buttonClass('outline', 'sm')}>New batch</Link>}>
              {c.batches.length === 0 ? (
                <EmptyState title="No batches yet" />
              ) : (
                <DataTable<Row>
                  caption="Batches of this course"
                  rows={c.batches}
                  rowKey={(b) => b.id}
                  columns={[
                    { key: 'name', header: 'Batch', render: (b) => <Link className={s.link} href={`/batches/${b.id}`}>{b.name}</Link> },
                    { key: 'dates', header: 'Dates', render: (b) => `${formatDate(b.startDate)} – ${formatDate(b.endDate)}` },
                    { key: 'cap', header: 'Capacity', hideOnMobile: true, render: (b) => b.capacity },
                    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
                  ]}
                />
              )}
            </Card>
          )}
          {dialog}
        </>
      )}
    </AsyncView>
  );
}
