import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { apiConfig } from '@/lib/api/config';
import { getBlogCategories } from '@/lib/api';
import { siteConfig } from '@/lib/config';
import { ArticleView } from '@/components/blog/ArticleView';
import { Button } from '@/components/ui/Button';
import type { BlogPost } from '@/types';

/**
 * Admin draft preview: renders an unpublished post exactly like the public article.
 * The visitor's own session cookie is forwarded to the admin API, which enforces cms.manage;
 * nothing is cached, the page is noindex and disallowed in robots.txt, and it is never in the sitemap.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: { absolute: `Draft preview | ${siteConfig.name}` },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

type Outcome = { kind: 'ok'; post: BlogPost } | { kind: 'denied' } | { kind: 'missing' } | { kind: 'error' };

async function loadDraft(id: string): Promise<Outcome> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !apiConfig.apiUrl) return { kind: 'missing' };
  const jar = await cookies();
  const cookie = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (!cookie) return { kind: 'denied' };
  try {
    const res = await fetch(`${apiConfig.apiUrl}/admin/blog/${id}`, {
      headers: { Accept: 'application/json', Cookie: cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) return { kind: 'denied' };
    if (res.status === 404 || res.status === 422) return { kind: 'missing' };
    if (!res.ok) return { kind: 'error' };
    const body = (await res.json()) as { data?: BlogPost & { categoryId?: string | null } };
    if (!body.data) return { kind: 'error' };
    const post = body.data;
    if (!post.category && post.categoryId) {
      const categories = (await getBlogCategories()) ?? [];
      post.category = categories.find((c) => c.id === post.categoryId) ?? null;
    }
    return { kind: 'ok', post: { ...post, tags: Array.isArray(post.tags) ? post.tags : [] } };
  } catch {
    return { kind: 'error' };
  }
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560, textAlign: 'center', display: 'grid', gap: 16, justifyItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--fs-h2)' }}>{title}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>{text}</p>
        <Button href="/blog" variant="outline">
          Go to the blog
        </Button>
      </div>
    </section>
  );
}

export default async function BlogPreviewPage(props: PageProps) {
  const { id } = await props.params;
  const result = await loadDraft(id);
  if (result.kind === 'denied') return <Notice title="Sign in to the admin to preview" text="Draft previews are only visible to signed-in staff with content access. Sign in to the admin portal in this browser, then open the preview link again." />;
  if (result.kind === 'missing') return <Notice title="Draft not found" text="This draft does not exist or was deleted." />;
  if (result.kind === 'error') return <Notice title="Preview unavailable" text="The server could not load this draft right now. Please try again shortly." />;
  return <ArticleView post={result.post} preview />;
}
