'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, type AdminNotification } from '@globalantic/api-client';
import { AsyncView, Button, Checkbox, PageHeader, Pagination, Select, Toolbar, buttonClass, formatDateTime, useAsync, useSession, useToast } from '@globalantic/ui';
import { CATEGORY_LABEL, NOTIFICATIONS_CHANGED, NOTIFICATION_RECEIVED, SEVERITY_LABEL, SeverityDot, announceChange, relativeTime, useOpenNotification } from '@/lib/notifications';
import n from '@/lib/notifications.module.css';
import s from '@/lib/admin.module.css';

const CATEGORIES = ['lead', 'training', 'admission', 'program', 'payment', 'content', 'hr', 'system'];
const SEVERITIES = ['critical', 'important', 'info'];

export default function NotificationsPage() {
  const { can } = useSession();
  const toast = useToast();
  const open = useOpenNotification();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const q = { page, pageSize: 20, ...(category ? { category } : {}), ...(severity ? { severity } : {}), ...(unreadOnly ? { unread: 'true' as const } : {}) };
  const state = useAsync(() => api().notifications.list(q), `notifications-${JSON.stringify(q)}`);

  // Keep in sync with the header bell: new live events and read changes made there.
  useEffect(() => {
    const refresh = () => state.reload();
    window.addEventListener(NOTIFICATION_RECEIVED, refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      window.removeEventListener(NOTIFICATION_RECEIVED, refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reload]);

  const markRead = async (ids: string[] | 'all') => {
    setBusy(ids === 'all' ? 'all' : ids[0]);
    try {
      const r = await api().notifications.markRead(ids);
      if (ids === 'all') toast(r.updated ? `Marked ${r.updated} as read` : 'Nothing unread', 'success');
      announceChange(); // updates the bell (and reloads this list through the listener)
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const choose = async (item: AdminNotification) => {
    if (!item.readAt) await markRead([item.id]);
    open(item.link);
  };

  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Important events across the platform: new leads and applications, verified payments, HR requests, published content and system alerts. You only see events your role is allowed to handle."
        actions={
          <div className={s.actions}>
            {can('notifications.settings') && <Link href="/notifications/settings" className={buttonClass('outline', 'sm')}>Settings</Link>}
            <Button size="sm" onClick={() => void markRead('all')} loading={busy === 'all'} disabled={!state.data?.unread}>Mark all as read</Button>
          </div>
        }
      />
      <Toolbar>
        <Select label="Category" value={category} placeholder="All categories" options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} onChange={(e) => filter(() => setCategory(e.target.value))} />
        <Select label="Severity" value={severity} placeholder="Any severity" options={SEVERITIES.map((v) => ({ value: v, label: SEVERITY_LABEL[v] }))} onChange={(e) => filter(() => setSeverity(e.target.value))} />
        <div className={s.filterCheck}>
          <Checkbox label="Unread only" checked={unreadOnly} onChange={(e) => filter(() => setUnreadOnly(e.target.checked))} />
        </div>
      </Toolbar>
      <AsyncView
        state={state}
        isEmpty={(d) => d.items.length === 0}
        empty={{
          title: category || severity || unreadOnly ? 'No notifications match these filters' : 'No notifications yet',
          description: category || severity || unreadOnly ? 'Clear a filter to see more.' : 'New leads, payments, applications and requests will appear here as they happen.',
        }}
      >
        {(d) => (
          <div className={s.stackSm}>
            <p className={s.small}>{d.total} notification{d.total === 1 ? '' : 's'} · {d.unread} unread</p>
            <ul className={s.list} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {d.items.map((item) => (
                <li key={item.id} className={[n.pageItem, item.readAt ? n.read : n.unread].join(' ')}>
                  <SeverityDot severity={item.severity} />
                  <div>
                    <span className={n.title}>{item.title}</span>
                    {item.body && <span className={n.body}>{item.body}</span>}
                    <span className={n.meta}>
                      <span>{CATEGORY_LABEL[item.category] ?? item.category}</span>
                      <span aria-hidden>·</span>
                      <span>{SEVERITY_LABEL[item.severity] ?? item.severity}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>{relativeTime(item.createdAt)}</time>
                      {!item.readAt && <span>· Unread</span>}
                    </span>
                  </div>
                  <div className={n.pageActions}>
                    {item.link && <Button size="sm" variant="outline" onClick={() => void choose(item)}>Open</Button>}
                    {!item.readAt && <Button size="sm" variant="ghost" loading={busy === item.id} onClick={() => void markRead([item.id])}>Mark read</Button>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </div>
        )}
      </AsyncView>
    </>
  );
}
