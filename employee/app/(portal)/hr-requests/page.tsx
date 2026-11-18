'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { HR_REQUEST_CATEGORIES, enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, Card, Input, PageHeader, Select, StatusBadge, Textarea, formatDate, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import type { HrRequestRow } from '@/lib/types';
import { options } from '@/lib/util';
import s from '@/lib/page.module.css';

function RequestForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [category, setCategory] = useState('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const local: Record<string, string> = {};
    if (subject.trim().length < 3) local.subject = 'Add a short subject';
    if (message.trim().length < 10) local.message = 'Please describe your request (at least 10 characters)';
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      await api().employee.createHrRequest({ category, subject: subject.trim(), message: message.trim() });
      toast('Request sent to HR.', 'success');
      setSubject('');
      setMessage('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Select label="Category" options={options(HR_REQUEST_CATEGORIES)} value={category} onChange={(e) => setCategory(e.target.value)} error={fields.category} required />
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} error={fields.subject} required />
        <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={4000} error={fields.message} required containerClassName={s.full} />
      </div>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Send request
        </Button>
      </div>
    </form>
  );
}

export default function HrRequestsPage() {
  const state = useAsync(() => api().employee.hrRequests() as Promise<HrRequestRow[]>, 'hr-requests');
  return (
    <div className={s.stack}>
      <PageHeader title="HR requests" description="Ask HR about payroll, leave, documents or anything else. Only you and HR can see your requests." />
      <Card title="New request">
        <RequestForm onCreated={state.reload} />
      </Card>
      <Card title="My requests">
        <AsyncView state={state} empty={{ title: 'No requests yet' }} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <ul className={s.list}>
              {rows.map((r) => (
                <li key={r.id} className={s.item}>
                  <div className={s.itemHead}>
                    <span className={s.itemTitle}>{r.subject}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className={s.small}>
                    {enumLabel(r.category)} · {formatDate(r.createdAt)}
                  </p>
                  <p className={s.body}>{r.message}</p>
                  {r.response && (
                    <div className={s.response}>
                      <p className={s.small}>HR response{r.respondedAt ? ` · ${formatDateTime(r.respondedAt)}` : ''}</p>
                      <p className={s.body}>{r.response}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
