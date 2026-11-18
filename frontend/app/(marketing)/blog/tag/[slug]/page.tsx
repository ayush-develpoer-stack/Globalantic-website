import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { loadPublicBlog } from '@/lib/blog-data';
import { postsWithTag } from '@/lib/blog';
import { PageHero } from '@/components/layout/PageContainer';
import { BlogListing } from '@/components/blog/BlogListing';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

/** Tag pages exist only for tags used by published posts (otherwise 404). */
async function load(slug: string) {
  const { posts } = await loadPublicBlog();
  const { tag, posts: tagged } = postsWithTag(posts, slug);
  return tag ? { tag, posts: tagged } : null;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await load(slug);
  if (!data) return buildMetadata({ title: 'Tag not found', path: `/blog/tag/${slug}`, noindex: true });
  // Tag pages overlap heavily with categories and articles: crawlable for discovery, not indexed.
  return buildMetadata({ title: `Articles tagged “${data.tag}” — Globalantic Blog`, description: `Globalantic articles tagged ${data.tag}.`, path: `/blog/tag/${slug}`, noindex: true });
}

export default async function BlogTagPage(props: PageProps) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const data = await load(slug);
  if (!data) notFound();
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: `#${data.tag}`, path: `/blog/tag/${slug}` },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(crumbs)) }} />
      <PageHero eyebrow="Blog tag" title={`#${data.tag}`} description={`${data.posts.length} ${data.posts.length === 1 ? 'article' : 'articles'} tagged ${data.tag}.`} visual="search" breadcrumb={crumbs} />
      <section className="section">
        <div className="container">
          <BlogListing posts={data.posts} basePath={`/blog/tag/${slug}`} page={typeof sp.page === 'string' ? sp.page : undefined} />
        </div>
      </section>
    </>
  );
}
