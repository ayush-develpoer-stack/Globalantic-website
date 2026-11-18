'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Newspaper,
  Settings,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api/errors';
import { useAdminSession } from './AdminSession';
import styles from '@/app/admin/admin.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Website content',
    items: [
      { href: '/admin/dashboard/services', label: 'Services', icon: Wrench },
      { href: '/admin/dashboard/solutions', label: 'Solutions', icon: Boxes },
      { href: '/admin/dashboard/industries', label: 'Industries', icon: Building2 },
      { href: '/admin/dashboard/portfolio', label: 'Portfolio', icon: FolderKanban },
      { href: '/admin/dashboard/blog', label: 'Blog', icon: Newspaper },
      { href: '/admin/dashboard/faqs', label: 'FAQs', icon: HelpCircle },
    ],
  },
  {
    title: 'Leads & applications',
    items: [
      { href: '/admin/dashboard/contacts', label: 'Contacts', icon: Inbox },
      { href: '/admin/dashboard/training', label: 'Training applications', icon: GraduationCap },
      { href: '/admin/dashboard/careers', label: 'Career applications', icon: Briefcase },
      { href: '/admin/dashboard/newsletter', label: 'Newsletter', icon: Mail },
    ],
  },
  {
    title: 'System',
    items: [{ href: '/admin/dashboard/settings', label: 'Settings', icon: Settings }],
  },
];

function findNav(pathname: string): { section: NavSection; item: NavItem } | null {
  for (const section of ADMIN_NAV) {
    const item = section.items.find((i) =>
      i.href === '/admin/dashboard' ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`),
    );
    if (item) return { section, item };
  }
  return null;
}

/** Dashboard chrome: sidebar (drawer on small screens), topbar with breadcrumbs, theme toggle and account menu. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAdminSession();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const current = findNav(pathname);

  // Close the drawer on navigation.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Drawer: Escape closes, focus moves into it and back out.
  useEffect(() => {
    if (!drawerOpen) return;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const trigger = menuButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [drawerOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      setLoggingOut(false);
      toast.error('Could not sign out', errorMessage(err));
    }
  }

  return (
    <div className={styles.shell}>
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>

      {drawerOpen && <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden />}

      <aside
        id="admin-sidebar"
        className={[styles.sidebar, drawerOpen ? styles.sidebarOpen : ''].filter(Boolean).join(' ')}
        aria-label="Admin navigation"
      >
        <div className={styles.brand}>
          <Image src="/logo.svg" alt="" width={34} height={34} unoptimized style={{ flex: 'none' }} />
          <span>
            Globalantic
            <span className={styles.brandSub}>Admin</span>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className={[styles.iconBtn, styles.drawerClose].join(' ')}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <nav className={styles.nav}>
          {ADMIN_NAV.map((section) => (
            <div key={section.title} className={styles.navGroup}>
              <p className={styles.navSection}>{section.title}</p>
              <ul>
                {section.items.map((item) => {
                  const active = current?.item.href === item.href;
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={[styles.navLink, active ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
                        aria-current={active ? 'page' : undefined}
                      >
                        <ItemIcon size={18} className={styles.navIcon} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/" className={styles.navLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} className={styles.navIcon} aria-hidden />
            View website
          </Link>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              ref={menuButtonRef}
              type="button"
              className={[styles.iconBtn, styles.menuBtn].join(' ')}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="admin-sidebar"
            >
              <Menu size={20} aria-hidden />
            </button>

            <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
              <ol>
                <li>
                  <Link href="/admin/dashboard">Admin</Link>
                </li>
                {current && current.item.href !== '/admin/dashboard' && (
                  <>
                    <li aria-hidden className={styles.crumbSep}>
                      <ChevronRight size={14} />
                    </li>
                    <li className={styles.crumbSection}>{current.section.title}</li>
                  </>
                )}
                <li aria-hidden className={styles.crumbSep}>
                  <ChevronRight size={14} />
                </li>
                <li aria-current="page" className={styles.crumbCurrent}>
                  {current?.item.label ?? 'Dashboard'}
                </li>
              </ol>
            </nav>
          </div>

          <div className={styles.topbarRight}>
            <ThemeToggle />
            <DropdownMenu
              label={`Account menu for ${user.name}`}
              triggerClassName={styles.accountBtn}
              trigger={
                <>
                  <span className={styles.avatar} aria-hidden>
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className={styles.accountName}>{user.name}</span>
                  <ChevronDown size={16} aria-hidden />
                </>
              }
              header={
                <div>
                  <p className={styles.menuUserName}>{user.name}</p>
                  <p className={styles.menuUserMeta}>{user.email}</p>
                  <p className={styles.menuUserMeta}>Role: {user.role.toLowerCase()}</p>
                </div>
              }
              items={[
                { label: 'Settings', icon: Settings, onSelect: () => router.push('/admin/dashboard/settings') },
                { label: loggingOut ? 'Signing out…' : 'Sign out', icon: LogOut, tone: 'danger', onSelect: handleLogout, disabled: loggingOut },
              ]}
            />
          </div>
        </header>

        <main id="admin-main" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page title, description and primary actions for an admin screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.pageHead}>
      <div className={styles.pageHeadText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description && <p className={styles.pageIntro}>{description}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </div>
  );
}
