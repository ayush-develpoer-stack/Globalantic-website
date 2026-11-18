import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { siteConfig } from '@/lib/config';
import { contactDetails } from '@/lib/contact';
import type { SiteSettings } from '@/types';
import styles from './ContactChannels.module.css';

type Channel = { Icon: typeof Phone; label: string; value: string; href?: string; external?: boolean };

/** Verified contact channels: phone (click-to-call), WhatsApp, email and the configured address. */
export function ContactChannels({ settings, compact = false }: { settings: SiteSettings | null; compact?: boolean }) {
  const { phone, tel, whatsapp: wa, email, secondaryEmail, address } = contactDetails(settings);
  const items: Channel[] = [];
  if (tel) items.push({ Icon: Phone, label: 'Call us', value: phone, href: tel });
  if (wa) items.push({ Icon: MessageCircle, label: 'WhatsApp', value: 'Chat with our team', href: wa, external: true });
  items.push({ Icon: Mail, label: 'Email', value: email, href: `mailto:${email}` });
  if (secondaryEmail) items.push({ Icon: Mail, label: 'Also reach us at', value: secondaryEmail, href: `mailto:${secondaryEmail}` });
  if (address) items.push({ Icon: MapPin, label: 'Location', value: address });
  if (!compact) items.push({ Icon: Clock, label: 'Response time', value: 'We usually reply within one business day.' });

  return (
    <ul className={`${styles.list} ${compact ? styles.compact : ''}`}>
      {items.map(({ Icon, label, value, href, external }) => {
        const body = (
          <>
            <span className={styles.icon}>
              <Icon size={20} aria-hidden />
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{label}</span>
              <span className={styles.value}>{value}</span>
            </span>
          </>
        );
        return (
          <li key={label}>
            {href ? (
              <a href={href} className={styles.item} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {body}
                {external && <span className="sr-only"> (opens WhatsApp)</span>}
              </a>
            ) : (
              <div className={styles.item}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Office map — only when an admin configured the verified location (keyless Google Maps embed
 * or an official Maps link). Nothing is shown otherwise; no placeholder location is invented.
 */
export function OfficeMap({ settings }: { settings: SiteSettings | null }) {
  const embed = settings?.mapEmbedUrl && settings.mapEmbedUrl.startsWith('https://www.google.com/maps/embed?') ? settings.mapEmbedUrl : null;
  const link = settings?.mapUrl && settings.mapUrl.startsWith('https://') ? settings.mapUrl : null;
  if (!embed && !link) return null;
  return (
    <div className={styles.map}>
      {embed && (
        <iframe
          src={embed}
          title={`Map: ${settings?.address || siteConfig.name} office location`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className={styles.frame}
        />
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>
          <MapPin size={16} aria-hidden /> Open in Google Maps
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
