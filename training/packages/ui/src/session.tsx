'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { AuthUser, Permission, Role } from '@globalantic/types';
import { Alert, Button, ErrorState, Input, LoadingState } from './components';
import { buttonClass } from './button-class';
import { safeNext } from './safe-next';
import { ThemeToggle } from './theme';
import s from './shell.module.css';
import { Logo } from './logo';

/**
 * Client-side session for the private portals. This only decides what UI to
 * render — every API call is authorised again by the server (session cookie,
 * role and ownership checks). A missing session redirects to /login.
 */

interface SessionValue {
  user: AuthUser;
  can: (p: Permission) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <RequireSession>');
  return ctx;
}

export { safeNext };

export function RequireSession({ roles, children, portalName }: { roles: Role[]; children: React.ReactNode; portalName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const me = await api().auth.me();
      if (!me) {
        router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
        return;
      }
      setUser(me);
      setState(roles.includes(me.role) ? 'ready' : 'forbidden');
    } catch (err) {
      setError(errorMessage(err));
      setState('error');
    }
  }, [router, pathname, roles]);

  useEffect(() => {
    void load();
    // Only on mount: navigation inside the portal keeps the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    try {
      await api().auth.logout();
    } finally {
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  if (state === 'loading') return <div className={s.centered}><LoadingState label="Checking your session…" /></div>;
  if (state === 'error') return <div className={s.centered}><ErrorState title="Could not reach the server" message={error} onRetry={() => void load()} /></div>;
  if (state === 'forbidden' || !user) {
    return (
      <div className={s.centered}>
        <ErrorState title={`This account cannot use the ${portalName}`} message={`You are signed in as ${user?.email ?? 'another user'}. Sign out and use an account with access.`} />
        <Button variant="outline" onClick={() => void logout()}>Sign out</Button>
      </div>
    );
  }

  const value: SessionValue = {
    user,
    can: (p) => Boolean(user.permissions?.includes(p)),
    logout,
    refresh: load,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Hide unless the user has this permission. */
  permission?: Permission;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Sidebar + top bar layout for the private portals (responsive, keyboard accessible). */
export function PortalShell({ brand, sections, children, headerExtra }: { brand: string; sections: NavSection[]; children: React.ReactNode; headerExtra?: React.ReactNode }) {
  const { user, can, logout } = useSession();
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const matches = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  // Only the most specific matching link is active (e.g. /exams/questions, not also /exams).
  const activeHref = sections
    .flatMap((sec) => sec.items.map((i) => i.href))
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;

  return (
    <div className={s.shell}>
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className={[s.sidebar, open ? s.sidebarOpen : ''].join(' ')} aria-label="Main navigation">
        <div className={s.brand}>
          <Logo size={36} />
          <span>
            <span className={s.brandName}>Globalantic</span>
            <span className={s.brandSub}>{brand}</span>
          </span>
          <button type="button" className={s.closeNav} onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className={s.nav}>
          {sections.map((section, i) => {
            const items = section.items.filter((it) => !it.permission || can(it.permission));
            if (!items.length) return null;
            return (
              <div key={section.title ?? i} className={s.navSection}>
                {section.title && <p className={s.navTitle}>{section.title}</p>}
                <ul>
                  {items.map((it) => {
                    const Icon = it.icon;
                    const active = isActive(it.href);
                    return (
                      <li key={it.href}>
                        <Link href={it.href} className={[s.navLink, active ? s.navActive : ''].join(' ')} aria-current={active ? 'page' : undefined}>
                          {Icon && <Icon size={18} aria-hidden />}
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden />}
      <div className={s.main}>
        <header className={s.topbar}>
          <button type="button" className={s.menuBtn} onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Menu size={20} aria-hidden />
          </button>
          {/* On small screens the sidebar is a drawer, so the logo also sits in the top bar. */}
          <span className={s.topBrand}>
            <Logo size={28} />
            <span className={s.brandName}>{brand}</span>
          </span>
          <div className={s.topSpacer} />
          {headerExtra}
          <ThemeToggle />
          <div className={s.user}>
            <span className={s.userName}>{user.name}</span>
            <span className={s.userRole}>{user.role.toLowerCase()}</span>
          </div>
          <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => void logout()}>
            <LogOut size={16} aria-hidden /> <span className={s.hideSm}>Sign out</span>
          </button>
        </header>
        <main id="main" className={s.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Shared sign-in form used by every portal's /login page. */
export function LoginForm({ title, subtitle, defaultNext = '/', footer }: { title: string; subtitle?: string; defaultNext?: string; footer?: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().auth.login(email, password);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(safeNext(next, defaultNext));
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={s.authPage}>
      <div className={s.authTop}>
        <ThemeToggle />
      </div>
      <form className={s.authCard} onSubmit={submit} noValidate>
        <div className={s.brand}>
          <Logo size={36} />
          <span className={s.brandName}>Globalantic</span>
        </div>
        <h1 className={s.authTitle}>{title}</h1>
        {subtitle && <p className={s.authSub}>{subtitle}</p>}
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} />
        <Button type="submit" full loading={pending}>
          Sign in
        </Button>
        {footer}
      </form>
    </div>
  );
}
