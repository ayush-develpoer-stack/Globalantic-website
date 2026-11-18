import Link from 'next/link';
import Image from 'next/image';
import { imageProps } from '@/lib/images';
import { Badge } from '@/components/ui/Badge';
import type { BlogPost } from '@/types';
import styles from './BlogCard.module.css';

interface BlogCardProps {
  post: BlogPost;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Grid card for a single blog post, linking to the article. */
export function BlogCard({ post }: BlogCardProps) {
  const cover = post.coverImage;
  const initial = post.title?.charAt(0).toUpperCase() ?? '•';
  const published = formatDate(post.publishedAt);

  return (
    <Link href={`/blog/${post.slug}`} className={styles.card}>
      <div className={styles.media}>
        {cover ? (
          <Image
            {...imageProps(cover)}
            alt={post.coverImageAlt?.trim() || ""}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={styles.image}
          />
        ) : (
          <span className={styles.placeholder} aria-hidden>
            {initial}
          </span>
        )}
      </div>

      <div className={styles.body}>
        {post.category?.name && <Badge variant="soft">{post.category.name}</Badge>}
        <h3 className={styles.title}>{post.title}</h3>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}

        <div className={styles.meta}>
          {post.author && <span>{post.author}</span>}
          {post.readingTime > 0 && <span>{post.readingTime} min read</span>}
          {published && <span>{published}</span>}
        </div>
      </div>
    </Link>
  );
}
