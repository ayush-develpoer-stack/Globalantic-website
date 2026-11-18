import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { listingSeo, loadPublicBlog } from '@/lib/blog-data';
import { postsInCategory } from '@/lib/blog';
import { PageHero } from '@/components/layout/PageContainer';
import { BlogListing } from '@/components/blog/BlogListing';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A category page exists only while it has published posts (otherwise 404). */
async function load(slug: string) {
  const { posts, categories } = await loadPublicBlog();
  const category = categories.find((c) => c.slug === slug);
  return category ? { category, categories, posts: postsInCategory(posts, slug) } : null;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const data = await load(slug);
  if (!data) return buildMetadata({ title: 'Category not found', path: `/blog/category/${slug}`, noindex: true });
  const { path, noindex } = listingSeo(`/blog/category/${slug}`, str(sp.q), str(sp.page));
  return buildMetadata({
    title: `${data.category.name} articles — Globalantic Blog`,
    description: `Articles from Globalantic about ${data.category.name.toLowerCase()}: practical guides for businesses planning websites, software and digital growth.`,
    path,
    noindex,
  });
}

export default async function BlogCategoryPage(props: PageProps) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const data = await load(slug);
  if (!data) notFound();
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: data.category.name, path: `/blog/category/${slug}` },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(crumbs)) }} />
      <PageHero eyebrow="Blog category" title={data.category.name} description={`Articles about ${data.category.name.toLowerCase()}.`} visual="search" breadcrumb={crumbs} />
      <section className="section">
        <div className="container">
          <BlogListing posts={data.posts} basePath={`/blog/category/${slug}`} query={str(sp.q)} page={str(sp.page)} categories={data.categories} activeCategory={slug} />
        </div>
      </section>
    </>
  );
}
