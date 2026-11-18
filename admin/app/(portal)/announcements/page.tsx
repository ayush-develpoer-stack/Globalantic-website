'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Card, Input, PageHeader, Select, Textarea, useAsync, useToast } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';

export default function AnnouncementsPage() {
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const batches = useAsync(() => api().admin.batches({ pageSize: 100 }), 'batches-for-announcements');
  const [batchId, setBatchId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const options = (batches.data?.items ?? [])
    .filter((b) => !['CANCELLED', 'COMPLETED'].includes(b.status))
    .map((b) => ({ value: b.id, label: `${b.course?.title} · ${b.name}` }));
  const audience = batchId ? options.find((o) => o.value === batchId)?.label ?? 'this batch' : 'every actively enrolled student';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    ask({
      title: 'Post announcement?',
      message: `It will be shown in the student portal and sent as a notification to ${audience}.`,
      confirmLabel: 'Post',
      onConfirm: async () => {
        try {
          await api().admin.postAnnouncement({ title, body, batchId: batchId || undefined });
          toast('Announcement posted');
          setTitle('');
          setBody('');
        } catch (err) {
          setError(errorMessage(err));
          setFields(fieldErrorMap(err));
        }
      },
    });
  };

  return (
    <>
      <PageHeader title="Announcements" description="Post an announcement to one batch or to all enrolled students. Trainers can also post to their own batches." />
      <form onSubmit={submit} noValidate>
        <Card title="New announcement">
          <div className={s.stack}>
            {error && <Alert tone="danger">{error}</Alert>}
            {batches.error && <Alert tone="warning">Could not load batches ({batches.error}); you can still post a programme-wide announcement.</Alert>}
            <Select label="Audience" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="All enrolled students (programme-wide)" options={options} />
            <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={fields.title} maxLength={200} />
            <Textarea label="Message" required value={body} onChange={(e) => setBody(e.target.value)} error={fields.body} rows={6} maxLength={5000} />
            <div className={s.actions}>
              <Button type="submit" disabled={title.trim().length < 3 || body.trim().length < 3}>Post announcement</Button>
            </div>
          </div>
        </Card>
      </form>
      {dialog}
    </>
  );
}
