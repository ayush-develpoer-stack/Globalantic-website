'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Card, EmptyState, Input, Textarea, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

export default function AnnouncementsPage() {
  const batchId = useParam('batchId');
  const toast = useToast();
  const state = useAsync(() => api().trainer.announcements(batchId), `ann:${batchId}`);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 3) errs.title = 'Enter a title (at least 3 characters).';
    if (body.trim().length < 3) errs.body = 'Write the announcement.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    try {
      await api().trainer.postAnnouncement(batchId, { title: title.trim(), body: body.trim() });
      setTitle('');
      setBody('');
      toast('Announcement posted to all active students in this batch.');
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
      <Card title="Post announcement">
        <form onSubmit={post} noValidate className={s.formGrid}>
          {error && (
            <div className={s.full}>
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <Input containerClassName={s.full} label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
          <Textarea containerClassName={s.full} label="Message" required rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} />
          <div className={`${s.actions} ${s.full}`}>
            <Button type="submit" loading={pending}>Post to batch</Button>
          </div>
        </form>
      </Card>
      <Card title="Announcements">
        <Guarded state={state}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="No announcements yet" />
            ) : (
              <ul className={s.list}>
                {items.map((a) => (
                  <li key={a.id} className={s.item}>
                    <div className={s.itemHead}>
                      <span className={s.itemTitle}>{a.title}</span>
                      <span className={s.small}>{formatDateTime(a.createdAt)}</span>
                    </div>
                    <p className={s.body}>{a.body}</p>
                  </li>
                ))}
              </ul>
            )
          }
        </Guarded>
      </Card>
    </div>
  );
}
