'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Input, PageHeader, StatusBadge, Textarea, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function SupportPage() {
  usePageTitle('Help & support');
  const toast = useToast();
  const state = useAsync(() => api().student.supportRequests(), 'support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    const local: Record<string, string> = {};
    if (subject.trim().length < 3) local.subject = 'Please add a short subject';
    if (message.trim().length < 10) local.message = 'Please describe the issue (at least 10 characters)';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setPending(true);
    try {
      await api().student.createSupportRequest({ subject, message });
      toast('Request sent. Our team will get back to you.');
      setSubject('');
      setMessage('');
      state.reload();
    } catch (err) {
      setErrors(fieldErrorMap(err));
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={s.stack}>
      <PageHeader title="Help & support" description="Questions about classes, payments, certificates or your account? Send us a request." />
      <div className={s.grid2}>
        <Card title="New request">
          <form className={s.form} onSubmit={submit} noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <Input label="Subject" required maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
            <Textarea label="Message" required rows={6} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} error={errors.message} hint="Do not share passwords or card details." />
            <div className={s.actions}>
              <Button type="submit" loading={pending}>
                Send request
              </Button>
            </div>
          </form>
        </Card>
        <Card title="My requests">
          <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No requests yet' }}>
            {(items) => (
              <ul className={s.list}>
                {items.map((r) => (
                  <li key={r.id} className={s.item}>
                    <div className={s.between}>
                      <span className={s.title}>{r.subject}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className={s.body}>{r.message}</p>
                    <span className={s.small}>Sent {formatDateTime(r.createdAt)}</span>
                    {r.response && (
                      <Alert tone="info" title={`Reply${r.respondedAt ? ` · ${formatDateTime(r.respondedAt)}` : ''}`}>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{r.response}</p>
                      </Alert>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </AsyncView>
        </Card>
      </div>
    </div>
  );
}
