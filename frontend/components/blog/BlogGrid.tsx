import type { BlogPost } from '@/types';
import { BlogCard } from './BlogCard';
import styles from './BlogGrid.module.css';

interface BlogGridProps {
  posts: BlogPost[];
}

/** Responsive grid of blog cards. */
export function BlogGrid({ posts }: BlogGridProps) {
  return (
    <div className={styles.grid}>
      {posts.map((post) => (
        <BlogCard key={post.slug} post={post} />
      ))}
    </div>
  );
}
