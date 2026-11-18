'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { api, errorMessage, fieldErrorMap, type NotificationSettingsView } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, Checkbox, DataTable, Input, PageHeader, Select, formatDateTime, useAsync, useSession, useToast, type Tone } from '@globalantic/ui';
import { CATEGORY_LABEL, SEVERITY_LABEL } from '@/lib/notifications';
import n from '@/lib/notifications.module.css';
import s from '@/lib/admin.module.css';

type Form = Pick<NotificationSettingsView, 'recipients' | 'emailEnabled' | 'emailMinSeverity' | 'mutedCategories'> & { retentionDays: string };
type Delivery = { id: string; category: string; severity: string; title: string; emailStatus: string; emailAttempts: number; emailError: string | null; createdAt: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 10;

/** Honest delivery wording: SENT means the provider accepted the email, not that it reached the inbox. */
const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Queued', tone: 'info' },
  SENT: { label: 'Accepted by provider', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  SKIPPED: { label: 'Skipped (email not configured)', tone: 'warning' },
};

export default function NotificationSettingsPage() {
  const { can } = useSession();
  const toast = useToast();
  const allowed = can('notifications.settings');
  const state = useAsync(() => (allowed ? api().notifications.settings() : Promise.resolve(null)), 'notification-settings');
  const deliveries = useAsync<Delivery[]>(() => (allowed ? (api().notifications.deliveries() as Promise<Delivery[]>) : Promise.resolve([])), 'notification-deliveries');
  const [v, setV] = useState<Form | null>(null);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.data) {
      const d = state.data;
      setV({ recipients: d.recipients, emailEnabled: d.emailEnabled, emailMinSeverity: d.emailMinSeverity, mutedCategories: d.mutedCategories, retentionDays: String(d.retentionDays) });
    }
  }, [state.data]);

  if (!allowed) {
    return <Alert tone="warning" title="Administrators only">Only administrators can change who receives notification emails. You can still see your notifications on the <Link href="/notifications" className={s.link}>Notifications</Link> page.</Alert>;
  }

  const set = (p: Partial<Form>) => setV((c) => (c ? { ...c, ...p } : c));

  const addRecipient = () => {
    if (!v) return;
    const email = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setDraftError('Enter a valid email address');
    if (v.recipients.includes(email)) return setDraftError('Already in the list');
    if (v.recipients.length >= MAX_RECIPIENTS) return setDraftError(`At most ${MAX_RECIPIENTS} recipients`);
    set({ recipients: [...v.recipients, email] });
    setDraft('');
    setDraftError(null);
  };

  const save = async () => {
    if (!v) return;
    const days = Number(v.retentionDays);
    if (!Number.isInteger(days) || days < 7 || days > 3650) {
      setErrors({ retentionDays: 'Between 7 and 3650 days' });
      return;
    }
    setPending(true);
    setError(null);
    setErrors({});
    try {
      await api().notifications.saveSettings({ recipients: v.recipients, emailEnabled: v.emailEnabled, emailMinSeverity: v.emailMinSeverity, mutedCategories: v.mutedCategories, retentionDays: days });
      toast('Notification settings saved', 'success');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/notifications" className={s.link}>← Notifications</Link>}
        title="Notification settings"
        description="Who receives business notification emails and which events send one. Every event still appears in the notification centre for the staff allowed to handle it."
        actions={<Button size="sm" onClick={save} loading={pending} disabled={!v}>Save settings</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <AsyncView state={state}>
        {(d) =>
          d &&
          v && (
            <div className={s.stack}>
              {!d.emailProviderConfigured && (
                <Alert tone="warning" title="Email sending is not configured">
                  RESEND_API_KEY is not set on the server, so notification emails are recorded as skipped and nothing is sent. In-app notifications still work.
                </Alert>
              )}
              <div className={s.grid2}>
                <Card title="Recipients">
                  <div className={s.stackSm}>
                    <p className={s.small}>Business emails (new leads, applications, verified payments, critical alerts) go to every address below.</p>
                    {v.recipients.length === 0 && (
                      <Alert tone="info">
                        No addresses saved here, so the server default is used: {d.envRecipients.length ? d.envRecipients.join(', ') : 'ADMIN_EMAIL'} (BUSINESS_NOTIFICATION_EMAILS).
                      </Alert>
                    )}
                    <ul className={s.list} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {v.recipients.map((r) => (
                        <li key={r} className={n.recipient}>
                          <span>{r}</span>
                          <Button size="sm" variant="ghost" aria-label={`Remove ${r}`} onClick={() => set({ recipients: v.recipients.filter((x) => x !== r) })}>
                            <X size={14} aria-hidden /> Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className={s.row} style={{ alignItems: 'flex-end' }}>
                      <Input
                        label="Add recipient"
                        type="email"
                        value={draft}
                        error={draftError ?? errors.recipients}
                        placeholder="name@example.com"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addRecipient();
                          }
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={addRecipient} disabled={!draft.trim() || v.recipients.length >= MAX_RECIPIENTS}>Add</Button>
                    </div>
                    <p className={s.small}>Currently sending to: <strong>{d.effectiveRecipients.join(', ') || 'nobody (no address configured)'}</strong> · up to {MAX_RECIPIENTS} addresses. Save to apply changes.</p>
                  </div>
                </Card>
                <Card title="Email preferences">
                  <div className={s.stackSm}>
                    <Checkbox label="Send notification emails" checked={v.emailEnabled} onChange={(e) => set({ emailEnabled: e.target.checked })} />
                    <Select
                      label="Minimum severity for email"
                      value={v.emailMinSeverity}
                      error={errors.emailMinSeverity}
                      options={d.severities.map((x) => ({ value: x, label: SEVERITY_LABEL[x] ?? x }))}
                      hint="Events below this level appear only in the notification centre."
                      onChange={(e) => set({ emailMinSeverity: e.target.value as Form['emailMinSeverity'] })}
                    />
                    <fieldset className={s.stackSm} style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className={s.strong} style={{ marginBottom: 6 }}>Never email these categories</legend>
                      <div className={s.tags}>
                        {d.categories.map((c) => (
                          <Checkbox
                            key={c}
                            label={CATEGORY_LABEL[c] ?? c}
                            checked={v.mutedCategories.includes(c)}
                            onChange={(e) => set({ mutedCategories: e.target.checked ? [...v.mutedCategories, c] : v.mutedCategories.filter((x) => x !== c) })}
                          />
                        ))}
                      </div>
                    </fieldset>
                    <Input
                      label="Keep read notifications for (days)"
                      type="number"
                      min={7}
                      max={3650}
                      value={v.retentionDays}
                      error={errors.retentionDays}
                      hint="Older read notifications are removed by the scheduled job. Unread ones are never removed."
                      onChange={(e) => set({ retentionDays: e.target.value })}
                    />
                    <p className={s.small}>Last saved {formatDateTime(d.updatedAt)}.</p>
                  </div>
                </Card>
              </div>
              <Card title="Recent notification emails">
                <AsyncView state={deliveries} isEmpty={(rows) => rows.length === 0} empty={{ title: 'No notification emails yet', description: 'Emails sent for platform events are listed here with their delivery state.' }}>
                  {(rows) => (
                    <DataTable<Delivery>
                      caption="Recent notification emails"
                      rows={rows}
                      rowKey={(r) => r.id}
                      columns={[
                        { key: 't', header: 'Event', render: (r) => (<><span className={s.strong}>{r.title}</span><div className={s.small}>{CATEGORY_LABEL[r.category] ?? r.category} · {SEVERITY_LABEL[r.severity] ?? r.severity}</div></>) },
                        { key: 's', header: 'Delivery', render: (r) => <Badge tone={DELIVERY[r.emailStatus]?.tone ?? 'neutral'}>{DELIVERY[r.emailStatus]?.label ?? r.emailStatus}</Badge> },
                        { key: 'a', header: 'Attempts', hideOnMobile: true, render: (r) => r.emailAttempts },
                        { key: 'e', header: 'Error', hideOnMobile: true, render: (r) => (r.emailError ? <span className={s.small}>{r.emailError}</span> : '—') },
                        { key: 'd', header: 'When', hideOnMobile: true, render: (r) => formatDateTime(r.createdAt) },
                      ]}
                    />
                  )}
                </AsyncView>
                <p className={s.small}>“Accepted by provider” means Resend accepted the email; inbox delivery is not confirmed here. Failed emails are retried automatically (up to 5 attempts) by the scheduled job.</p>
              </Card>
            </div>
          )
        }
      </AsyncView>
    </>
  );
}
