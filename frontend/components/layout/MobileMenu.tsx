'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, MessageCircle, Phone } from 'lucide-react';
import { mainNav, siteConfig, telHref, whatsappMessage, whatsappUrl } from '@/lib/config';
import { trackClick } from '@/lib/attribution';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import styles from './MobileMenu.module.css';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Rendered into <body> via a portal: the site header uses backdrop-filter, which
  // makes it the containing block for position:fixed children and would confine
  // this full-screen menu to the 72px header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Held in a ref so a parent re-render (new onClose identity) does not re-run the effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    // Move focus into the menu and let Escape close it.
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div id="mobile-menu" className={[styles.wrap, open ? styles.open : ''].join(' ')} aria-hidden={!open}>
      <div className={styles.backdrop} onClick={onClose} role="presentation" />
      <aside className={styles.panel} role="dialog" aria-modal="true" aria-label="Mobile navigation">
        <div className={styles.head}>
          <span className={styles.brand}>Globalantic</span>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
            <X size={24} />
          </button>
        </div>

        <nav className={styles.nav}>
          <ul>
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.link} onClick={onClose}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.footer}>
          <ThemeToggle showLabel />
          <Link
            href="/get-a-quote"
            className={styles.cta}
            onClick={() => {
              trackClick('cta_click', 'mobile_menu_quote');
              onClose();
            }}
          >
            Request a Quote
          </Link>
          {telHref() && (
            <a href={telHref()!} className={styles.call} onClick={() => trackClick('cta_click', 'mobile_menu_call')}>
              <Phone size={18} aria-hidden /> Call {siteConfig.phone}
            </a>
          )}
          {whatsappUrl() ? (
            <a
              href={whatsappUrl(whatsappMessage()) as string}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsapp}
              onClick={() => trackClick('whatsapp_click', 'mobile_menu')}
            >
              <MessageCircle size={18} /> Chat on WhatsApp
            </a>
          ) : (
            <Link href="/contact" className={styles.whatsapp} onClick={onClose}>
              <MessageCircle size={18} /> Message Us
            </Link>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
