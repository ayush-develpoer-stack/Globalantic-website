'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { whatsappMessage, whatsappUrl } from '@/lib/config';
import { trackClick } from '@/lib/attribution';
import styles from './WhatsApp.module.css';

interface Props {
  /** Service name for a contextual greeting. */
  service?: string | null;
  /** Enquiry reference to include (confirmation screens). */
  reference?: string | null;
  /** Custom message (overrides the default greeting). */
  message?: string;
  /** Where it was clicked, for the anonymous click counter. */
  label: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline';
  fullWidth?: boolean;
  className?: string;
}

/** "Chat on WhatsApp" button: opens wa.me with a pre-filled message. Opens a chat only — not synced to the CRM. */
export function WhatsAppButton({ service, reference, message, label, children, size = 'md', variant = 'solid', fullWidth, className }: Props) {
  const href = whatsappUrl(message ?? whatsappMessage(service, reference));
  if (!href) return null;
  const cls = [styles.btn, size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : '', variant === 'outline' ? styles.outline : '', fullWidth ? styles.full : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => trackClick('whatsapp_click', label, service)}>
      <MessageCircle size={18} aria-hidden />
      {children ?? 'Chat on WhatsApp'}
      <span className="sr-only"> (opens WhatsApp)</span>
    </a>
  );
}

/** Floating WhatsApp action, bottom-right on every marketing page (icon-only on small screens). */
export function WhatsAppFloat() {
  const href = whatsappUrl(whatsappMessage());
  const pathname = usePathname();
  const [formInView, setFormInView] = useState(false);

  // On small screens the button would cover form fields and submit buttons: hide it while any
  // form is on screen (the forms carry their own WhatsApp option).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      setFormInView(visible.size > 0);
    }, { threshold: 0.05 });
    const t = window.setTimeout(() => document.querySelectorAll('main form').forEach((el) => io.observe(el)), 300);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
      setFormInView(false);
    };
  }, [pathname]);

  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${styles.float} ${formInView ? styles.floatHidden : ''}`} aria-label="Chat with Globalantic on WhatsApp (opens WhatsApp)" onClick={() => trackClick('whatsapp_click', 'floating')}>
      <MessageCircle size={24} aria-hidden />
      <span className={styles.floatLabel}>WhatsApp</span>
    </a>
  );
}
