import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { imageProps } from '@/lib/images';
import { listingHref, paginate, searchPosts } from '@/lib/blog';
import { readingMinutes } from '@/lib/markdown';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BlogGrid } from './BlogGrid';
import { formatDate } from './ArticleView';
import type { BlogCategory, BlogPost } from '@/types';
import styles from './BlogListing.module.css';

interface BlogListingProps {
  /** Public posts for this listing, newest first. */
  posts: BlogPost[];
  /** Listing URL ("/blog", "/blog/category/ai"): search and pagination stay on it. */
  basePath: string;
  query?: string;
  page?: string;
  /** Category chips (only categories that have posts). */
  categories?: BlogCategory[];
  activeCategory?: string;
  /** Show the newest post as a featured article (first page, no search). */
  featured?: boolean;
}

/** Server-rendered blog listing: featured article, search, category filter, pagination. */
export function BlogListing({ posts, basePath, query = '', page, categories = [], activeCategory, featured = false }: BlogListingProps) {
  const q = query.trim().slice(0, 80);
  const matching = searchPosts(posts, q);
  const showFeatured = featured && !q && (!page || page === '1') && matching.length > 1;
  const lead = showFeatured ? matching[0] : null;
  const rest = lead ? matching.slice(1) : matching;
  const paged = paginate(rest, page);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {categories.length > 0 && (
          <nav className={styles.chips} aria-label="Blog categories">
            <Link href="/blog" className={`${styles.chip} ${!activeCategory ? styles.chipActive : ''}`} aria-current={!activeCategory ? 'page' : undefined}>
              All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/blog/category/${c.slug}`}
                className={`${styles.chip} ${activeCategory === c.slug ? styles.chipActive : ''}`}
                aria-current={activeCategory === c.slug ? 'page' : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        <form action={basePath} method="get" role="search" className={styles.search}>
          <label htmlFor="blog-search" className="sr-only">
            Search articles
          </label>
          <Search size={16} className={styles.searchIcon} aria-hidden />
          <input id="blog-search" name="q" type="search" defaultValue={q} placeholder="Search articles" maxLength={80} className={styles.searchInput} />
          <button type="submit" className={styles.searchButton}>
            Search
          </button>
        </form>
      </div>

      {q && (
        <p className={styles.resultNote} aria-live="polite">
          {matching.length} {matching.length === 1 ? 'article matches' : 'articles match'} &ldquo;{q}&rdquo;.{' '}
          <Link href={basePath}>Clear search</Link>
        </p>
      )}

      {lead && <FeaturedPost post={lead} />}

      {paged.items.length > 0 ? (
        <BlogGrid posts={paged.items} />
      ) : !lead ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{q ? 'No matching articles' : 'No articles yet'}</h2>
          <p className={styles.emptyText}>
            {q ? 'Try a different word, or browse all articles.' : 'New articles will appear here once they are published.'}
          </p>
          <Button href={q ? basePath : '/get-a-quote'} variant="primary" size="lg">
            {q ? 'Show all articles' : 'Discuss Your Project'}
          </Button>
        </div>
      ) : null}

      {paged.totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Pagination">
          {paged.page > 1 ? (
            <Link href={listingHref(basePath, { q, page: paged.page - 1 })} className={styles.pageLink} rel="prev">
              <ChevronLeft size={16} aria-hidden /> Newer
            </Link>
          ) : (
            <span />
          )}
          <span className={styles.pageInfo}>
            Page {paged.page} of {paged.totalPages}
          </span>
          {paged.page < paged.totalPages ? (
            <Link href={listingHref(basePath, { q, page: paged.page + 1 })} className={styles.pageLink} rel="next">
              Older <ChevronRight size={16} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function FeaturedPost({ post }: { post: BlogPost }) {
  const published = formatDate(post.publishedAt);
  const minutes = post.readingTime > 0 ? post.readingTime : readingMinutes(post.content);
  return (
    <Link href={`/blog/${post.slug}`} className={styles.featured}>
      <div className={styles.featuredMedia}>
        {post.coverImage ? (
          <Image {...imageProps(post.coverImage)} alt={post.coverImageAlt?.trim() || ''} fill sizes="(max-width: 900px) 100vw, 55vw" className={styles.featuredImage} priority />
        ) : (
          <span className={styles.featuredPlaceholder} aria-hidden>
            {post.category?.name ?? 'Globalantic Blog'}
          </span>
        )}
      </div>
      <div className={styles.featuredBody}>
        <span className={styles.featuredEyebrow}>Latest article</span>
        {post.category?.name && <Badge variant="soft">{post.category.name}</Badge>}
        <h2 className={styles.featuredTitle}>{post.title}</h2>
        {post.excerpt && <p className={styles.featuredExcerpt}>{post.excerpt}</p>}
        <p className={styles.featuredMeta}>
          {[post.author, `${minutes} min read`, published].filter(Boolean).join(' · ')}
        </p>
        <span className={styles.featuredCta}>
          Read article <ArrowRight size={16} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
