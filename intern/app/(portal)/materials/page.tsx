'use client';

import { Download, ExternalLink, FileText, Link2, PlayCircle } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, PageHeader, formatDate, useAsync } from '@globalantic/ui';
import { enumLabel } from '@globalantic/types';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

const ICONS = { LINK: Link2, DOCUMENT: FileText, VIDEO: PlayCircle } as const;

export default function MaterialsPage() {
  usePageTitle('Learning materials');
  const state = useAsync(() => api().student.materials(), 'materials');
  return (
    <div className={s.stack}>
      <PageHeader title="Learning materials" description="Notes, slides, videos and links shared by your trainers." />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No materials yet', description: 'Your trainers have not shared any materials yet.' }}>
        {(items) => (
          <ul className={s.grid3}>
            {items.map((m) => {
              const Icon = ICONS[m.type] ?? Link2;
              return (
                <li key={m.id} className={s.item}>
                  <div className={s.between}>
                    <span className={s.row}>
                      <Icon size={18} aria-hidden />
                      <span className={s.title}>{m.title}</span>
                    </span>
                    <Badge>{enumLabel(m.type)}</Badge>
                  </div>
                  {m.description && <p className={s.body}>{m.description}</p>}
                  {m.batch && (
                    <span className={s.small}>
                      {m.batch.course.title} · {m.batch.name}
                    </span>
                  )}
                  <span className={s.small}>Shared {formatDate(m.createdAt)}</span>
                  {m.file ? (
                    <a href={api().files.url(m.file.id)} download={m.file.name} className={s.link}>
                      Download {m.file.name} ({Math.max(1, Math.round(m.file.sizeBytes / 1024))} KB) <Download size={14} aria-hidden style={{ display: 'inline' }} />
                    </a>
                  ) : m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className={s.link}>
                      Open <ExternalLink size={14} aria-hidden style={{ display: 'inline' }} />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AsyncView>
    </div>
  );
}
