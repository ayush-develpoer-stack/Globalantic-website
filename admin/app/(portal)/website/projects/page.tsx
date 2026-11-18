'use client';

import Link from 'next/link';
import { Badge, formatDate } from '@globalantic/ui';
import { CmsList } from '@/lib/CmsList';
import { StateBadge } from '@/lib/cms';
import s from '@/lib/admin.module.css';

export default function ProjectsListPage() {
  return (
    <CmsList
      kind="portfolio"
      title="Projects & portfolio"
      description="Real projects shown on the portfolio and on related service pages. Client names and outcomes appear only when the client approved them."
      basePath="/website/projects"
      newLabel="New project"
      emptyText="Add a project you are allowed to show; it stays a draft until you publish it."
      columns={[
        { key: 't', header: 'Project', render: (r) => (<><Link href={`/website/projects/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>/portfolio/{r.slug}</div></>) },
        { key: 'st', header: 'Status', render: (r) => (<><StateBadge row={r} />{r.featured && <> <Badge tone="primary">Featured</Badge></>}</>) },
        { key: 'c', header: 'Category', hideOnMobile: true, render: (r) => r.category || '—' },
        { key: 'p', header: 'Publication date', hideOnMobile: true, render: (r) => (r.publishedAt ? formatDate(r.publishedAt) : '—') },
        { key: 'u', header: 'Updated', hideOnMobile: true, render: (r) => formatDate(r.updatedAt) },
      ]}
    />
  );
}
