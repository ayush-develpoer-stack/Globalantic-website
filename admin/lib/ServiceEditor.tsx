'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Badge, Button, Card, Checkbox, ErrorState, Input, PageHeader, Select, Textarea, buttonClass, useAsync, useToast } from '@globalantic/ui';
import { useConfirm, useRun } from './admin';
import { HERO_LABEL, HERO_VARIANTS, SlugField, asList, counter, lines, slugify } from './cms';
import s from './admin.module.css';

type Row = Record<string, any>;
type Pair = { a: string; b: string };

interface ServiceForm {
  title: string;
  slug: string;
  tagline: string;
  icon: string;
  shortDesc: string;
  overview: string;
  problem: string;
  solution: string;
  heroVariant: string;
  audience: string;
  industries: string[];
  features: string;
  deliverables: string;
  benefits: string;
  useCases: string;
  technologies: string;
  process: Pair[];
  faqs: Pair[];
  seoTitle: string;
  seoDescription: string;
  order: string;
  featured: boolean;
}

const empty: ServiceForm = { title: '', slug: '', tagline: '', icon: '', shortDesc: '', overview: '', problem: '', solution: '', heroVariant: '', audience: '', industries: [], features: '', deliverables: '', benefits: '', useCases: '', technologies: '', process: [], faqs: [], seoTitle: '', seoDescription: '', order: '0', featured: false };

const pairs = (v: unknown, a: string, b: string): Pair[] => (Array.isArray(v) ? v.map((x: Row) => ({ a: String(x?.[a] ?? ''), b: String(x?.[b] ?? '') })) : []);

function fromRow(r: Row): ServiceForm {
  return {
    title: r.title ?? '',
    slug: r.slug ?? '',
    tagline: r.tagline ?? '',
    icon: r.icon ?? '',
    shortDesc: r.shortDesc ?? '',
    overview: r.overview ?? '',
    problem: r.problem ?? '',
    solution: r.solution ?? '',
    heroVariant: r.heroVariant ?? '',
    audience: asList(r.audience).join('\n'),
    industries: asList(r.industries),
    features: asList(r.features).join('\n'),
    deliverables: asList(r.deliverables).join('\n'),
    benefits: asList(r.benefits).join('\n'),
    useCases: asList(r.useCases).join('\n'),
    technologies: asList(r.technologies).join('\n'),
    process: pairs(r.process, 'title', 'description'),
    faqs: pairs(r.faqs, 'question', 'answer'),
    seoTitle: r.seoTitle ?? '',
    seoDescription: r.seoDescription ?? '',
    order: String(r.order ?? 0),
    featured: Boolean(r.featured),
  };
}

function toApi(v: ServiceForm) {
  const filled = (p: Pair[]) => p.filter((x) => x.a.trim() && x.b.trim());
  return {
    title: v.title.trim(),
    slug: v.slug.trim(),
    tagline: v.tagline.trim(),
    icon: v.icon.trim(),
    shortDesc: v.shortDesc.trim(),
    overview: v.overview.trim(),
    problem: v.problem.trim(),
    solution: v.solution.trim(),
    heroVariant: v.heroVariant || null,
    audience: lines(v.audience),
    industries: v.industries,
    features: lines(v.features),
    deliverables: lines(v.deliverables),
    benefits: lines(v.benefits),
    useCases: lines(v.useCases),
    technologies: lines(v.technologies),
    process: filled(v.process).map((p) => ({ title: p.a.trim(), description: p.b.trim() })),
    faqs: filled(v.faqs).map((p) => ({ question: p.a.trim(), answer: p.b.trim() })),
    seoTitle: v.seoTitle.trim(),
    seoDescription: v.seoDescription.trim(),
    order: Number(v.order) || 0,
    featured: v.featured,
  };
}

function PairsEditor({ label, aLabel, bLabel, value, onChange }: { label: string; aLabel: string; bLabel: string; value: Pair[]; onChange: (v: Pair[]) => void }) {
  return (
    <Card title={label}>
      <div className={s.stackSm}>
        {value.map((p, i) => (
          <div key={i} className={s.stackSm}>
            <Input label={`${aLabel} ${i + 1}`} value={p.a} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} />
            <Textarea label={bLabel} rows={2} value={p.b} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, b: e.target.value } : x)))} />
            <div className={s.actions}>
              <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const n = [...value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}>Move up</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, k) => k !== i))}>Remove</Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => onChange([...value, { a: '', b: '' }])}>Add</Button>
      </div>
    </Card>
  );
}

export function ServiceEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const state = useAsync<Row | null>(() => (id ? api().cms.get('services', id) : Promise.resolve(null)), `service-${id ?? 'new'}`);
  const industries = useAsync(() => api().cms.list('industries', { pageSize: 100 }), 'cms-industries-all');
  const [v, setV] = useState<ServiceForm>(empty);
  const [saved, setSaved] = useState<ServiceForm>(empty);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.data) {
      const f = fromRow(state.data);
      setV(f);
      setSaved(f);
    }
  }, [state.data]);

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (patch: Partial<ServiceForm>) => setV((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      if (id) {
        await api().cms.update('services', id, toApi(v));
        setSaved(v);
        state.reload();
        toast('Saved', 'success');
      } else {
        const created = await api().cms.create('services', { ...toApi(v), published: false });
        toast('Service saved as unpublished', 'success');
        router.replace(`/website/services/${created.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  if (id && state.status === 404) return <ErrorState title="Service not found" />;
  const row = state.data;
  const siteUrl = row ? `${api().cms.siteUrl()}/services/${row.slug}` : '';

  return (
    <AsyncView state={{ ...state, data: id ? state.data : ({} as Row) }}>
      {() => (
        <>
          <PageHeader
            eyebrow={<Link href="/website/services" className={s.link}>← Services</Link>}
            title={id ? v.title || 'Untitled service' : 'New service'}
            description={row ? (row.published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Unpublished</Badge>) : 'New services are unpublished until you publish them.'}
            actions={
              <div className={s.actions}>
                {row && !row.published && <Button size="sm" variant="outline" disabled={dirty} onClick={async () => (await run(() => api().cms.publish('services', row.id), 'Published')) && state.reload()}>Publish</Button>}
                {row?.published && (
                  <>
                    <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>View on site<span className="sr-only"> (opens in a new tab)</span></a>
                    <Button size="sm" variant="outline" onClick={() => ask({ title: 'Unpublish this service?', message: 'Its public page and any landing pages using it stop working until you publish it again.', confirmLabel: 'Unpublish', onConfirm: async () => { await api().cms.unpublish('services', row.id); state.reload(); }, success: 'Unpublished' })}>Unpublish</Button>
                  </>
                )}
                <Button size="sm" onClick={save} loading={pending} disabled={id ? !dirty : false}>{id ? 'Save changes' : 'Save'}</Button>
              </div>
            }
          />
          {dirty && row && !row.published && <p className={s.small}>Save your changes before publishing.</p>}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className={s.grid}>
            <div className={s.stackSm}>
              <Card title="Page content">
                <div className={s.stackSm}>
                  <Input label="Title" value={v.title} required error={errors.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
                  <SlugField kind="services" value={v.slug} excludeId={id ?? undefined} prefix="/services/" error={errors.slug} onChange={(slug) => { setSlugTouched(true); set({ slug }); }} />
                  <Input label="Tagline (hero headline)" value={v.tagline} error={errors.tagline} onChange={(e) => set({ tagline: e.target.value })} />
                  <Textarea label="Short description" rows={2} value={v.shortDesc} required error={errors.shortDesc} hint={counter(v.shortDesc, 160, 500)} onChange={(e) => set({ shortDesc: e.target.value })} />
                  <Textarea label="Overview" rows={5} value={v.overview} required error={errors.overview} onChange={(e) => set({ overview: e.target.value })} />
                  <Textarea label="Customer problem" rows={3} value={v.problem} error={errors.problem} onChange={(e) => set({ problem: e.target.value })} />
                  <Textarea label="How we solve it" rows={3} value={v.solution} error={errors.solution} onChange={(e) => set({ solution: e.target.value })} />
                </div>
              </Card>
              <Card title="Lists (one item per line)">
                <div className={s.stackSm}>
                  <Textarea label="Features" rows={5} value={v.features} onChange={(e) => set({ features: e.target.value })} />
                  <Textarea label="Deliverables" rows={4} value={v.deliverables} onChange={(e) => set({ deliverables: e.target.value })} />
                  <Textarea label="Benefits" rows={4} value={v.benefits} hint="No guarantees or unverified numbers." onChange={(e) => set({ benefits: e.target.value })} />
                  <Textarea label="Use cases" rows={4} value={v.useCases} onChange={(e) => set({ useCases: e.target.value })} />
                  <Textarea label="Technologies" rows={4} value={v.technologies} hint="Only technologies Globalantic actually uses (shown with their logos where available)." onChange={(e) => set({ technologies: e.target.value })} />
                </div>
              </Card>
              <PairsEditor label="Process steps" aLabel="Step" bLabel="Description" value={v.process} onChange={(process) => set({ process })} />
              <PairsEditor label="FAQs" aLabel="Question" bLabel="Answer" value={v.faqs} onChange={(faqs) => set({ faqs })} />
            </div>
            <div className={s.stackSm}>
              <Card title="Presentation">
                <div className={s.stackSm}>
                  <Select label="Hero illustration" value={v.heroVariant} placeholder="Automatic (based on the slug)" options={HERO_VARIANTS.map((h) => ({ value: h, label: HERO_LABEL[h] }))} error={errors.heroVariant} onChange={(e) => set({ heroVariant: e.target.value })} />
                  <Input label="Icon name" value={v.icon} hint="A lucide icon name, e.g. Globe, Smartphone" onChange={(e) => set({ icon: e.target.value })} />
                  <Input label="Sort order" type="number" value={v.order} onChange={(e) => set({ order: e.target.value })} />
                  <Checkbox label="Featured on the homepage" checked={v.featured} onChange={(e) => set({ featured: e.target.checked })} />
                </div>
              </Card>
              <Card title="Who it is for">
                <div className={s.stackSm}>
                  <Textarea label="Audience" rows={4} value={v.audience} hint="One per line, e.g. Startups launching a first website" onChange={(e) => set({ audience: e.target.value })} />
                  <strong>Industries</strong>
                  <div className={s.tags}>
                    {(industries.data?.items ?? []).map((ind: Row) => (
                      <Checkbox key={ind.slug} label={ind.title} checked={v.industries.includes(ind.slug)} onChange={(e) => set({ industries: e.target.checked ? [...v.industries, ind.slug] : v.industries.filter((x) => x !== ind.slug) })} />
                    ))}
                  </div>
                </div>
              </Card>
              <Card title="Search">
                <div className={s.stackSm}>
                  <Input label="SEO title" value={v.seoTitle} hint={counter(v.seoTitle, 60, 200)} onChange={(e) => set({ seoTitle: e.target.value })} />
                  <Textarea label="SEO description" rows={3} value={v.seoDescription} hint={counter(v.seoDescription, 160, 400)} onChange={(e) => set({ seoDescription: e.target.value })} />
                </div>
              </Card>
            </div>
          </div>
          {dialog}
        </>
      )}
    </AsyncView>
  );
}
