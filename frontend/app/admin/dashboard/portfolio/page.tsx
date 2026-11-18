'use client';

import { Suspense } from 'react';
import { CmsManager, type FieldDef, type ListColumn } from '@/components/admin/CmsManager';

const fields: FieldDef[] = [
  { name: 'slug', label: 'Slug', type: 'slug', required: true, help: 'URL segment' },
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'shortDescription', label: 'Short Description', type: 'textarea', required: true },
  { name: 'description', label: 'Description', type: 'textarea', required: true },
  { name: 'category', label: 'Category', type: 'text', required: true },
  { name: 'industry', label: 'Industry', type: 'text' },
  { name: 'client', label: 'Client', type: 'text' },
  { name: 'challenge', label: 'Challenge', type: 'textarea' },
  { name: 'requirement', label: 'Requirement', type: 'textarea' },
  { name: 'approach', label: 'Approach', type: 'textarea' },
  { name: 'solution', label: 'Solution', type: 'textarea' },
  { name: 'features', label: 'Features', type: 'stringList', help: 'One per line' },
  { name: 'technologies', label: 'Technologies', type: 'stringList', help: 'One per line' },
  { name: 'images', label: 'Images', type: 'stringList', help: 'One image URL per line' },
  { name: 'gallery', label: 'Gallery', type: 'stringList', help: 'One image URL per line' },
  { name: 'outcome', label: 'Outcome', type: 'textarea' },
  { name: 'seoTitle', label: 'SEO Title', type: 'text' },
  { name: 'seoDescription', label: 'SEO Description', type: 'textarea' },
  { name: 'ogImage', label: 'Social share image', type: 'image', help: 'Shown when the page is shared (Open Graph). Paste a URL or upload.' },
  { name: 'order', label: 'Order', type: 'number' },
  { name: 'featured', label: 'Featured', type: 'boolean' },
  { name: 'published', label: 'Published', type: 'boolean' },
];

const listColumns: ListColumn[] = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'slug', label: 'Slug', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'featured', label: 'Featured' },
  { key: 'published', label: 'Published' },
  { key: 'updatedAt', label: 'Updated', sortable: true },
];

export default function PortfolioAdminPage() {
  return (
    <Suspense>
      <CmsManager
        resource="portfolio"
        title="Portfolio"
        singular="project"
        description="Case studies shown under /portfolio. Only add real, approved projects."
        fields={fields}
        listColumns={listColumns}
      />
    </Suspense>
  );
}
