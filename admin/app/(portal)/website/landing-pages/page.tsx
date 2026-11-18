'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Checkbox, DataTable, Input, Modal, PageHeader, Select, Textarea, formatDate, useAsync, useToast } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import { SLUG_HINT, SLUG_RE, counter, lines, slugify } from '@/lib/cms';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

interface LpForm {
  slug: string;
  serviceSlug: string;
  headline: string;
  subheadline: string;
  benefits: string;
  ctaLabel: string;
  priceNote: string;
  seoTitle: string;
  seoDescription: string;
  indexable: boolean;
  published: boolean;
}
const empty: LpForm = { slug: '', serviceSlug: '', headline: '', subheadline: '', benefits: '', ctaLabel: 'Get a Free Consultation', priceNote: '', seoTitle: '', seoDescription: '', indexable: false, published: false };

const fromRow = (r: Row): LpForm => ({
  slug: r.slug,
  serviceSlug: r.serviceSlug,
  headline: r.headline,
  subheadline: r.subheadline,
  benefits: (Array.isArray(r.benefits) ? r.benefits : []).join('\n'),
  ctaLabel: r.ctaLabel ?? '',
  priceNote: r.priceNote ?? '',
  seoTitle: r.seoTitle ?? '',
  seoDescription: r.seoDescription ?? '',
  indexable: Boolean(r.indexable),
  published: Boolean(r.published),
});

const toApi = (v: LpForm) => ({ ...v, slug: v.slug.trim(), headline: v.headline.trim(), subheadline: v.subheadline.trim(), benefits: lines(v.benefits), ctaLabel: v.ctaLabel.trim() || 'Get a Free Consultation', priceNote: v.priceNote.trim(), seoTitle: v.seoTitle.trim(), seoDescription: v.seoDescription.trim() });

/** Campaign link with UTM parameters (built in the browser; nothing is sent anywhere). */
function LinkBuilder({ slug }: { slug: string }) {
  const toast = useToast();
  const [u, setU] = useState({ source: 'google', medium: 'cpc', campaign: '', content: '' });
  const params = [['utm_source', u.source], ['utm_medium', u.medium], ['utm_campaign', u.campaign], ['utm_content', u.content]].filter(([, val]) => val.trim()).map(([k, val]) => `${k}=${encodeURIComponent(val.trim())}`);
  const url = `${api().cms.siteUrl()}/lp/${slug}${params.length ? `?${params.join('&')}` : ''}`;
  return (
    <div className={s.stackSm}>
      <div className={s.formGrid}>
        <Input label="utm_source" value={u.source} onChange={(e) => setU({ ...u, source: e.target.value })} hint="e.g. google, facebook, instagram" />
        <Input label="utm_medium" value={u.medium} onChange={(e) => setU({ ...u, medium: e.target.value })} hint="e.g. cpc, paid_social, email" />
        <Input label="utm_campaign" value={u.campaign} onChange={(e) => setU({ ...u, campaign: e.target.value })} hint="e.g. web-dev-oct-2026" />
        <Input label="utm_content (optional)" value={u.content} onChange={(e) => setU({ ...u, content: e.target.value })} hint="e.g. ad variant" />
      </div>
      <Input label="Campaign URL" value={url} readOnly onFocus={(e) => e.target.select()} />
      <div className={s.actions}>
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Link copied', 'success')).catch(() => toast('Copy failed — select the URL and copy it', 'danger'))}>Copy link</Button>
      </div>
      <p className={s.small}>Enquiries from this link record the landing page and these UTM values in the CRM.</p>
    </div>
  );
}

export default function LandingPagesPage() {
  const state = useAsync(() => api().cms.landingPages(), 'landing-pages');
  const services = useAsync(() => api().cms.list('services', { pageSize: 100 }), 'cms-services-all');
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [v, setV] = useState<LpForm>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (p: Partial<LpForm>) => setV((c) => ({ ...c, ...p }));

  const open = (r: Row | 'new') => {
    setEditing(r);
    setV(r === 'new' ? empty : fromRow(r));
    setErrors({});
    setError(null);
  };

  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      if (editing === 'new') await api().cms.createLandingPage(toApi(v));
      else if (editing) await api().cms.updateLandingPage(editing.id, toApi(v));
      toast('Landing page saved', 'success');
      setEditing(null);
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  const serviceTitle = (slug: string) => (services.data?.items ?? []).find((x: Row) => x.slug === slug)?.title ?? slug;
  const archived = editing && editing !== 'new' && editing.archivedAt;

  return (
    <>
      <PageHeader
        title="Campaign landing pages"
        description="Focused pages for advertising (/lp/<slug>). Each one sells one real service and reuses its content, FAQs and enquiry form. Pages are hidden from search by default."
        actions={<Button size="sm" onClick={() => open('new')}>New landing page</Button>}
      />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No landing pages yet', description: 'Create one when you start an ad campaign for a service.' }}>
        {(rows) => (
          <DataTable<Row>
            caption="Landing pages"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'h', header: 'Page', render: (r) => (<><strong>{r.headline}</strong><div className={s.small}>/lp/{r.slug}</div></>) },
              { key: 's', header: 'Service', hideOnMobile: true, render: (r) => serviceTitle(r.serviceSlug) },
              { key: 'st', header: 'Status', render: (r) => (r.archivedAt ? <Badge tone="neutral">Archived</Badge> : r.published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>) },
              { key: 'i', header: 'Search', hideOnMobile: true, render: (r) => (r.indexable ? 'Indexable' : 'noindex') },
              { key: 'u', header: 'Updated', hideOnMobile: true, render: (r) => formatDate(r.updatedAt) },
              {
                key: 'x',
                header: <span className="sr-only">Actions</span>,
                render: (r) => (
                  <div className={s.actions}>
                    <Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setLinkFor(r.slug)}>Campaign link</Button>
                    {!r.archivedAt && <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Archive this landing page?', message: 'The page stops working for visitors. Ads pointing to it should be paused.', confirmLabel: 'Archive', onConfirm: async () => { await api().cms.archiveLandingPage(r.id); state.reload(); }, success: 'Archived' })}>Archive</Button>}
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Delete permanently?', confirmLabel: 'Delete', tone: 'danger', onConfirm: async () => { await api().cms.deleteLandingPage(r.id); state.reload(); }, success: 'Deleted' })}>Delete</Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </AsyncView>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New landing page' : 'Edit landing page'}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}
      >
        <div className={s.stackSm}>
          {error && <Alert tone="danger">{error}</Alert>}
          {archived && <Alert tone="info">This page is archived and cannot be published again. Create a new page instead.</Alert>}
          <Select label="Service" value={v.serviceSlug} required error={errors.serviceSlug} placeholder="Choose the service this page sells" options={(services.data?.items ?? []).map((x: Row) => ({ value: x.slug, label: `${x.title}${x.published ? '' : ' (unpublished)'}` }))} onChange={(e) => set({ serviceSlug: e.target.value })} />
          <Input label="Headline" value={v.headline} required error={errors.headline} hint={counter(v.headline, 70, 160)} onChange={(e) => set({ headline: e.target.value })} />
          <Input
            label="Slug (URL)"
            value={v.slug}
            required
            error={errors.slug ?? (v.slug && !SLUG_RE.test(v.slug) ? SLUG_HINT : undefined)}
            hint={`/lp/${v.slug || '…'}`}
            onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
            onBlur={() => !v.slug && v.headline && set({ slug: slugify(v.headline) })}
          />
          <Textarea label="Subheadline" rows={2} value={v.subheadline} required error={errors.subheadline} onChange={(e) => set({ subheadline: e.target.value })} />
          <Textarea label="Benefits (one per line, up to 8)" rows={4} value={v.benefits} error={errors.benefits} hint="Concrete and true — no guarantees or invented numbers." onChange={(e) => set({ benefits: e.target.value })} />
          <Input label="Button text" value={v.ctaLabel} error={errors.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} />
          <Input label="Approved price note (optional)" value={v.priceNote} error={errors.priceNote} hint="Only enter pricing that has been approved, e.g. “Websites from ₹X”. Leave empty to show no price." onChange={(e) => set({ priceNote: e.target.value })} />
          <Input label="SEO title" value={v.seoTitle} error={errors.seoTitle} hint={counter(v.seoTitle, 60, 200)} onChange={(e) => set({ seoTitle: e.target.value })} />
          <Textarea label="SEO description" rows={2} value={v.seoDescription} error={errors.seoDescription} hint={counter(v.seoDescription, 160, 400)} onChange={(e) => set({ seoDescription: e.target.value })} />
          <Checkbox label="Allow search engines to index this page" checked={v.indexable} onChange={(e) => set({ indexable: e.target.checked })} />
          <p className={s.small}>Ad landing pages are usually kept out of search (noindex) so they do not compete with the main service page.</p>
          <Checkbox label="Published" checked={v.published} disabled={Boolean(archived)} onChange={(e) => set({ published: e.target.checked })} />
        </div>
      </Modal>

      <Modal open={linkFor !== null} onClose={() => setLinkFor(null)} title="Campaign link" footer={<Button variant="ghost" onClick={() => setLinkFor(null)}>Close</Button>}>
        {linkFor && <LinkBuilder slug={linkFor} />}
      </Modal>
      {dialog}
    </>
  );
}
