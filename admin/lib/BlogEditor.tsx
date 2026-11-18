'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, ErrorState, Input, Modal, PageHeader, Select, Textarea, buttonClass, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { toLocalInput } from './crm';
import { ImageField } from './upload';
import { CmsActions } from './CmsActions';
import { CategoriesModal } from './CategoriesModal';
import { CONTENT_HELP, ConflictAlert, MarkdownPreview, PreviewImage, SlugField, StateBadge, asList, commaList, counter, fromLocalInput, isConflict, slugify } from './cms';
import s from './admin.module.css';

type Row = Record<string, any>;

interface BlogForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  coverImageAlt: string;
  categoryId: string;
  tags: string;
  author: string;
  readingTime: string;
  publishedAt: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImage: string;
}

const empty: BlogForm = { title: '', slug: '', excerpt: '', content: '', coverImage: '', coverImageAlt: '', categoryId: '', tags: '', author: 'Globalantic', readingTime: '', publishedAt: '', seoTitle: '', seoDescription: '', canonicalUrl: '', ogImage: '' };

function fromRow(r: Row): BlogForm {
  return {
    title: r.title ?? '',
    slug: r.slug ?? '',
    excerpt: r.excerpt ?? '',
    content: r.content ?? '',
    coverImage: r.coverImage ?? '',
    coverImageAlt: r.coverImageAlt ?? '',
    categoryId: r.categoryId ?? '',
    tags: asList(r.tags).join(', '),
    author: r.author ?? '',
    readingTime: r.readingTime ? String(r.readingTime) : '',
    publishedAt: toLocalInput(r.publishedAt),
    seoTitle: r.seoTitle ?? '',
    seoDescription: r.seoDescription ?? '',
    canonicalUrl: r.canonicalUrl ?? '',
    ogImage: r.ogImage ?? '',
  };
}

function toApi(v: BlogForm) {
  const words = v.content.trim() ? v.content.trim().split(/\s+/).length : 0;
  return {
    title: v.title.trim(),
    slug: v.slug.trim(),
    excerpt: v.excerpt.trim(),
    content: v.content,
    coverImage: v.coverImage.trim(),
    coverImageAlt: v.coverImage.trim() ? v.coverImageAlt.trim() : '',
    categoryId: v.categoryId,
    tags: commaList(v.tags),
    author: v.author.trim() || 'Globalantic',
    // Default reading time: ~200 words per minute.
    readingTime: v.readingTime ? Number(v.readingTime) : Math.max(1, Math.round(words / 200)),
    publishedAt: fromLocalInput(v.publishedAt),
    seoTitle: v.seoTitle.trim(),
    seoDescription: v.seoDescription.trim(),
    canonicalUrl: v.canonicalUrl.trim(),
    ogImage: v.ogImage.trim(),
  };
}

export function BlogEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const state = useAsync<Row | null>(() => (id ? api().cms.get('blog', id) : Promise.resolve(null)), `blog-${id ?? 'new'}`);
  const cats = useAsync(() => api().cms.categories(), 'blog-categories');
  const [v, setV] = useState<BlogForm>(empty);
  const [saved, setSaved] = useState<BlogForm>(empty);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (state.data) {
      const f = fromRow(state.data);
      setV(f);
      setSaved(f);
    }
  }, [state.data]);

  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (patch: Partial<BlogForm>) => setV((cur) => ({ ...cur, ...patch }));

  const save = async (): Promise<boolean> => {
    if (v.coverImage.trim() && !v.coverImageAlt.trim()) {
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
        await api().cms.update('blog', id, { ...body, ...(state.data?.updatedAt ? { expectedUpdatedAt: state.data.updatedAt } : {}) });
        setSaved(v);
        state.reload();
        toast('Saved', 'success');
      } else {
        const created = await api().cms.create('blog', { ...body, published: false });
        toast('Draft saved', 'success');
        router.replace(`/website/blog/${created.id}`);
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

  if (id && state.status === 404) return <ErrorState title="Post not found" message="It may have been deleted." />;
  const row = state.data;
  const future = v.publishedAt && new Date(v.publishedAt).getTime() > Date.now();

  return (
    <AsyncView state={{ ...state, data: id ? state.data : ({} as Row) }}>
      {() => (
        <>
          <PageHeader
            eyebrow={<Link href="/website/blog" className={s.link}>← Blog posts</Link>}
            title={id ? v.title || 'Untitled post' : 'New blog post'}
            description={row ? <><StateBadge row={row} /> <span className={s.small}>Updated {formatDateTime(row.updatedAt)}</span></> : 'Posts are saved as drafts. Nothing is public until you publish.'}
            actions={
              <div className={s.actions}>
                <Button size="sm" variant="outline" onClick={() => setPreview(true)}>Quick preview</Button>
                {id && (
                  <Button
                    size="sm"
                    variant="outline"
                    title={dirty ? 'Save first: the site preview shows the last saved version' : 'Opens the saved draft exactly as the public article page renders it (not indexed, admins only)'}
                    disabled={dirty}
                    onClick={() => window.open(`${api().cms.siteUrl()}/blog/preview/${id}`, '_blank', 'noopener,noreferrer')}
                  >
                    Preview on site
                  </Button>
                )}
                <Button size="sm" variant={row?.published ? 'primary' : 'secondary'} onClick={save} loading={pending} disabled={id ? !dirty : false}>{id ? 'Save changes' : 'Save draft'}</Button>
              </div>
            }
          />
          {row && <Card><CmsActions kind="blog" row={row} listPath="/website/blog" sitePath="/blog" onChanged={state.reload} beforePublish={async () => (dirty ? save() : true)} dirty={dirty} /></Card>}
          {conflict && <ConflictAlert onReload={() => { setConflict(false); state.reload(); }} />}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className={s.grid}>
            <Card title="Content">
              <div className={s.stackSm}>
                <Input label="Title" value={v.title} required error={errors.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
                <SlugField kind="blog" value={v.slug} excludeId={id ?? undefined} prefix="/blog/" error={errors.slug} onChange={(slug) => { setSlugTouched(true); set({ slug }); }} />
                <Textarea label="Excerpt" rows={3} value={v.excerpt} required error={errors.excerpt} hint={`Shown on the blog list and in search results. ${counter(v.excerpt, 160, 500)}`} onChange={(e) => set({ excerpt: e.target.value })} />
                <Textarea label="Content" rows={18} value={v.content} required error={errors.content} hint={CONTENT_HELP} onChange={(e) => set({ content: e.target.value })} />
              </div>
            </Card>
            <div className={s.stackSm}>
              <Card title="Publishing">
                <div className={s.stackSm}>
                  <Input
                    label="Publication date"
                    type="datetime-local"
                    value={v.publishedAt}
                    error={errors.publishedAt}
                    hint={future ? 'Future date: the post stays hidden until then, even when published (scheduled).' : 'Leave empty to use the moment you publish.'}
                    onChange={(e) => set({ publishedAt: e.target.value })}
                  />
                  <Input label="Author" value={v.author} error={errors.author} onChange={(e) => set({ author: e.target.value })} />
                  <Input label="Reading time (minutes)" type="number" min={1} max={240} value={v.readingTime} error={errors.readingTime} hint="Leave empty to estimate from the length." onChange={(e) => set({ readingTime: e.target.value })} />
                  <div className={s.stackSm}>
                    <Select
                      label="Category"
                      value={v.categoryId}
                      error={errors.categoryId}
                      placeholder="No category"
                      options={(cats.data ?? []).map((c: Row) => ({ value: c.id, label: c.name }))}
                      onChange={(e) => set({ categoryId: e.target.value })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setCatsOpen(true)}>Manage categories</Button>
                  </div>
                  <Input label="Tags" value={v.tags} error={errors.tags} hint="Comma separated, e.g. nextjs, performance" onChange={(e) => set({ tags: e.target.value })} />
                </div>
              </Card>
              <Card title="Cover image">
                <ImageField
                  label="Cover image"
                  purpose="CMS_IMAGE"
                  value={v.coverImage}
                  error={errors.coverImage}
                  onChange={(coverImage) => set({ coverImage })}
                  alt={v.coverImageAlt}
                  altError={errors.coverImageAlt}
                  onAltChange={(coverImageAlt) => set({ coverImageAlt })}
                />
                <p className={s.small}>Use an image you own or are licensed to use.</p>
              </Card>
              <Card title="Search & social">
                <div className={s.stackSm}>
                  <Input label="SEO title" value={v.seoTitle} error={errors.seoTitle} hint={`Defaults to the post title. ${counter(v.seoTitle, 60, 200)}`} onChange={(e) => set({ seoTitle: e.target.value })} />
                  <Textarea label="SEO description" rows={3} value={v.seoDescription} error={errors.seoDescription} hint={`Defaults to the excerpt. ${counter(v.seoDescription, 160, 400)}`} onChange={(e) => set({ seoDescription: e.target.value })} />
                  <Input label="Canonical URL" type="url" value={v.canonicalUrl} error={errors.canonicalUrl} hint="Only if this post was first published elsewhere (https://…)." onChange={(e) => set({ canonicalUrl: e.target.value })} />
                  <ImageField label="Social image (Open Graph)" purpose="CMS_IMAGE" value={v.ogImage} error={errors.ogImage} onChange={(ogImage) => set({ ogImage })} />
                </div>
              </Card>
            </div>
          </div>
          <Modal open={preview} onClose={() => setPreview(false)} title="Preview (not public)" size="lg" footer={<Button variant="ghost" onClick={() => setPreview(false)}>Close</Button>}>
            <article>
              <PreviewImage src={v.coverImage} alt={v.coverImageAlt || v.title} />
              <h1 style={{ margin: '0 0 8px', fontSize: '1.7rem' }}>{v.title || 'Untitled post'}</h1>
              <p className={s.muted} style={{ margin: '0 0 16px' }}>{v.excerpt}</p>
              <MarkdownPreview markdown={v.content} />
            </article>
          </Modal>
          <CategoriesModal open={catsOpen} onClose={() => { setCatsOpen(false); cats.reload(); }} />
          {row?.published && !dirty && <p className={s.small}>Live at <a className={s.link} href={`${api().cms.siteUrl()}/blog/${row.slug}`} target="_blank" rel="noopener noreferrer">/blog/{row.slug}</a> when the publication date has passed.</p>}
          {!id && <p className={s.small}><Link href="/website/blog" className={buttonClass('ghost', 'sm')}>Cancel</Link></p>}
        </>
      )}
    </AsyncView>
  );
}
