'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Checkbox, ErrorState, Input, Modal, PageHeader, Textarea, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { toLocalInput } from './crm';
import { ImageField } from './upload';
import { GalleryField } from './GalleryField';
import { CmsActions } from './CmsActions';
import { ConflictAlert, MarkdownPreview, PreviewImage, SlugField, StateBadge, asList, commaList, counter, fromLocalInput, isConflict, lines, slugify } from './cms';
import s from './admin.module.css';

type Row = Record<string, any>;
type Link2 = { label: string; url: string };

interface ProjectForm {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  category: string;
  industry: string;
  services: string[];
  technologies: string;
  cover: string;
  coverAlt: string;
  gallery: string[];
  links: Link2[];
  client: string;
  outcome: string;
  clientApproved: boolean;
  challenge: string;
  approach: string;
  solution: string;
  features: string;
  featured: boolean;
  order: string;
  publishedAt: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
}

const empty: ProjectForm = { title: '', slug: '', shortDescription: '', description: '', category: '', industry: '', services: [], technologies: '', cover: '', coverAlt: '', gallery: [], links: [], client: '', outcome: '', clientApproved: false, challenge: '', approach: '', solution: '', features: '', featured: false, order: '0', publishedAt: '', seoTitle: '', seoDescription: '', ogImage: '' };

function fromRow(r: Row): ProjectForm {
  const images = asList(r.images);
  return {
    title: r.title ?? '',
    slug: r.slug ?? '',
    shortDescription: r.shortDescription ?? '',
    description: r.description ?? '',
    category: r.category ?? '',
    industry: r.industry ?? '',
    services: asList(r.services),
    technologies: asList(r.technologies).join(', '),
    // Dedicated cover field; older projects only had images[0].
    cover: r.coverImage || images[0] || '',
    coverAlt: r.coverImageAlt ?? '',
    gallery: asList(r.gallery),
    links: Array.isArray(r.links) ? r.links.map((l: Row) => ({ label: String(l.label ?? ''), url: String(l.url ?? '') })) : [],
    client: r.client ?? '',
    outcome: r.outcome ?? '',
    clientApproved: Boolean(r.clientApproved),
    challenge: r.challenge ?? '',
    approach: r.approach ?? '',
    solution: r.solution ?? '',
    features: asList(r.features).join('\n'),
    featured: Boolean(r.featured),
    order: String(r.order ?? 0),
    publishedAt: toLocalInput(r.publishedAt),
    seoTitle: r.seoTitle ?? '',
    seoDescription: r.seoDescription ?? '',
    ogImage: r.ogImage ?? '',
  };
}

function toApi(v: ProjectForm) {
  return {
    title: v.title.trim(),
    slug: v.slug.trim(),
    shortDescription: v.shortDescription.trim(),
    description: v.description.trim(),
    category: v.category.trim(),
    industry: v.industry.trim(),
    services: v.services,
    technologies: commaList(v.technologies),
    coverImage: v.cover.trim(),
    coverImageAlt: v.cover.trim() ? v.coverAlt.trim() : '',
    // Kept in sync for pages that still read images[0].
    images: v.cover ? [v.cover] : [],
    gallery: v.gallery,
    links: v.links.filter((l) => l.label.trim() || l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    client: v.client.trim(),
    outcome: v.outcome.trim(),
    clientApproved: v.clientApproved,
    challenge: v.challenge.trim(),
    approach: v.approach.trim(),
    solution: v.solution.trim(),
    features: lines(v.features),
    featured: v.featured,
    order: Number(v.order) || 0,
    publishedAt: fromLocalInput(v.publishedAt),
    seoTitle: v.seoTitle.trim(),
    seoDescription: v.seoDescription.trim(),
    ogImage: v.ogImage.trim(),
  };
}

export function ProjectEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const state = useAsync<Row | null>(() => (id ? api().cms.get('portfolio', id) : Promise.resolve(null)), `project-${id ?? 'new'}`);
  const services = useAsync(() => api().cms.list('services', { pageSize: 100 }), 'cms-services-all');
  const industries = useAsync(() => api().cms.list('industries', { pageSize: 100 }), 'cms-industries-all');
  const [v, setV] = useState<ProjectForm>(empty);
  const [saved, setSaved] = useState<ProjectForm>(empty);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (state.data) {
      const f = fromRow(state.data);
      setV(f);
      setSaved(f);
    }
  }, [state.data]);

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (patch: Partial<ProjectForm>) => setV((cur) => ({ ...cur, ...patch }));
  const hasClientDetails = Boolean(v.client.trim() || v.outcome.trim());

  const save = async (): Promise<boolean> => {
    if (v.cover.trim() && !v.coverAlt.trim()) {
      setErrors({ coverImageAlt: 'Describe the cover image (alt text) before saving' });
      setError('Add alt text for the cover image.');
      return false;
    }
    setPending(true);
    setError(null);
    setErrors({});
    setConflict(false);
    try {
      const body = toApi(v);
      if (id) {
        // The server refuses the save (409) if someone else saved after this version was loaded.
        await api().cms.update('portfolio', id, { ...body, ...(state.data?.updatedAt ? { expectedUpdatedAt: state.data.updatedAt } : {}) });
        setSaved(v);
        state.reload();
        toast('Saved', 'success');
      } else {
        const created = await api().cms.create('portfolio', { ...body, published: false });
        toast('Draft saved', 'success');
        router.replace(`/website/projects/${created.id}`);
      }
      return true;
    } catch (err) {
      if (isConflict(err)) setConflict(true);
      else {
        setError(errorMessage(err));
        setErrors(fieldErrorMap(err));
      }
      return false;
    } finally {
      setPending(false);
    }
  };

  if (id && state.status === 404) return <ErrorState title="Project not found" message="It may have been deleted." />;
  const row = state.data;
  const industryOptions: string[] = (industries.data?.items ?? []).map((i: Row) => i.title);

  return (
    <AsyncView state={{ ...state, data: id ? state.data : ({} as Row) }}>
      {() => (
        <>
          <PageHeader
            eyebrow={<Link href="/website/projects" className={s.link}>← Projects</Link>}
            title={id ? v.title || 'Untitled project' : 'New project'}
            description={row ? <><StateBadge row={row} /> <span className={s.small}>Updated {formatDateTime(row.updatedAt)}</span></> : 'Projects are saved as drafts. Only add real work you are allowed to show.'}
            actions={
              <div className={s.actions}>
                <Button size="sm" variant="outline" onClick={() => setPreview(true)}>Preview</Button>
                <Button size="sm" onClick={save} loading={pending} disabled={id ? !dirty : false}>{id ? 'Save changes' : 'Save draft'}</Button>
              </div>
            }
          />
          {row && <Card><CmsActions kind="portfolio" row={row} listPath="/website/projects" sitePath="/portfolio" onChanged={state.reload} beforePublish={async () => (dirty ? save() : true)} dirty={dirty} /></Card>}
          {conflict && <ConflictAlert onReload={() => { setConflict(false); state.reload(); }} />}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className={s.grid}>
            <div className={s.stackSm}>
              <Card title="Project">
                <div className={s.stackSm}>
                  <Input label="Title" value={v.title} required error={errors.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
                  <SlugField kind="portfolio" value={v.slug} excludeId={id ?? undefined} prefix="/portfolio/" error={errors.slug} onChange={(slug) => { setSlugTouched(true); set({ slug }); }} />
                  <Textarea label="Short description" rows={2} value={v.shortDescription} required error={errors.shortDescription} hint={counter(v.shortDescription, 160, 500)} onChange={(e) => set({ shortDescription: e.target.value })} />
                  <Textarea label="Description" rows={8} value={v.description} required error={errors.description} onChange={(e) => set({ description: e.target.value })} />
                  <Input label="Category" value={v.category} required error={errors.category} hint="e.g. Web application, Mobile app, E-commerce" onChange={(e) => set({ category: e.target.value })} />
                  <Input label="Industry" list="industry-options" value={v.industry} error={errors.industry} hint="Pick an industry from the list or type one" onChange={(e) => set({ industry: e.target.value })} />
                  <datalist id="industry-options">{industryOptions.map((t) => <option key={t} value={t} />)}</datalist>
                  <Input label="Technologies" value={v.technologies} error={errors.technologies} hint="Comma separated, only technologies actually used" onChange={(e) => set({ technologies: e.target.value })} />
                </div>
              </Card>
              <Card title="Services delivered">
                <p className={s.small}>The project is shown on these service pages.</p>
                <div className={s.tags}>
                  {(services.data?.items ?? []).map((sv: Row) => (
                    <Checkbox key={sv.slug} label={sv.title} checked={v.services.includes(sv.slug)} onChange={(e) => set({ services: e.target.checked ? [...v.services, sv.slug] : v.services.filter((x) => x !== sv.slug) })} />
                  ))}
                </div>
                {errors.services && <Alert tone="danger">{errors.services}</Alert>}
              </Card>
              <Card title="Story (optional)">
                <div className={s.stackSm}>
                  <Textarea label="Challenge" rows={3} value={v.challenge} onChange={(e) => set({ challenge: e.target.value })} />
                  <Textarea label="Approach" rows={3} value={v.approach} onChange={(e) => set({ approach: e.target.value })} />
                  <Textarea label="Solution" rows={3} value={v.solution} onChange={(e) => set({ solution: e.target.value })} />
                  <Textarea label="Key features" rows={4} value={v.features} hint="One per line" onChange={(e) => set({ features: e.target.value })} />
                </div>
              </Card>
              <Card title="Client & outcome">
                <div className={s.stackSm}>
                  <Alert tone="warning">The client name and outcome are hidden on the public site unless the box below is ticked. Only tick it when the client has approved publishing these details and the outcome is verified.</Alert>
                  <Input label="Client name" value={v.client} error={errors.client} onChange={(e) => set({ client: e.target.value })} />
                  <Textarea label="Outcome" rows={3} value={v.outcome} error={errors.outcome} hint="Facts only — no estimated or unverified numbers." onChange={(e) => set({ outcome: e.target.value })} />
                  <Checkbox label="Client approved publishing these details (verified)" checked={v.clientApproved} onChange={(e) => set({ clientApproved: e.target.checked })} />
                  {hasClientDetails && !v.clientApproved && <p className={s.small}>Saved, but not shown publicly.</p>}
                </div>
              </Card>
            </div>
            <div className={s.stackSm}>
              <Card title="Publishing">
                <div className={s.stackSm}>
                  <Input label="Publication date" type="datetime-local" value={v.publishedAt} error={errors.publishedAt} hint="A future date keeps the project hidden until then." onChange={(e) => set({ publishedAt: e.target.value })} />
                  <Checkbox label="Featured on the homepage and portfolio" checked={v.featured} onChange={(e) => set({ featured: e.target.checked })} />
                  <Input label="Sort order" type="number" value={v.order} error={errors.order} hint="Lower numbers first" onChange={(e) => set({ order: e.target.value })} />
                </div>
              </Card>
              <Card title="Images">
                <div className={s.stackSm}>
                  <ImageField
                    label="Cover image"
                    purpose="CMS_IMAGE"
                    value={v.cover}
                    error={errors.coverImage ?? errors.images}
                    onChange={(cover) => set({ cover })}
                    alt={v.coverAlt}
                    altError={errors.coverImageAlt}
                    onAltChange={(coverAlt) => set({ coverAlt })}
                  />
                  {!v.cover && <p className={s.small}>No cover yet: the website shows a designed “Project image coming soon” placeholder until you upload one.</p>}
                  <GalleryField label="Gallery" value={v.gallery} error={errors.gallery} onChange={(gallery) => set({ gallery })} />
                  <p className={s.small}>Use real screenshots you are allowed to publish. No mock-ups presented as live products.</p>
                </div>
              </Card>
              <Card title="Approved external links">
                <div className={s.stackSm}>
                  {v.links.map((l, i) => (
                    <div key={i} className={s.row}>
                      <Input label="Label" value={l.label} onChange={(e) => set({ links: v.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                      <Input label="URL (https)" type="url" value={l.url} onChange={(e) => set({ links: v.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })} />
                      <Button size="sm" variant="ghost" onClick={() => set({ links: v.links.filter((_, k) => k !== i) })}>Remove</Button>
                    </div>
                  ))}
                  {errors.links && <Alert tone="danger">{errors.links}</Alert>}
                  {v.links.length < 10 && <Button size="sm" variant="outline" onClick={() => set({ links: [...v.links, { label: '', url: '' }] })}>Add link</Button>}
                  <p className={s.small}>Only links the client approved (e.g. the live site or an app store page).</p>
                </div>
              </Card>
              <Card title="Search & social">
                <div className={s.stackSm}>
                  <Input label="SEO title" value={v.seoTitle} error={errors.seoTitle} hint={counter(v.seoTitle, 60, 200)} onChange={(e) => set({ seoTitle: e.target.value })} />
                  <Textarea label="SEO description" rows={3} value={v.seoDescription} error={errors.seoDescription} hint={counter(v.seoDescription, 160, 400)} onChange={(e) => set({ seoDescription: e.target.value })} />
                  <ImageField label="Social image (Open Graph)" purpose="CMS_IMAGE" value={v.ogImage} error={errors.ogImage} onChange={(ogImage) => set({ ogImage })} />
                </div>
              </Card>
            </div>
          </div>
          <Modal open={preview} onClose={() => setPreview(false)} title="Preview (not public)" size="lg" footer={<Button variant="ghost" onClick={() => setPreview(false)}>Close</Button>}>
            <article className={s.stackSm}>
              <PreviewImage src={v.cover} alt={v.coverAlt || v.title} />
              <p className={s.small}>{[v.category, v.industry].filter(Boolean).join(' · ')}</p>
              <h1 style={{ margin: 0, fontSize: '1.7rem' }}>{v.title || 'Untitled project'}</h1>
              <p className={s.muted}>{v.shortDescription}</p>
              <MarkdownPreview markdown={v.description} />
              {v.clientApproved && v.client && <p><strong>Client:</strong> {v.client}</p>}
              {v.clientApproved && v.outcome && <p><strong>Outcome:</strong> {v.outcome}</p>}
              {commaList(v.technologies).length > 0 && <p className={s.small}>Technologies: {commaList(v.technologies).join(', ')}</p>}
            </article>
          </Modal>
        </>
      )}
    </AsyncView>
  );
}
