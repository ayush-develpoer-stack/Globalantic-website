'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<ToastTone, number> = { success: 4000, info: 4000, error: 7000 };
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONE_LABEL: Record<ToastTone, string> = { success: 'Success', error: 'Error', info: 'Notice' };

/**
 * Toast notifications. Messages are announced through live regions (polite
 * for success/info, assertive for errors), carry an icon AND a text label so
 * status is never conveyed by colour alone, and can be dismissed.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = nextId.current++;
    // Keep at most 4 on screen.
    setToasts((list) => [...list.slice(-3), { id, tone, title, description }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  const polite = toasts.filter((t) => t.tone !== 'error');
  const assertive = toasts.filter((t) => t.tone === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport}>
        <div role="status" aria-live="polite" className={styles.stack}>
          {polite.map((t) => (
            <Toast key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className={styles.stack}>
          {assertive.map((t) => (
            <Toast key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = ICONS[toast.tone];
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.tone]);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.tone, onDismiss]);

  return (
    <div
      className={[styles.toast, styles[toast.tone]].join(' ')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={20} className={styles.icon} aria-hidden />
      <div className={styles.text}>
        <p className={styles.title}>
          <span className="sr-only">{TONE_LABEL[toast.tone]}: </span>
          {toast.title}
        </p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
      </div>
      <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
