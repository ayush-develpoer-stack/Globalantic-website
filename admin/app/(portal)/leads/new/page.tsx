'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Card, Input, PageHeader, Select, Textarea, useAsync, useSession, useToast } from '@globalantic/ui';
import { priorityOptions } from '@/lib/crm';
import s from '@/lib/admin.module.css';

const SOURCES = [
  { value: 'manual_whatsapp', label: 'WhatsApp chat' },
  { value: 'manual_phone', label: 'Phone call' },
  { value: 'manual_email', label: 'Email' },
  { value: 'manual_referral', label: 'Referral' },
  { value: 'manual_event', label: 'Event / meeting' },
  { value: 'manual_other', label: 'Other' },
];

/** For enquiries that did not come through the website (WhatsApp chats are not synced automatically). */
export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const assignees = useAsync(() => api().crm.assignees(), 'crm-assignees');
  const [v, setV] = useState({ name: '', email: '', phone: '', company: '', service: '', budget: '', timeline: '', message: '', source: 'manual_whatsapp', priority: 'MEDIUM', assignedToId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  const admin = user?.role === 'ADMIN';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== ''));
      const lead = await api().crm.create(body);
      toast('Lead added', 'success');
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={<Link href="/leads" className={s.link}>← Leads</Link>} title="Add a lead" description="Record an enquiry that came by WhatsApp, phone, email or in person." />
      <Card>
        <form onSubmit={save} noValidate className={s.stack}>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className={s.formGrid}>
            <Input label="Name" required value={v.name} onChange={set('name')} error={errors.name} />
            <Input label="Email" type="email" required value={v.email} onChange={set('email')} error={errors.email} />
            <Input label="Phone / WhatsApp" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} />
            <Input label="Company" value={v.company} onChange={set('company')} error={errors.company} />
            <Input label="Service" value={v.service} onChange={set('service')} error={errors.service} />
            <Input label="Budget" value={v.budget} onChange={set('budget')} error={errors.budget} />
            <Input label="Timeline" value={v.timeline} onChange={set('timeline')} error={errors.timeline} />
            <Select label="Channel" value={v.source} onChange={set('source')} options={SOURCES} error={errors.source} />
            <Select label="Priority" value={v.priority} onChange={set('priority')} options={priorityOptions} />
            {admin && <Select label="Owner" value={v.assignedToId} onChange={set('assignedToId')} placeholder="Unassigned" options={(assignees.data ?? []).map((a) => ({ value: a.id, label: a.name }))} error={errors.assignedToId} />}
            <Textarea containerClassName={s.span2} label="What do they need?" required rows={5} maxLength={4000} value={v.message} onChange={set('message')} error={errors.message} />
          </div>
          {!admin && <p className={s.small}>The lead is assigned to you.</p>}
          <div className={s.actions}>
            <Button type="submit" loading={pending}>Add lead</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
