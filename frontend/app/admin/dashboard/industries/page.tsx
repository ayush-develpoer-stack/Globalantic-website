'use client';

import { Suspense } from 'react';
import { CmsManager, type FieldDef, type ListColumn } from '@/components/admin/CmsManager';

const fields: FieldDef[] = [
  { name: 'slug', label: 'Slug', type: 'slug', required: true, help: 'URL segment, e.g. healthcare' },
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'tagline', label: 'Tagline', type: 'text' },
  { name: 'icon', label: 'Icon', type: 'text', help: 'Lucide icon name' },
  { name: 'shortDesc', label: 'Short Description', type: 'textarea', required: true },
  { name: 'overview', label: 'Overview', type: 'textarea', required: true },
  { name: 'challenges', label: 'Challenges', type: 'stringList', help: 'One per line' },
  { name: 'solutions', label: 'Solutions', type: 'stringList', help: 'One per line' },
  { name: 'relevantServices', label: 'Relevant Services', type: 'stringList', help: 'One per line' },
  { name: 'features', label: 'Features', type: 'stringList', help: 'One per line' },
  { name: 'technologies', label: 'Technologies', type: 'stringList', help: 'One per line' },
  { name: 'useCases', label: 'Use Cases', type: 'stringList', help: 'One per line' },
  {
    name: 'faqs',
    label: 'FAQs',
    type: 'json',
    help: 'JSON array of { "question": "...", "answer": "..." }',
  },
  { name: 'seoTitle', label: 'SEO Title', type: 'text' },
  { name: 'seoDescription', label: 'SEO Description', type: 'textarea' },
  { name: 'ogImage', label: 'Social share image', type: 'image', help: 'Shown when the page is shared (Open Graph). Paste a URL or upload.' },
  { name: 'order', label: 'Order', type: 'number' },
  { name: 'published', label: 'Published', type: 'boolean' },
];

const listColumns: ListColumn[] = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'slug', label: 'Slug', sortable: true },
  { key: 'order', label: 'Order', sortable: true },
  { key: 'published', label: 'Published' },
  { key: 'updatedAt', label: 'Updated', sortable: true },
];

export default function IndustriesAdminPage() {
  return (
    <Suspense>
      <CmsManager
        resource="industries"
        title="Industries"
        singular="industry"
        description="Industry pages shown under /industries on the website."
        fields={fields}
        listColumns={listColumns}
      />
    </Suspense>
  );
}
