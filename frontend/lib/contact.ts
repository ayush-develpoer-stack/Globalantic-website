import { siteConfig, telHref, whatsappMessage } from './config';
import type { SiteSettings } from '@/types';

/**
 * Old placeholder values that may still sit in the settings row (the database column default).
 * They are not real inboxes, so the verified values in siteConfig are shown instead.
 */
const LEGACY_PLACEHOLDER_EMAILS = new Set(['hello@globalantic.com']);

export interface ContactDetails {
  /** Primary public email. */
  email: string;
  /** Second public email, or null when not configured / same as the primary. */
  secondaryEmail: string | null;
  /** Both addresses, primary first (for "email us" lists). */
  emails: string[];
  /** Display phone, e.g. "+91 76978 45157". */
  phone: string;
  /** tel: link, or null when no usable number is configured. */
  tel: string | null;
  /** wa.me link (with the default greeting), or null when no WhatsApp number is configured. */
  whatsapp: string | null;
  /** City-level location (no street address is published unless an admin configures one). */
  address: string;
}

const clean = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');

/**
 * The single source of public contact details: admin site settings first, the verified
 * constants in siteConfig as the fallback. Every page/component uses this so the footer,
 * contact page, structured data and llms.txt never disagree.
 */
export function contactDetails(settings?: Partial<SiteSettings> | null): ContactDetails {
  const configured = clean(settings?.email).toLowerCase();
  const email = configured && !LEGACY_PLACEHOLDER_EMAILS.has(configured) ? configured : siteConfig.email;
  const second = clean(settings?.secondaryEmail).toLowerCase() || siteConfig.secondaryEmail;
  const secondaryEmail = second && second !== email && !LEGACY_PLACEHOLDER_EMAILS.has(second) ? second : null;
  const phone = clean(settings?.phone) || siteConfig.phone;
  const waDigits = (clean(settings?.whatsapp) || siteConfig.whatsapp).replace(/\D/g, '');
  return {
    email,
    secondaryEmail,
    emails: secondaryEmail ? [email, secondaryEmail] : [email],
    phone,
    tel: telHref(phone),
    whatsapp: waDigits.length >= 10 ? `https://wa.me/${waDigits}?text=${encodeURIComponent(whatsappMessage())}` : null,
    address: clean(settings?.address) || siteConfig.location,
  };
}
