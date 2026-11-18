import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBlogPost, getBlogPosts, getServices } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, articleSchema } from '@/lib/seo';
import { absoluteImage } from '@/lib/images';
import { isPublicPost, relatedPosts } from '@/lib/blog';
import { ArticleView } from '@/components/blog/ArticleView';
import { CTASection } from '@/components/sections/CTASection';
import type { BlogPost, Service } from '@/types';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** A post the public may see (the API only serves published posts; scheduled ones stay hidden). */
async function loadPost(slug: string): Promise<BlogPost | null> {
  const post = await getBlogPost(slug);
  return post && isPublicPost(post) ? post : null;
}

export async function generateStaticParams() {
  const posts = (await getBlogPosts()) ?? [];
  return posts.filter((p) => isPublicPost(p)).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const post = await loadPost(params.slug);
  if (!post) {
    return buildMetadata({ title: 'Article not found', path: `/blog/${params.slug}`, noindex: true });
  }
  return buildMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    path: post.canonicalUrl ?? `/blog/${post.slug}`,
    image: absoluteImage(post.ogImage) ?? absoluteImage(post.coverImage),
    article: { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, authors: post.author ? [post.author] : undefined, tags: post.tags },
  });
}

const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Services the post is about, matched from its tags (tag = service slug or title). Internal links, not ads. */
function getRelatedServices(services: Service[], post: BlogPost): Service[] {
  const tags = new Set((post.tags ?? []).map(slugify));
  return services.filter((s) => tags.has(s.slug) || tags.has(slugify(s.title))).slice(0, 4);
}

export default async function BlogPostPage(props: PageProps) {
  const params = await props.params;
  const post = await loadPost(params.slug);
  if (!post) notFound();

  const [allPosts, services] = await Promise.all([getBlogPosts(), getServices()]);
  const related = relatedPosts((allPosts ?? []).filter((p) => isPublicPost(p)), post);
  const relatedServices = getRelatedServices(services ?? [], post);
  const path = `/blog/${post.slug}`;

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    ...(post.category?.slug ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }] : []),
    { name: post.title, path },
  ]);

  // Dates come from the database (publishedAt / updatedAt); the image only when a real one exists.
  const article = articleSchema({
    title: post.title,
    description: post.seoDescription ?? post.excerpt,
    path,
    publishedAt: post.publishedAt,
    author: post.author,
    image: absoluteImage(post.ogImage) ?? absoluteImage(post.coverImage),
    updatedAt: post.updatedAt,
    tags: post.tags,
    section: post.category?.name,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <ArticleView post={post} related={related} relatedServices={relatedServices} />
      <CTASection label="blog_post" />
    </>
  );
}
