'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, MessageCircle, Phone } from 'lucide-react';
import { desktopNav, serviceLinks } from '@/lib/config';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Icon } from '@/components/ui/Icon';
import { MobileMenu } from './MobileMenu';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { siteConfig, telHref, whatsappMessage, whatsappUrl } from '@/lib/config';
import { trackClick } from '@/lib/attribution';
import styles from './Navbar.module.css';

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus on route change.
  useEffect(() => {
    setServicesOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={[styles.header, scrolled ? styles.scrolled : ''].join(' ')}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo} aria-label="Globalantic home">
          <Image src="/logo.svg" alt="" width={36} height={36} className={styles.logoMark} priority unoptimized />
          <span className={styles.logoText}>Globalantic</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          <ul className={styles.navList}>
            {desktopNav.map((item) =>
              item.label === 'Services' ? (
                <li
                  key={item.href}
                  className={styles.hasDropdown}
                  onMouseEnter={() => setServicesOpen(true)}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <Link
                    href={item.href}
                    className={[styles.navLink, isActive(item.href) ? styles.active : ''].join(' ')}
                    aria-expanded={servicesOpen}
                  >
                    {item.label}
                    <ChevronDown size={15} className={styles.chevron} />
                  </Link>
                  <div className={[styles.mega, servicesOpen ? styles.megaOpen : ''].join(' ')}>
                    <div className={styles.megaGrid}>
                      {serviceLinks.map((s) => (
                        <Link key={s.href} href={s.href} className={styles.megaItem}>
                          <span className={styles.megaIcon}>
                            <Icon name={s.icon} size={18} />
                          </span>
                          {s.label}
                        </Link>
                      ))}
                    </div>
                    <Link href="/services" className={styles.megaAll}>
                      View all services →
                    </Link>
                  </div>
                </li>
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={[styles.navLink, isActive(item.href) ? styles.active : ''].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className={styles.actions}>
          <ThemeToggle />
          {telHref() && (
            <a href={telHref()!} className={styles.phoneBtn} aria-label={`Call ${siteConfig.phone}`} onClick={() => trackClick('cta_click', 'header_call')}>
              <Phone size={17} aria-hidden />
              <span className={styles.phoneLabel}>{siteConfig.phone}</span>
            </a>
          )}
          <a
            href={whatsappUrl(whatsappMessage()) ?? '/contact'}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.waBtn}
            aria-label="Chat on WhatsApp (opens WhatsApp)"
            onClick={() => trackClick('whatsapp_click', 'header')}
          >
            <MessageCircle size={18} aria-hidden />
            <span className={styles.waLabel}>WhatsApp</span>
          </a>
          <TrackedLink href="/get-a-quote" label="header_quote" className={styles.cta}>
            Get a Free Consultation
          </TrackedLink>
          <button
            className={styles.burger}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
