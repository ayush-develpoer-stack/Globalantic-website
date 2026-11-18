'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo, ThemeToggle, buttonClass } from '@globalantic/ui';
import s from '@/styles/site.module.css';

const NAV = [
  { href: '/courses', label: 'Courses' },
  { href: '/batches', label: 'Batches' },
  { href: '/programs/training', label: 'Training' },
  { href: '/programs/internship', label: 'Internships' },
  { href: '/programs/certificate', label: 'Certificate' },
  { href: '/fees', label: 'Fees' },
  { href: '/referral', label: 'Refer & earn' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={s.header}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={`container ${s.headerInner}`}>
        <Link href="/" className={s.brand} aria-label="Globalantic Training home">
          <Logo size={36} />
          <span>
            <span className={s.brandName}>Globalantic</span>
            <span className={s.brandSub}>Training</span>
          </span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`${s.navLink} ${active(n.href) ? s.navActive : ''}`} aria-current={active(n.href) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className={s.headerActions}>
          <ThemeToggle />
          <Link href="/login" className={`${buttonClass('ghost', 'sm')} ${s.desktopOnly}`}>
            Sign in
          </Link>
          <Link href="/register" className={`${buttonClass('primary', 'sm')} ${s.desktopOnly}`}>
            Register
          </Link>
          <button type="button" className={s.menuBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </div>
      <div id="mobile-menu" className={`container ${s.mobileMenu} ${open ? s.mobileMenuOpen : ''}`}>
        <nav aria-label="Mobile">
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={`${s.navLink} ${active(n.href) ? s.navActive : ''}`}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className={s.mobileActions}>
            <Link href="/login" className={buttonClass('outline', 'md', true)}>
              Sign in
            </Link>
            <Link href="/register" className={buttonClass('primary', 'md', true)}>
              Register
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
