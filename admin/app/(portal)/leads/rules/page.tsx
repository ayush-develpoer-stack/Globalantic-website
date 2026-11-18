'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Checkbox, Input, PageHeader, Select, useAsync, useToast } from '@globalantic/ui';
import { useRun } from '@/lib/admin';
import s from '@/lib/admin.module.css';

interface RuleDraft {
  key: string;
  service: string;
  assigneeId: string;
  active: boolean;
}
let seq = 0;
const draft = (r?: { service?: string | null; assigneeId?: string; active?: boolean }): RuleDraft => ({ key: `r${(seq += 1)}`, service: r?.service ?? '', assigneeId: r?.assigneeId ?? '', active: r?.active ?? true });

/** Admin: who gets new website leads, by service. The first matching active rule wins; an empty service matches any. */
export default function LeadRulesPage() {
  const toast = useToast();
  const run = useRun();
  const rules = useAsync(() => api().crm.rules(), 'crm-rules');
  const assignees = useAsync(() => api().crm.assignees(), 'crm-assignees');
  const [rows, setRows] = useState<RuleDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (rules.data) setRows(rules.data.map((r) => draft(r)));
  }, [rules.data]);
  const upd = (key: string, patch: Partial<RuleDraft>) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const save = async () => {
    setError(null);
    if (rows.some((r) => !r.assigneeId)) {
      setError('Choose a person for every rule.');
      return;
    }
    setPending(true);
    try {
      await api().crm.saveRules(rows.map((r) => ({ service: r.service.trim() || null, assigneeId: r.assigneeId, active: r.active })));
      toast('Assignment rules saved', 'success');
      rules.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={<Link href="/leads" className={s.link}>← Leads</Link>} title="Lead assignment" description="New website enquiries go to the first matching active rule. Repeat enquiries stay with the existing owner. With no match, leads stay unassigned and every admin is alerted." />
      <AsyncView state={rules} loadingRows={3}>
        {() => (
          <div className={s.stack}>
            <Card title="Rules (checked in order)">
              <div className={s.stackSm}>
                {error && <Alert tone="danger">{error}</Alert>}
                {rows.length === 0 && <p className={s.muted}>No rules yet: new leads are unassigned until someone picks them up.</p>}
                {rows.map((r, i) => (
                  <div key={r.key} className={s.formGrid}>
                    <Input label={`Rule ${i + 1}: service`} placeholder="Any service" value={r.service} onChange={(e) => upd(r.key, { service: e.target.value })} hint="Exact service name from the enquiry form, e.g. Mobile App Development. Empty = any." />
                    <Select label="Assign to" value={r.assigneeId} onChange={(e) => upd(r.key, { assigneeId: e.target.value })} placeholder="Choose…" options={(assignees.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.role.toLowerCase()})` }))} />
                    <div className={s.row}>
                      <Checkbox label="Active" checked={r.active} onChange={(e) => upd(r.key, { active: e.target.checked })} />
                      <Button variant="ghost" size="sm" aria-label={`Remove rule ${i + 1}`} onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}>
                        <Trash2 size={16} aria-hidden /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <div className={s.actions}>
                  <Button variant="outline" size="sm" onClick={() => setRows((xs) => [...xs, draft()])} disabled={rows.length >= 50}>
                    <Plus size={16} aria-hidden /> Add rule
                  </Button>
                  <Button onClick={save} loading={pending}>Save rules</Button>
                </div>
                <p className={s.small}>Only people who can work leads (admins, the Sales role, or staff granted &quot;leads.manage&quot;) can be chosen. Give a teammate the Sales role in Users &amp; roles.</p>
              </div>
            </Card>
            <Card title="Follow-up reminders">
              <div className={s.stackSm}>
                <p className={s.muted}>
                  Owners get an in-app notification and an email for overdue follow-ups and for leads still uncontacted after 48 hours (at most once a day per lead). For automatic daily reminders, schedule a POST to <code>/api/crm/reminders/dispatch</code> with the <code>X-Cron-Secret</code> header (set <code>CRON_SECRET</code> on the server).
                </p>
                <div>
                  <Button
                    variant="outline"
                    loading={sending}
                    onClick={async () => {
                      setSending(true);
                      const r = await run(() => api().crm.runReminders());
                      setSending(false);
                      if (r) toast(r.leads ? `Reminders sent for ${r.leads} lead(s)` : 'Nothing is due right now', 'success');
                    }}
                  >
                    Send due reminders now
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </AsyncView>
    </>
  );
}
