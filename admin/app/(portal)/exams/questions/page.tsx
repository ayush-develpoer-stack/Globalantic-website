'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, Button, DataTable, Input, PageHeader, Pagination, Select, Toolbar, useAsync, useDebounced } from '@globalantic/ui';
import { QuestionModal, TRACK_LABEL, trackOptions, typeLabel, typeOptions } from '@/lib/exams';
import { useConfirm, useRun } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function QuestionBankPage() {
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const [archived, setArchived] = useState('false');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const q = useDebounced(search);
  const topics = useAsync(() => api().examAdmin.topics(), 'exam-topics');
  const state = useAsync(() => api().examAdmin.questions({ search: q, track, topic, type, archived, page, pageSize: 20 }), `${q}|${track}|${topic}|${type}|${archived}|${page}`);
  const reset = () => setPage(1);

  const openEditor = async (row: Row | null) => {
    if (!row) {
      setEditing(null);
      setOpen(true);
      return;
    }
    const full = await run(() => api().examAdmin.question(row.id));
    if (full) {
      setEditing(full);
      setOpen(true);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/exams" className={s.link}>← Exams</Link>}
        title="Question bank"
        description="Reusable marketing and sales questions. Answer keys stay on the server and are never sent to candidates before results."
        actions={<Button size="sm" onClick={() => void openEditor(null)}>New question</Button>}
      />
      <Toolbar>
        <Input label="Search" placeholder="Question text" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} />
        <Select label="Category" value={track} onChange={(e) => { setTrack(e.target.value); reset(); }} placeholder="All" options={trackOptions} />
        <Select
          label="Topic"
          value={topic}
          onChange={(e) => { setTopic(e.target.value); reset(); }}
          placeholder="All topics"
          options={[...new Set((topics.data ?? []).filter((t) => !track || t.track === track).map((t) => t.topic))].map((t) => ({ value: t, label: t }))}
        />
        <Select label="Type" value={type} onChange={(e) => { setType(e.target.value); reset(); }} placeholder="All types" options={typeOptions} />
        <Select label="Show" value={archived} onChange={(e) => { setArchived(e.target.value); reset(); }} options={[{ value: 'false', label: 'Active' }, { value: 'true', label: 'Archived' }]} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: archived === 'true' ? 'No archived questions' : 'No questions yet', description: 'Add questions for communication, lead generation, sales fundamentals, customer handling, digital marketing and practical scenarios.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Questions"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'prompt', header: 'Question', render: (r) => (<><span className={s.preWrap}>{r.prompt.length > 160 ? `${r.prompt.slice(0, 160)}…` : r.prompt}</span><div className={s.small}>{TRACK_LABEL[r.track]} · {r.topic}</div></>) },
                { key: 'type', header: 'Type', hideOnMobile: true, render: (r) => typeLabel(r.type) },
                { key: 'marks', header: 'Marks', hideOnMobile: true, render: (r) => r.marks },
                { key: 'used', header: 'Used in', hideOnMobile: true, render: (r) => (r._count?.exams ? <Badge tone="info">{r._count.exams} exam(s)</Badge> : <span className={s.small}>—</span>) },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) => (
                    <div className={s.actions}>
                      <Button size="sm" variant="outline" onClick={() => void openEditor(r)}>{r.archivedAt ? 'View' : 'Edit'}</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          ask({
                            title: r.archivedAt ? 'Restore question?' : 'Archive question?',
                            message: r.archivedAt ? 'It can be added to draft exams again.' : 'It stays in exams that already use it but can no longer be added to new ones.',
                            confirmLabel: r.archivedAt ? 'Restore' : 'Archive',
                            onConfirm: async () => {
                              await api().examAdmin.archiveQuestion(r.id, !r.archivedAt);
                              state.reload();
                              topics.reload();
                            },
                            success: r.archivedAt ? 'Question restored' : 'Question archived',
                          })
                        }
                      >
                        {r.archivedAt ? 'Restore' : 'Archive'}
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      <QuestionModal
        open={open}
        question={editing}
        onClose={() => setOpen(false)}
        onSaved={() => {
          state.reload();
          topics.reload();
        }}
      />
      {dialog}
    </>
  );
}
