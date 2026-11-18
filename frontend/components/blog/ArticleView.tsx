import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Linkedin, MessageCircle, Twitter } from 'lucide-react';
import { imageProps } from '@/lib/images';
import { siteConfig } from '@/lib/config';
import { tagSlug } from '@/lib/blog';
import { readingMinutes } from '@/lib/markdown';
import { Badge } from '@/components/ui/Badge';
import { ArticleContent, extractHeadings } from './ArticleContent';
import { TableOfContents } from './TableOfContents';
import { BlogCard } from './BlogCard';
import { CopyLinkButton } from './CopyLinkButton';
import type { BlogPost, Service } from '@/types';
import styles from './ArticleView.module.css';

export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Updated" is shown only for a real edit at least a day after publication. */
function updatedLabel(post: BlogPost): string | null {
  if (!post.publishedAt || !post.updatedAt) return null;
  const gap = new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime();
  return gap > 86_400_000 ? formatDate(post.updatedAt) : null;
}

interface ArticleViewProps {
  post: BlogPost;
  related?: BlogPost[];
  relatedServices?: Service[];
  /** Draft preview: a banner, no share links, no related content. */
  preview?: boolean;
}

/** The article layout shared by /blog/[slug] and the admin draft preview. */
export function ArticleView({ post, related = [], relatedServices = [], preview = false }: ArticleViewProps) {
  const founderAuthored = post.author?.trim().toLowerCase() === siteConfig.founder.name.toLowerCase();
  const headings = extractHeadings(post.content);
  const published = formatDate(post.publishedAt);
  const updated = updatedLabel(post);
  const minutes = post.readingTime > 0 ? post.readingTime : readingMinutes(post.content);
  const path = `/blog/${post.slug}`;
  const shareUrl = `${siteConfig.url}${path}`;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(post.title);
  const shareLinks = [
    { label: 'Share on X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, Icon: Twitter },
    { label: 'Share on LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, Icon: Linkedin },
    { label: 'Share on WhatsApp', href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, Icon: MessageCircle },
  ];

  return (
    <article>
      {preview && (
        <div className={styles.previewBanner} role="status">
          <strong>Draft preview — not published.</strong> Only signed-in staff can see this page; it is not indexed.
        </div>
      )}
      <header className={styles.hero}>
        <div className="container">
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden>/</span>
            <Link href="/blog">Blog</Link>
            {post.category?.slug && (
              <>
                <span aria-hidden>/</span>
                <Link href={`/blog/category/${post.category.slug}`}>{post.category.name}</Link>
              </>
            )}
            <span aria-hidden>/</span>
            <span className={styles.current}>{post.title}</span>
          </nav>

          {post.category?.name && <Badge variant="primary">{post.category.name}</Badge>}
          <h1 className={styles.title}>{post.title}</h1>

          <div className={styles.meta}>
            {post.author && (
              <span>
                By {founderAuthored ? <Link href="/about#founder">{post.author}</Link> : post.author}
                {founderAuthored ? `, ${siteConfig.founder.title}` : ''}
              </span>
            )}
            <span>{minutes} min read</span>
            {published && (
              <span>
                Published <time dateTime={post.publishedAt}>{published}</time>
              </span>
            )}
            {updated && (
              <span>
                Updated <time dateTime={post.updatedAt}>{updated}</time>
              </span>
            )}
          </div>
        </div>
      </header>

      {post.coverImage && (
        <div className="container">
          <div className={styles.cover}>
            <Image
              {...imageProps(post.coverImage)}
              alt={post.coverImageAlt?.trim() || ''}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className={styles.coverImage}
              priority
            />
          </div>
        </div>
      )}

      <div className="container">
        <div className={styles.layout}>
          <div className={styles.main}>
            <ArticleContent markdown={post.content} />

            {post.tags?.length > 0 && (
              <ul className={styles.tags} aria-label="Tags">
                {post.tags.map((tag) =>
                  tagSlug(tag) ? (
                    <li key={tag}>
                      <Link href={`/blog/tag/${tagSlug(tag)}`} className={styles.tag}>
                        #{tag}
                      </Link>
                    </li>
                  ) : null
                )}
              </ul>
            )}

            {relatedServices.length > 0 && (
              <aside className={styles.services} aria-labelledby="related-services">
                <h2 id="related-services" className={styles.servicesTitle}>
                  Related services
                </h2>
                <ul>
                  {relatedServices.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/services/${s.slug}`}>{s.title}</Link> — {s.shortDesc}
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {!preview && (
              <div className={styles.share}>
                <span className={styles.shareLabel}>Share</span>
                <div className={styles.shareLinks}>
                  {shareLinks.map(({ label, href, Icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={styles.shareLink} aria-label={`${label} (opens in a new tab)`}>
                      <Icon size={18} aria-hidden />
                    </a>
                  ))}
                  <CopyLinkButton url={shareUrl} className={styles.shareLink} />
                </div>
              </div>
            )}

            <Link href="/blog" className={styles.back}>
              <ArrowLeft size={16} aria-hidden /> Back to the blog
            </Link>
          </div>

          {headings.length > 0 && (
            <aside className={styles.aside}>
              <TableOfContents headings={headings} />
            </aside>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className={styles.related}>
          <div className="container">
            <h2 className={styles.relatedTitle}>Related posts</h2>
            <div className={styles.relatedGrid}>
              {related.map((item) => (
                <BlogCard key={item.slug} post={item} />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
