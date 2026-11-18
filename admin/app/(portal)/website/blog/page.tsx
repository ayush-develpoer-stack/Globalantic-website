'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { Select, formatDate, useAsync } from '@globalantic/ui';
import { CmsList } from '@/lib/CmsList';
import { StateBadge } from '@/lib/cms';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function BlogListPage() {
  const [categoryId, setCategoryId] = useState('');
  const cats = useAsync(() => api().cms.categories(), 'blog-categories');
  return (
    <CmsList
      kind="blog"
      title="Blog posts"
      description="Write, schedule and publish articles for the public blog. Drafts, scheduled and archived posts are never shown publicly."
      basePath="/website/blog"
      newLabel="New post"
      emptyText="Create a post; it stays a draft until you publish it."
      extraQuery={{ categoryId: categoryId || undefined }}
      filters={<Select label="Category" value={categoryId} placeholder="All categories" options={(cats.data ?? []).map((c: Row) => ({ value: c.id, label: c.name }))} onChange={(e) => setCategoryId(e.target.value)} />}
      columns={[
        { key: 't', header: 'Title', render: (r) => (<><Link href={`/website/blog/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>/blog/{r.slug}</div></>) },
        { key: 'st', header: 'Status', render: (r) => <StateBadge row={r} /> },
        { key: 'c', header: 'Category', hideOnMobile: true, render: (r) => r.category?.name ?? '—' },
        { key: 'p', header: 'Publication date', hideOnMobile: true, render: (r) => (r.publishedAt ? formatDate(r.publishedAt) : '—') },
        { key: 'u', header: 'Updated', hideOnMobile: true, render: (r) => formatDate(r.updatedAt) },
      ]}
    />
  );
}
