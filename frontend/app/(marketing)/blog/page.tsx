import type { Metadata } from 'next';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { listingSeo, loadPublicBlog } from '@/lib/blog-data';
import { PageHero } from '@/components/layout/PageContainer';
import { BlogListing } from '@/components/blog/BlogListing';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const sp = await props.searchParams;
  const { path, noindex } = listingSeo('/blog', str(sp.q), str(sp.page));
  return buildMetadata({
    title: 'Blog — Guides on Web, Software, AI & Digital Growth',
    description: 'Insights, guides and notes on building websites, software, apps and AI solutions.',
    path,
    noindex,
  });
}

export default async function BlogPage(props: PageProps) {
  const sp = await props.searchParams;
  const { posts, categories } = await loadPublicBlog();

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />

      <PageHero
        eyebrow="Insights"
        title="Blog"
        description="Practical thinking on building and running digital products."
        visual="search"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }]}
      />

      <section className="section">
        <div className="container">
          <BlogListing posts={posts} basePath="/blog" query={str(sp.q)} page={str(sp.page)} categories={categories} featured />
        </div>
      </section>
    </>
  );
}
