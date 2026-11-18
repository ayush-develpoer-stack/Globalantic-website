import { EmptyState, formatDateTime } from '@globalantic/ui';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Human-readable "application.approved" -> "Application approved". */
export function actionLabel(action: string): string {
  const t = action.replace(/[._]/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function JsonDiff({ before, after }: { before?: unknown; after?: unknown }) {
  if (before == null && after == null) return null;
  return (
    <details className={s.details}>
      <summary>Show change details</summary>
      {before != null && (<><p className={s.small}>Before</p><pre className={s.json}>{JSON.stringify(before, null, 2)}</pre></>)}
      {after != null && (<><p className={s.small}>After</p><pre className={s.json}>{JSON.stringify(after, null, 2)}</pre></>)}
    </details>
  );
}

export function AuditHistory({ entries }: { entries: Row[] }) {
  if (!entries?.length) return <EmptyState title="No history yet" />;
  return (
    <ol className={s.history} aria-label="History">
      {entries.map((h) => (
        <li key={h.id} className={s.historyItem}>
          <span className={s.strong}>{actionLabel(h.action)}</span>
          <span className={s.small}>
            {formatDateTime(h.createdAt)} · {h.actor ? `${h.actor.name} (${String(h.actor.role ?? h.actorRole ?? '').toLowerCase()})` : h.actorRole === 'SYSTEM' || !h.actorRole ? 'System' : h.actorRole}
          </span>
          {h.reason && <span className={s.muted}>Reason: {h.reason}</span>}
          <JsonDiff before={h.before} after={h.after} />
        </li>
      ))}
    </ol>
  );
}
