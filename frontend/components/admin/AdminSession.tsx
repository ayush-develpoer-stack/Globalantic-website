'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';
import { errorMessage } from '@/lib/api/errors';
import { ErrorState } from '@/components/ui/StateView';
import type { AdminUser } from '@/types';
import styles from '@/app/admin/admin.module.css';

interface AdminSessionValue {
  user: AdminUser;
  logout: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

/**
 * Resolves the signed-in admin once for the whole dashboard (the layout
 * persists across client navigations). Unauthenticated visitors are sent to
 * the login page. This is a UX gate only — the API enforces access on every
 * request.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState('loading');
    authService
      .me()
      .then((current) => {
        if (!active) return;
        if (current) {
          setUser(current);
          setState('ready');
        } else {
          router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(errorMessage(err, 'Could not verify your session.'));
        setState('error');
      });
    return () => {
      active = false;
    };
    // pathname intentionally excluded: the session is checked once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, router]);

  const logout = useCallback(async () => {
    await authService.logout();
    router.replace('/admin/login');
  }, [router]);

  if (state === 'error') {
    return (
      <div className={styles.loadingScreen}>
        <ErrorState title="Session check failed" message={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }

  if (state === 'loading' || !user) {
    return (
      <div className={styles.loadingScreen} role="status">
        <span className={styles.spinner} aria-hidden />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return <AdminSessionContext.Provider value={{ user, logout }}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used inside <AdminSessionProvider>');
  return ctx;
}
