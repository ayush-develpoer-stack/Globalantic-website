'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { ApiError, api, errorMessage, type AdminNotification } from '@globalantic/api-client';
import { Spinner, useToast } from '@globalantic/ui';
import n from './notifications.module.css';

export const CATEGORY_LABEL: Record<string, string> = {
  lead: 'Lead',
  training: 'Training',
  admission: 'Admission',
  program: 'Program',
  payment: 'Payment',
  content: 'Content',
  hr: 'HR',
  system: 'System',
  general: 'General',
};
export const SEVERITY_LABEL: Record<string, string> = { info: 'Info', important: 'Important', critical: 'Critical' };

/** Cross-component sync: the bell and the full page keep each other's read state and lists fresh. */
export const NOTIFICATIONS_CHANGED = 'gl:notifications-changed';
export const NOTIFICATION_RECEIVED = 'gl:notification-received';
export const announceChange = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Opens a notification's target: admin-relative paths in-app, absolute links (main-site admin) in this tab. */
export function useOpenNotification() {
  const router = useRouter();
  return useCallback(
    (link: string | null) => {
      if (!link) return;
      if (/^https?:\/\//.test(link)) window.location.assign(link);
      else if (link.startsWith('/') && !link.startsWith('//')) router.push(link);
    },
    [router],
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  return <span className={[n.dot, n[`dot_${severity}`] ?? ''].join(' ')} aria-hidden />;
}

type Mode = 'connecting' | 'live' | 'polling';
const PANEL_SIZE = 10;
const POLL_MS = 30_000;
const MAX_STREAM_FAILURES = 3;
const LIVE_RETRY_MS = 5 * 60_000;

/**
 * Header bell: unread count + latest notifications. Live via Server-Sent Events (the session
 * cookie authenticates the stream); after repeated stream failures it polls the unread count
 * every 30 s and retries the live stream every 5 minutes, resuming from the last event seen.
 */
export function NotificationBell() {
  const toast = useToast();
  const open = useOpenNotification();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('connecting');
  const [, setTick] = useState(0); // re-render relative times while open
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastEventId = useRef<string | null>(null);
  const stopped = useRef(false);
  const seen = useRef(new Set<string>());
  const unreadRef = useRef(0);
  useEffect(() => {
    unreadRef.current = unread;
  }, [unread]);

  const load = useCallback(async () => {
    try {
      const page = await api().notifications.list({ pageSize: PANEL_SIZE });
      for (const x of page.items) seen.current.add(x.id);
      setItems(page.items);
      setUnread(page.unread);
      if (page.items[0] && !lastEventId.current) lastEventId.current = page.items[0].id;
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
      if (err instanceof ApiError && err.status === 401) stopped.current = true; // signed out
    }
  }, []);

  // Live stream with bounded fallback.
  useEffect(() => {
    stopped.current = false;
    let es: EventSource | null = null;
    let failures = 0;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const startPolling = () => {
      setMode('polling');
      // Try the live stream again later (one pending retry at a time).
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, LIVE_RETRY_MS);
      if (pollTimer) return;
      pollTimer = setInterval(async () => {
        if (stopped.current || document.hidden) return;
        try {
          const { unread: count } = await api().notifications.unreadCount();
          if (count !== unreadRef.current) await load();
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) stopped.current = true;
        }
      }, POLL_MS);
    };

    function connect() {
      if (stopped.current) return;
      const url = api().notifications.streamUrl();
      if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !url) {
        startPolling();
        return;
      }
      const full = lastEventId.current ? `${url}?lastEventId=${encodeURIComponent(lastEventId.current)}` : url;
      es = new EventSource(full, { withCredentials: true });
      es.addEventListener('ready', (e) => {
        failures = 0;
        setMode('live');
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = undefined;
        }
        try {
          setUnread(JSON.parse((e as MessageEvent).data).unread);
        } catch {
          /* ignore malformed frame */
        }
      });
      es.addEventListener('notification', (e) => {
        const msg = e as MessageEvent;
        let item: AdminNotification;
        try {
          item = JSON.parse(msg.data);
        } catch {
          return;
        }
        lastEventId.current = msg.lastEventId || item.id;
        // Replayed events (reconnect recovery) may already be in the list: count each id once.
        if (seen.current.has(item.id)) return;
        seen.current.add(item.id);
        setItems((cur) => [item, ...(cur ?? [])].slice(0, PANEL_SIZE));
        if (!item.readAt) setUnread((u) => u + 1);
        window.dispatchEvent(new CustomEvent(NOTIFICATION_RECEIVED, { detail: item }));
        if (item.severity !== 'info') toast(item.title, item.severity === 'critical' ? 'danger' : 'info');
      });
      es.onerror = () => {
        // EventSource reconnects by itself (honouring the server's retry and Last-Event-ID);
        // after repeated failures, or a permanent close (e.g. 401/403), fall back to polling.
        failures += 1;
        if (failures >= MAX_STREAM_FAILURES || es?.readyState === EventSource.CLOSED) {
          es?.close();
          es = null;
          startPolling();
        }
      };
    }

    void load().then(connect);
    const refresh = () => void load();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      stopped.current = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [load, toast]);

  // Panel behaviour: outside click / Escape close; focus moves into the panel and back.
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        buttonRef.current?.focus();
      }
    };
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      clearInterval(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  const markRead = async (ids: string[] | 'all') => {
    try {
      await api().notifications.markRead(ids);
      const now = new Date().toISOString();
      setItems((cur) => cur?.map((x) => (ids === 'all' || ids.includes(x.id) ? { ...x, readAt: x.readAt ?? now } : x)) ?? cur);
      if (ids === 'all') setUnread(0);
      else setUnread((u) => Math.max(0, u - ids.length));
      announceChange();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  };

  const choose = async (item: AdminNotification) => {
    if (!item.readAt) await markRead([item.id]);
    setPanelOpen(false);
    open(item.link);
  };

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <div className={n.bellWrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={n.bellBtn}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        onClick={() => {
          setPanelOpen((o) => !o);
          if (!panelOpen) void load();
        }}
      >
        <Bell size={19} aria-hidden />
        {unread > 0 && <span className={n.badge} aria-hidden>{unread > 99 ? '99+' : unread}</span>}
      </button>
      {panelOpen && (
        <div ref={panelRef} className={n.panel} role="dialog" aria-label="Notifications">
          <div className={n.panelHead}>
            <p className={n.panelTitle}>Notifications{unread ? ` · ${unread} unread` : ''}</p>
            <button type="button" className={n.linkBtn} disabled={!unread} onClick={() => void markRead('all')}>
              Mark all as read
            </button>
          </div>
          {mode === 'polling' && <p className={n.hint}>Live updates paused — refreshing every 30s.</p>}
          <div className={n.panelBody}>
            {items === null && !loadError && <div className={n.empty}><Spinner label="Loading notifications" /></div>}
            {loadError && items === null && (
              <div className={n.empty}>
                <p style={{ margin: '0 0 8px' }}>Could not load notifications: {loadError}</p>
                <button type="button" className={n.linkBtn} onClick={() => void load()}>Try again</button>
              </div>
            )}
            {items && items.length === 0 && <p className={n.empty}>You are all caught up. New leads, payments and requests appear here.</p>}
            {items && items.length > 0 && (
              <ul className={n.list}>
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={[n.item, item.readAt ? n.read : n.unread].join(' ')} onClick={() => void choose(item)}>
                      <SeverityDot severity={item.severity} />
                      <span>
                        <span className={n.title}>{item.title}</span>
                        {item.body && <span className={n.body}>{item.body}</span>}
                        <span className={n.meta}>
                          <span>{CATEGORY_LABEL[item.category] ?? item.category}</span>
                          <span aria-hidden>·</span>
                          <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
                          {!item.readAt && <span className="sr-only">(unread)</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={n.panelFoot}>
            <Link href="/notifications" className={n.linkBtn} onClick={() => setPanelOpen(false)}>
              View all notifications
            </Link>
            <span className={n.meta} style={{ marginTop: 0 }}>{mode === 'live' ? 'Live' : mode === 'polling' ? 'Polling' : 'Connecting…'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
