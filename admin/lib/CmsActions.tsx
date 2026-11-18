'use client';

import { useRouter } from 'next/navigation';
import { api } from '@globalantic/api-client';
import { Button, buttonClass } from '@globalantic/ui';
import { publicState } from './cms';
import { useConfirm, useRun } from './admin';
import s from './admin.module.css';

type Row = Record<string, any>;

/**
 * Lifecycle buttons for a saved blog post / project. Archived items must be restored (as a
 * draft) before they can be published again — the API enforces the same rule.
 * `beforePublish` saves pending form changes first.
 */
export function CmsActions({ kind, row, listPath, sitePath, onChanged, beforePublish, dirty }: { kind: 'blog' | 'portfolio'; row: Row; listPath: string; sitePath: string; onChanged: () => void; beforePublish: () => Promise<boolean>; dirty: boolean }) {
  const router = useRouter();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const st = publicState(row);
  const siteUrl = `${api().cms.siteUrl()}${sitePath}/${row.slug}`;

  const publish = async () => {
    if (!(await beforePublish())) return;
    if (await run(() => api().cms.publish(kind, row.id), row.publishedAt && new Date(row.publishedAt).getTime() > Date.now() ? 'Scheduled' : 'Published')) onChanged();
  };

  return (
    <div className={s.actions}>
      {st === 'archived' ? (
        <Button size="sm" variant="outline" onClick={async () => (await run(() => api().cms.restore(kind, row.id), 'Restored as a draft')) && onChanged()}>Restore</Button>
      ) : row.published ? (
        <Button size="sm" variant="outline" onClick={async () => (await run(() => api().cms.unpublish(kind, row.id), 'Unpublished')) && onChanged()}>Unpublish</Button>
      ) : (
        <Button size="sm" onClick={publish}>{dirty ? 'Save & publish' : 'Publish'}</Button>
      )}
      {st !== 'archived' && (
        <Button size="sm" variant="ghost" onClick={() => ask({ title: 'Archive this item?', message: 'It is removed from the public website and kept in the archive. You can restore it later.', confirmLabel: 'Archive', onConfirm: async () => { await api().cms.archive(kind, row.id); onChanged(); }, success: 'Archived' })}>
          Archive
        </Button>
      )}
      {st === 'published' && (
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>
          View on site<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <Button size="sm" variant="danger" onClick={() => ask({ title: 'Delete permanently?', message: 'This cannot be undone. Archive instead if you may need it again.', confirmLabel: 'Delete', tone: 'danger', onConfirm: async () => { await api().cms.remove(kind, row.id); router.push(listPath); }, success: 'Deleted' })}>
        Delete
      </Button>
      {dialog}
    </div>
  );
}
