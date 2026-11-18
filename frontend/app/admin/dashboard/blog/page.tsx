'use client';

import { Suspense } from 'react';
import { CmsManager, type FieldDef, type ListColumn } from '@/components/admin/CmsManager';

const fields: FieldDef[] = [
  { name: 'slug', label: 'Slug', type: 'slug', required: true, help: 'URL segment' },
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'excerpt', label: 'Excerpt', type: 'textarea', required: true },
  {
    name: 'content',
    label: 'Content (Markdown)',
    type: 'textarea',
    required: true,
    help: 'Full post body in Markdown',
  },
  { name: 'coverImage', label: 'Cover Image', type: 'image' },
  { name: 'author', label: 'Author', type: 'text' },
  { name: 'categoryId', label: 'Category ID', type: 'text', help: 'UUID of a blog category (optional)' },
  { name: 'tags', label: 'Tags', type: 'stringList', help: 'One tag per line' },
  { name: 'readingTime', label: 'Reading Time (min)', type: 'number' },
  { name: 'seoTitle', label: 'SEO Title', type: 'text' },
  { name: 'seoDescription', label: 'SEO Description', type: 'textarea' },
  { name: 'ogImage', label: 'Social share image', type: 'image', help: 'Shown when the page is shared (Open Graph). Paste a URL or upload.' },
  { name: 'canonicalUrl', label: 'Canonical URL', type: 'text' },
  { name: 'published', label: 'Published', type: 'boolean' },
];

const listColumns: ListColumn[] = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'slug', label: 'Slug', sortable: true },
  { key: 'author', label: 'Author', sortable: true },
  { key: 'published', label: 'Published' },
  { key: 'publishedAt', label: 'Published on', sortable: true },
];

export default function BlogAdminPage() {
  return (
    <Suspense>
      <CmsManager
        resource="blog"
        title="Blog posts"
        singular="post"
        description="Articles shown under /blog. Drafts stay hidden until published."
        fields={fields}
        listColumns={listColumns}
      />
    </Suspense>
  );
}
