'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, type CmsKind } from '@globalantic/api-client';
import { Alert, Badge, Button, Input, formatDateTime } from '@globalantic/ui';
import { resolveImageSrc } from './upload';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Hero illustration styles accepted by the API (backend/src/validators/index.ts HERO_VARIANTS). */
export const HERO_VARIANTS = ['browser', 'webapp', 'mobile', 'dashboard', 'workflow', 'crm', 'erp', 'commerce', 'design', 'api', 'cloud', 'maintenance', 'search', 'answers', 'generative', 'marketing', 'social', 'ads', 'brand'] as const;
export const HERO_LABEL: Record<string, string> = {
  browser: 'Browser & devices (websites)',
  webapp: 'Web app screens',
  mobile: 'Mobile app screens',
  dashboard: 'Software dashboard',
  workflow: 'AI / automation workflow',
  crm: 'CRM pipeline',
  erp: 'ERP modules',
  commerce: 'Online store',
  design: 'Design system / UI',
  api: 'API connections',
  cloud: 'Cloud infrastructure',
  maintenance: 'Maintenance status board',
  search: 'Search visibility (SEO)',
  answers: 'Answers & FAQs (AEO)',
  generative: 'AI assistant answer (GEO)',
  marketing: 'Marketing funnel',
  social: 'Social posts',
  ads: 'Ad campaigns',
  brand: 'Brand identity',
};

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_HINT = 'Lowercase letters, numbers and single hyphens, e.g. my-first-post';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

/** Lifecycle state of a blog post / project, as the public site sees it. */
export type PublicState = 'draft' | 'scheduled' | 'published' | 'archived';
export function publicState(r: Row): PublicState {
  if (r.archivedAt) return 'archived';
  if (!r.published) return 'draft';
  if (r.publishedAt && new Date(r.publishedAt).getTime() > Date.now()) return 'scheduled';
  return 'published';
}

export function StateBadge({ row }: { row: Row }) {
  const st = publicState(row);
  if (st === 'archived') return <Badge tone="neutral">Archived</Badge>;
  if (st === 'draft') return <Badge tone="warning">Draft</Badge>;
  if (st === 'scheduled') return <Badge tone="info">Scheduled · {formatDateTime(row.publishedAt)}</Badge>;
  return <Badge tone="success">Published</Badge>;
}

export const STATUS_TABS: { value: '' | PublicState; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'archived', label: 'Archived' },
];

/** <input type="datetime-local"> value -> ISO with offset ('' stays empty). */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
export const commaList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Slug input with format hint and a live availability check against the API. */
export function SlugField({ kind, value, onChange, excludeId, error, prefix }: { kind: CmsKind; value: string; onChange: (v: string) => void; excludeId?: string; error?: string; prefix: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setAvailable(null);
    if (!value || !SLUG_RE.test(value)) return;
    let active = true;
    const t = setTimeout(() => {
      api()
        .cms.slugAvailable(kind, value, excludeId)
        .then((r) => active && setAvailable(r.available))
        .catch(() => active && setAvailable(null));
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [kind, value, excludeId]);
  const formatError = value && !SLUG_RE.test(value) ? SLUG_HINT : undefined;
  const taken = available === false ? 'This slug is already used' : undefined;
  return (
    <Input
      label="Slug (URL)"
      value={value}
      onChange={(e) => onChange(e.target.value.toLowerCase())}
      error={error ?? formatError ?? taken}
      hint={available ? `Available — ${prefix}${value}` : `${prefix}${value || '…'} · ${SLUG_HINT}`}
      required
    />
  );
}

/** Character counter text for SEO fields. */
export const counter = (v: string, ideal: number, max: number) => `${v.length}/${max} characters${v.length > ideal ? ` · ideally under ${ideal}` : ''}`;

// ---------------------------------------------------------------------------
// Preview renderer — the same lightweight rules as the public blog renderer
// (frontend/components/blog/ArticleContent.tsx): ## / ### headings, paragraphs
// separated by blank lines, "- " bullet lists and **bold**. Text is rendered as
// React children, so HTML is always escaped.
// ---------------------------------------------------------------------------

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const b = /^\*\*([^*]+)\*\*$/.exec(part);
    return b ? <strong key={i}>{b[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let k = 0;
  const flushPara = () => {
    const t = para.join(' ').trim();
    if (t) blocks.push(<p key={k++} style={{ margin: '0 0 12px', lineHeight: 1.7 }}>{inline(t)}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(<ul key={k++} style={{ margin: '0 0 12px', paddingLeft: 22, lineHeight: 1.7 }}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
    list = [];
  };
  for (const raw of (markdown || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push(h[1].length === 2 ? <h2 key={k++} style={{ margin: '20px 0 10px', fontSize: '1.35rem' }}>{inline(h[2])}</h2> : <h3 key={k++} style={{ margin: '16px 0 8px', fontSize: '1.1rem' }}>{inline(h[2])}</h3>);
    } else if (li) {
      flushPara();
      list.push(li[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div>{blocks.length ? blocks : <p className={s.muted}>Nothing to preview yet.</p>}</div>;
}

export const CONTENT_HELP =
  'Formatting: "## Heading" and "### Subheading" on their own line, a blank line between paragraphs, "- item" for bullet lists and **bold** text. Other markup (HTML, links, images) is shown as plain text.';

/** Image shown in previews; only http(s) URLs are rendered. */
export function PreviewImage({ src, alt }: { src?: string | null; alt: string }) {
  const url = resolveImageSrc(src);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary image URL
  return <img src={url} alt={alt} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 12, margin: '0 0 16px' }} />;
}

/** True when a save was refused because someone else saved the record first (expectedUpdatedAt mismatch). */
export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /someone else saved/i.test(err.message);
}

/** Shown after a refused stale save: reloading loads the other person's version (unsaved edits are lost). */
export function ConflictAlert({ onReload }: { onReload: () => void }) {
  return (
    <Alert tone="warning" title="Someone else saved this item after you opened it">
      <p style={{ margin: '0 0 8px' }}>Your changes were not saved, so nothing was overwritten. Copy anything you want to keep, then reload to see the latest version and apply your changes again.</p>
      <Button size="sm" variant="outline" onClick={onReload}>Reload latest version</Button>
    </Alert>
  );
}

/** Removes empty strings so optional fields are not saved as blanks where the API expects absence. */
export function compact<T extends Row>(o: T): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}
