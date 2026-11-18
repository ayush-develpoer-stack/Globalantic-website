'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, DescriptionList, ErrorState, Input, PageHeader, Select, StatusBadge, Textarea, buttonClass, formatDateTime, formatINR, useAsync, useSession, useToast } from '@globalantic/ui';
import { DOC_TYPE_LABEL } from '@/lib/docs';
import { ACTIVITY_LABEL, PriorityBadge, STAGE_LABEL, StageBadge, phoneDigits, priorityOptions, sourceLabel, stageOptions, toLocalInput } from '@/lib/crm';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function describe(a: Row): string | null {
  const m = a.meta ?? {};
  if (a.type === 'STATUS_CHANGED') return `${STAGE_LABEL[m.from] ?? m.from} → ${STAGE_LABEL[m.to] ?? m.to}`;
  if (a.type === 'PRIORITY_CHANGED') return `${m.from} → ${m.to}`;
  if (a.type === 'FOLLOW_UP_SET') return m.at ? `Due ${formatDateTime(m.at)}` : 'Cleared';
  if (a.type === 'ASSIGNED') return m.to ? 'Assigned' : 'Unassigned';
  if (a.type === 'REPEAT_ENQUIRY') return m.reference ? `Reference ${m.reference}${m.service ? ` · ${m.service}` : ''}` : null;
  if (a.type === 'CREATED' && m.utmCampaign) return `Campaign: ${m.utmSource ?? ''} ${m.utmCampaign}`;
  if (a.type === 'DETAILS_UPDATED') return Object.keys(m).join(', ');
  return null;
}

function ManageCard({ lead, onSaved }: { lead: Row; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const assignees = useAsync(() => api().crm.assignees(), 'crm-assignees');
  const [v, setV] = useState({ status: lead.status, priority: lead.priority, assignedToId: lead.assignedTo?.id ?? '', followUpAt: toLocalInput(lead.followUpAt), note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setV({ status: lead.status, priority: lead.priority, assignedToId: lead.assignedTo?.id ?? '', followUpAt: toLocalInput(lead.followUpAt), note: '' }), [lead]);
  const admin = user?.role === 'ADMIN';
  const ownerOptions = (assignees.data ?? []).filter((a) => admin || a.id === user?.id).map((a) => ({ value: a.id, label: `${a.name}${a.id === user?.id ? ' (me)' : ''}` }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setErrors({});
    const body: Row = {};
    if (v.status !== lead.status) {
      body.status = v.status;
      if (v.note.trim()) body.note = v.note.trim();
    }
    if (v.priority !== lead.priority) body.priority = v.priority;
    if ((v.assignedToId || null) !== (lead.assignedTo?.id ?? null)) body.assignedToId = v.assignedToId || null;
    // Compare at the input's minute precision, so an untouched field is not sent as a change.
    if (v.followUpAt !== toLocalInput(lead.followUpAt)) body.followUpAt = v.followUpAt ? new Date(v.followUpAt).toISOString() : null;
    if (!Object.keys(body).length) {
      setPending(false);
      setError('Nothing changed.');
      return;
    }
    try {
      await api().crm.update(lead.id, body);
      toast('Lead updated', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Pipeline">
      <form onSubmit={save} noValidate className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Select label="Stage" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} options={lead.status in STAGE_LABEL && !stageOptions.some((o) => o.value === lead.status) ? [{ value: lead.status, label: STAGE_LABEL[lead.status] }, ...stageOptions] : stageOptions} error={errors.status} />
        {v.status !== lead.status && <Textarea label="Note for this change (optional)" rows={2} maxLength={2000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} hint="e.g. why the lead was lost, or what was agreed" />}
        <Select label="Priority" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} options={priorityOptions} />
        <Select label="Owner" value={v.assignedToId} onChange={(e) => setV({ ...v, assignedToId: e.target.value })} placeholder="Unassigned" options={ownerOptions} error={errors.assignedToId} disabled={!admin && Boolean(lead.assignedTo) && lead.assignedTo.id !== user?.id} />
        <Input label="Next follow-up" type="datetime-local" value={v.followUpAt} onChange={(e) => setV({ ...v, followUpAt: e.target.value })} error={errors.followUpAt} hint="You get a reminder when it is due." />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function ActivityForm({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<'NOTE' | 'CALL' | 'EMAIL' | 'WHATSAPP' | 'CONSULTATION'>('NOTE');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) {
      setError('Write a short note.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api().crm.addNote(leadId, body.trim(), type);
      setBody('');
      toast('Saved', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="Log activity">
      <form onSubmit={save} noValidate className={s.stackSm}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          options={[
            { value: 'NOTE', label: 'Note' },
            { value: 'CALL', label: 'Call' },
            { value: 'EMAIL', label: 'Email' },
            { value: 'WHATSAPP', label: 'WhatsApp conversation' },
            { value: 'CONSULTATION', label: 'Consultation held' },
          ]}
        />
        <Textarea label="Details" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} hint={type === 'WHATSAPP' ? 'WhatsApp chats are not synced automatically — summarise the conversation here.' : undefined} />
        <div className={s.actions}>
          <Button type="submit" loading={pending}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function LeadDocuments({ leadId }: { leadId: string }) {
  const state = useAsync(() => api().documents.list({ leadId, pageSize: 20 }), `lead-docs-${leadId}`);
  const rows = (state.data?.items ?? []) as Row[];
  return (
    <Card title="Documents">
      {state.error ? (
        <p className={s.muted}>{state.error}</p>
      ) : rows.length === 0 ? (
        <p className={s.muted}>No quotations or other documents for this lead yet.</p>
      ) : (
        <ul className={s.list}>
          {rows.map((d) => (
            <li key={d.id} className={s.listItem}>
              <div className={s.rowBetween}>
                <Link href={`/documents/${d.id}`} className={s.link}>{DOC_TYPE_LABEL[d.type]} {d.number ?? '(draft)'}</Link>
                <StatusBadge status={d.status} />
              </div>
              <span className={s.small}>{d.title} · {formatINR(d.totalPaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const state = useAsync(() => api().crm.lead(id), `lead-${id}`);
  if (state.status === 404) return <ErrorState title="Lead not found" message="It does not exist or is assigned to someone else." />;

  return (
    <AsyncView state={state} loadingRows={6}>
      {(l) => {
        const digits = phoneDigits(l.phone);
        const wa = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${l.name}, this is Globalantic regarding your enquiry${l.reference ? ` ${l.reference}` : ''}.`)}` : null;
        return (
          <>
            <PageHeader
              eyebrow={<Link href="/leads" className={s.link}>← Leads</Link>}
              title={l.name}
              description={
                <span className={s.row}>
                  <StageBadge status={l.status} />
                  <PriorityBadge priority={l.priority} />
                  {l.reference && <Badge>{l.reference}</Badge>}
                </span>
              }
              actions={
                <div className={s.actions}>
                  {can('documents.manage') && (
                    <Link className={buttonClass('primary', 'sm')} href={`/documents/new?type=QUOTATION&leadId=${l.id}`}>Create quotation</Link>
                  )}
                  <a className={buttonClass('outline', 'sm')} href={`mailto:${l.email}${l.reference ? `?subject=${encodeURIComponent(`Your enquiry ${l.reference}`)}` : ''}`}>
                    <Mail size={16} aria-hidden /> Email
                  </a>
                  {l.phone && (
                    <a className={buttonClass('outline', 'sm')} href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}>
                      <Phone size={16} aria-hidden /> Call
                    </a>
                  )}
                  {wa && (
                    <a className={buttonClass('outline', 'sm')} href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle size={16} aria-hidden /> WhatsApp
                    </a>
                  )}
                </div>
              }
            />
            <div className={s.stack}>
              {l.duplicateOf && (
                <Alert tone="info">
                  This is a repeat enquiry. The main lead is <Link href={`/leads/${l.duplicateOf.id}`} className={s.link}>{l.duplicateOf.reference ?? l.duplicateOf.name}</Link>.
                </Alert>
              )}
              <div className={s.grid2}>
                <div className={s.stack}>
                  <Card title="Enquiry">
                    <DescriptionList
                      items={[
                        { label: 'Email', value: l.email },
                        { label: 'Phone', value: l.phone ?? '—' },
                        { label: 'Company', value: l.company ?? '—' },
                        { label: 'Service', value: l.service ?? '—' },
                        { label: 'Budget', value: l.budget ?? '—' },
                        { label: 'Timeline', value: l.timeline ?? '—' },
                        { label: 'Prefers', value: l.contactPreference ?? 'No preference' },
                        { label: 'Updates consent', value: l.marketingConsent ? `Yes (${formatDateTime(l.consentAt)})` : 'No' },
                        { label: 'Received', value: formatDateTime(l.createdAt) },
                        { label: 'Owner', value: l.assignedTo?.name ?? 'Unassigned' },
                      ]}
                    />
                    <p className={`${s.preWrap}`} style={{ marginTop: 12 }}>{l.message}</p>
                  </Card>
                  <Card title="Source">
                    <DescriptionList
                      items={[
                        { label: 'Form / channel', value: sourceLabel(l.source) },
                        { label: 'Landing page', value: l.landingPage ?? '—' },
                        { label: 'Referrer', value: l.referrer ?? '—' },
                        { label: 'Campaign', value: l.utmSource || l.utmCampaign ? [l.utmSource, l.utmMedium, l.utmCampaign, l.utmTerm, l.utmContent].filter(Boolean).join(' · ') : 'None' },
                      ]}
                    />
                  </Card>
                  {l.duplicates?.length > 0 && (
                    <Card title={`Repeat enquiries (${l.duplicates.length})`}>
                      <ul className={s.list}>
                        {l.duplicates.map((d: Row) => (
                          <li key={d.id} className={s.listItem}>
                            <Link href={`/leads/${d.id}`} className={s.link}>{d.reference}</Link> · {formatDateTime(d.createdAt)}
                            {d.service && ` · ${d.service}`}
                            <p className={s.preWrap}>{d.message}</p>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
                <div className={s.stack}>
                  <ManageCard lead={l} onSaved={state.reload} />
                  {can('documents.read') && <LeadDocuments leadId={l.id} />}
                  <ActivityForm leadId={l.id} onSaved={state.reload} />
                  <Card title="Timeline">
                    <ol className={s.history}>
                      {l.activities.map((a: Row) => (
                        <li key={a.id} className={s.historyItem}>
                          <div className={s.rowBetween}>
                            <span className={s.strong}>{ACTIVITY_LABEL[a.type] ?? a.type}</span>
                            <span className={s.small}>{formatDateTime(a.createdAt)}</span>
                          </div>
                          {describe(a) && <span className={s.small}>{describe(a)}</span>}
                          {a.body && <p className={s.preWrap}>{a.body}</p>}
                          <span className={s.small}>{a.actor?.name ?? 'System'}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                </div>
              </div>
            </div>
          </>
        );
      }}
    </AsyncView>
  );
}
