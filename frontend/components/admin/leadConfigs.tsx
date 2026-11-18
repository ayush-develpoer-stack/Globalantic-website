import type { ReactNode } from 'react';
import type { StatusTone } from '@/components/ui/StatusBadge';
import { formatDate, formatDateTime, orDash } from '@/lib/format';
import type { LeadKind, LeadRecordMap } from '@/services/admin/leads.service';
import {
  CAREER_STATUSES,
  CONTACT_STATUSES,
  SUBSCRIBER_STATUSES,
  TRAINING_STATUSES,
  type CareerStatus,
  type ContactStatus,
  type SubscriberStatus,
  type TrainingStatus,
} from '@/types';
import type { Column } from './DataTable';
import styles from '@/app/admin/admin.module.css';

export function contactStatusTone(status: ContactStatus): StatusTone {
  if (status === 'NEW') return 'new';
  if (status === 'CONVERTED' || status === 'WON') return 'success';
  if (status === 'CLOSED' || status === 'LOST') return 'neutral';
  return 'progress';
}

function trainingStatusTone(status: TrainingStatus): StatusTone {
  if (status === 'NEW') return 'new';
  if (status === 'JOINED' || status === 'COMPLETED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'progress';
}

function careerStatusTone(status: CareerStatus): StatusTone {
  if (status === 'NEW') return 'new';
  if (status === 'HIRED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'progress';
}

function subscriberStatusTone(status: SubscriberStatus): StatusTone {
  return status === 'SUBSCRIBED' ? 'success' : 'neutral';
}

export interface DetailField<T> {
  label: string;
  value: (row: T) => ReactNode;
  wide?: boolean;
}

export interface LeadConfig<K extends LeadKind> {
  title: string;
  description: string;
  /** Singular/plural nouns used in messages and the pagination summary. */
  singular: string;
  plural: string;
  searchPlaceholder: string;
  statuses: readonly string[];
  /** Whether the API supports changing status for this inbox. */
  editableStatus: boolean;
  tone: (status: LeadRecordMap[K]['status']) => StatusTone;
  displayName: (row: LeadRecordMap[K]) => string;
  /** Columns shown before the status/actions columns. */
  columns: Column<LeadRecordMap[K]>[];
  details: DetailField<LeadRecordMap[K]>[];
}

const mail = (email: string) => <a href={`mailto:${email}`}>{email}</a>;
const link = (url: string | null) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow">
      {url}
    </a>
  ) : (
    '—'
  );

const nameWithEmail = (name: string, email: string) => (
  <>
    <span className={styles.cellStrong}>{name}</span>
    <span className={styles.cellSub}>{email}</span>
  </>
);

export const LEAD_CONFIGS: { [K in LeadKind]: LeadConfig<K> } = {
  contacts: {
    title: 'Contacts',
    description: 'Enquiries submitted through the website contact form.',
    singular: 'lead',
    plural: 'leads',
    searchPlaceholder: 'Search name, email, company or service…',
    statuses: CONTACT_STATUSES,
    editableStatus: true,
    tone: contactStatusTone,
    displayName: (r) => r.name,
    columns: [
      { key: 'name', label: 'Name', sortable: true, render: (r) => nameWithEmail(r.name, r.email) },
      { key: 'company', label: 'Company', sortable: true, render: (r) => orDash(r.company) },
      { key: 'service', label: 'Service', sortable: true, render: (r) => orDash(r.service) },
      { key: 'createdAt', label: 'Received', sortable: true, render: (r) => formatDate(r.createdAt) },
    ],
    details: [
      { label: 'Email', value: (r) => mail(r.email) },
      { label: 'Phone', value: (r) => orDash(r.phone) },
      { label: 'Company', value: (r) => orDash(r.company) },
      { label: 'Service', value: (r) => orDash(r.service) },
      { label: 'Budget', value: (r) => orDash(r.budget) },
      { label: 'Received', value: (r) => formatDateTime(r.createdAt) },
      { label: 'Message', value: (r) => r.message, wide: true },
    ],
  },
  training: {
    title: 'Training applications',
    description: 'Applications for the Full Stack Development internship program.',
    singular: 'application',
    plural: 'applications',
    searchPlaceholder: 'Search name, email, phone or city…',
    statuses: TRAINING_STATUSES,
    editableStatus: true,
    tone: trainingStatusTone,
    displayName: (r) => r.fullName,
    columns: [
      { key: 'fullName', label: 'Applicant', sortable: true, render: (r) => nameWithEmail(r.fullName, r.email) },
      { key: 'mode', label: 'Mode', sortable: true, render: (r) => (r.mode === 'ONLINE' ? 'Online' : 'Offline') },
      { key: 'qualification', label: 'Qualification', sortable: true },
      { key: 'createdAt', label: 'Applied', sortable: true, render: (r) => formatDate(r.createdAt) },
    ],
    details: [
      { label: 'Email', value: (r) => mail(r.email) },
      { label: 'Phone', value: (r) => r.phone },
      { label: 'WhatsApp', value: (r) => orDash(r.whatsapp) },
      { label: 'Age', value: (r) => orDash(r.age) },
      { label: 'Mode', value: (r) => (r.mode === 'ONLINE' ? 'Online' : 'Offline (Bhopal)') },
      { label: 'Qualification', value: (r) => r.qualification },
      { label: 'College', value: (r) => orDash(r.college) },
      { label: 'City', value: (r) => orDash(r.city) },
      { label: 'Coding experience', value: (r) => orDash(r.codingExperience) },
      { label: 'Preferred contact time', value: (r) => orDash(r.preferredContactTime) },
      { label: 'Applied', value: (r) => formatDateTime(r.createdAt) },
      { label: 'Why they want to join', value: (r) => orDash(r.whyJoin), wide: true },
    ],
  },
  careers: {
    title: 'Career applications',
    description: 'Job applications submitted through the careers page.',
    singular: 'application',
    plural: 'applications',
    searchPlaceholder: 'Search name, email or position…',
    statuses: CAREER_STATUSES,
    editableStatus: true,
    tone: careerStatusTone,
    displayName: (r) => r.name,
    columns: [
      { key: 'name', label: 'Applicant', sortable: true, render: (r) => nameWithEmail(r.name, r.email) },
      { key: 'position', label: 'Position', sortable: true },
      { key: 'createdAt', label: 'Applied', sortable: true, render: (r) => formatDate(r.createdAt) },
    ],
    details: [
      { label: 'Email', value: (r) => mail(r.email) },
      { label: 'Phone', value: (r) => orDash(r.phone) },
      { label: 'Position', value: (r) => r.position },
      { label: 'Applied', value: (r) => formatDateTime(r.createdAt) },
      { label: 'Résumé', value: (r) => link(r.resumeUrl), wide: true },
      { label: 'Portfolio', value: (r) => link(r.portfolioUrl), wide: true },
      { label: 'Message', value: (r) => orDash(r.message), wide: true },
    ],
  },
  newsletter: {
    title: 'Newsletter',
    description: 'People who subscribed to the newsletter from the website footer.',
    singular: 'subscriber',
    plural: 'subscribers',
    searchPlaceholder: 'Search email…',
    statuses: SUBSCRIBER_STATUSES,
    // The API exposes list + delete only for subscribers.
    editableStatus: false,
    tone: subscriberStatusTone,
    displayName: (r) => r.email,
    columns: [
      { key: 'email', label: 'Email', sortable: true, render: (r) => <span className={styles.cellStrong}>{r.email}</span> },
      { key: 'createdAt', label: 'Subscribed', sortable: true, render: (r) => formatDate(r.createdAt) },
    ],
    details: [
      { label: 'Email', value: (r) => mail(r.email) },
      { label: 'Subscribed', value: (r) => formatDateTime(r.createdAt) },
    ],
  },
};
