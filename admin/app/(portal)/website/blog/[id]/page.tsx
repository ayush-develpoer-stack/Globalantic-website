'use client';

import { useParams } from 'next/navigation';
import { BlogEditor } from '@/lib/BlogEditor';

export default function EditBlogPostPage() {
  const { id } = useParams<{ id: string }>();
  return <BlogEditor key={id} id={id} />;
}
