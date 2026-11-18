'use client';

import Link from 'next/link';
import { Badge, formatDate } from '@globalantic/ui';
import { CmsList } from '@/lib/CmsList';
import { HERO_LABEL } from '@/lib/cms';
import s from '@/lib/admin.module.css';

export default function ServicesListPage() {
  return (
    <CmsList
      kind="services"
      title="Service pages"
      description="Content of each service page on the public website: hero, problems, deliverables, process, technologies and FAQs."
      basePath="/website/services"
      newLabel="New service"
      statusTabs={false}
      emptyText="No services yet."
      columns={[
        { key: 't', header: 'Service', render: (r) => (<><Link href={`/website/services/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>/services/{r.slug}</div></>) },
        { key: 'st', header: 'Status', render: (r) => (r.published ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Unpublished</Badge>) },
        { key: 'h', header: 'Hero', hideOnMobile: true, render: (r) => (r.heroVariant ? HERO_LABEL[r.heroVariant] ?? r.heroVariant : 'Automatic') },
        { key: 'o', header: 'Order', hideOnMobile: true, render: (r) => r.order },
        { key: 'u', header: 'Updated', hideOnMobile: true, render: (r) => formatDate(r.updatedAt) },
      ]}
    />
  );
}
