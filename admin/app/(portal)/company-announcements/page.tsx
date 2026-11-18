'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Input, PageHeader, Textarea, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function CompanyAnnouncementsPage() {
  const toast = useToast();
  const state = useAsync(() => api().hr.announcements(), 'company-announcements');
  const [v, setV] = useState({ title: '', body: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().hr.postAnnouncement({ title: v.title.trim(), body: v.body.trim() });
      toast('Announcement posted — employees have been notified');
      setV({ title: '', body: '' });
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Company announcements" description="Visible to all current employees in the employee portal. Student announcements are managed separately." />
      <div className={s.grid2}>
        <Card title="Post an announcement">
          <form className={s.stackSm} onSubmit={submit} noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <Input label="Title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={fields.title} maxLength={200} />
            <Textarea label="Message" required value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} error={fields.body} rows={6} maxLength={5000} />
            <div className={s.actions}>
              <Button type="submit" loading={pending}>Post to all employees</Button>
            </div>
          </form>
        </Card>
        <Card title="Recent announcements">
          <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No announcements yet' }}>
            {(rows) => (
              <div className={s.list}>
                {rows.map((a: Row) => (
                  <article key={a.id} className={s.listItem}>
                    <span className={s.strong}>{a.title}</span>
                    <span className={s.small}>{formatDateTime(a.createdAt)}</span>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
                  </article>
                ))}
              </div>
            )}
          </AsyncView>
        </Card>
      </div>
    </>
  );
}
