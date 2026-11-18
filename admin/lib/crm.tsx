'use client';

import { Badge, type Tone } from '@globalantic/ui';

/** Pipeline stages offered in the CRM (legacy values still display). */
export const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'] as const;
export const STAGE_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_SENT: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  IN_PROGRESS: 'In progress (legacy)',
  CONVERTED: 'Converted (legacy)',
  CLOSED: 'Closed (legacy)',
};
const STAGE_TONE: Record<string, Tone> = {
  NEW: 'info',
  CONTACTED: 'primary',
  QUALIFIED: 'primary',
  PROPOSAL_SENT: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  CONVERTED: 'success',
  LOST: 'neutral',
  CLOSED: 'neutral',
  IN_PROGRESS: 'primary',
};
export const stageOptions = STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }));
export const priorityOptions = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];
export const OPEN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'IN_PROGRESS'];

export function StageBadge({ status }: { status: string }) {
  return <Badge tone={STAGE_TONE[status] ?? 'neutral'}>{STAGE_LABEL[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priority === 'HIGH' ? 'danger' : priority === 'LOW' ? 'neutral' : 'info'}>{priority === 'HIGH' ? 'High' : priority === 'LOW' ? 'Low' : 'Medium'}</Badge>;
}

const SOURCE_LABEL: Record<string, string> = {
  contact_page: 'Contact page',
  quote_page: 'Quote page',
  website: 'Website',
  manual_whatsapp: 'WhatsApp (added by staff)',
  manual_phone: 'Phone (added by staff)',
  manual_email: 'Email (added by staff)',
  manual_referral: 'Referral (added by staff)',
  manual_event: 'Event (added by staff)',
  manual_other: 'Other (added by staff)',
};
export function sourceLabel(source?: string | null): string {
  if (!source) return 'Unknown';
  if (source.startsWith('service_page:')) return `Service page · ${source.slice(13)}`;
  return SOURCE_LABEL[source] ?? source;
}

export const ACTIVITY_LABEL: Record<string, string> = {
  CREATED: 'Lead created',
  REPEAT_ENQUIRY: 'Repeat enquiry',
  STATUS_CHANGED: 'Stage changed',
  PRIORITY_CHANGED: 'Priority changed',
  ASSIGNED: 'Owner changed',
  FOLLOW_UP_SET: 'Follow-up date set',
  DETAILS_UPDATED: 'Details updated',
  NOTE: 'Note',
  CONSULTATION: 'Consultation held',
  CALL: 'Call',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp conversation',
  REMINDER_SENT: 'Reminder sent',
};

/** ISO -> value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Digits for wa.me / tel: links from a stored phone (assumes India when 10 digits). */
export function phoneDigits(phone?: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
