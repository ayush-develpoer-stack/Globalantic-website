import Image from 'next/image';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, Phone, Linkedin, Instagram, Facebook, Twitter, Youtube } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { footerNav, siteConfig } from '@/lib/config';
import { contactDetails } from '@/lib/contact';
import { getIndustries, getServices, getSettings, getSolutions } from '@/lib/api';
import { NewsletterForm } from '@/components/forms/NewsletterForm';
import styles from './Footer.module.css';

type NavLink = { label: string; href: string };

/** Site-wide footer: verified contact details, complete navigation and legal links. */
export async function Footer() {
  const year = new Date().getFullYear();
  const [settings, services, solutions, industries] = await Promise.all([getSettings(), getServices(), getSolutions(), getIndustries()]);

  const { emails, phone, tel, whatsapp, address } = contactDetails(settings);
  const tagline = settings?.footerDescription || 'We design and build websites, software, mobile apps, AI solutions and business systems, and help businesses grow online.';

  // Only render social links that are actually configured — never dead or placeholder links.
  const socials: { label: string; href: string; Icon: LucideIcon }[] = [
    { label: 'LinkedIn', href: settings?.linkedinUrl || '', Icon: Linkedin },
    { label: 'Instagram', href: settings?.instagramUrl || '', Icon: Instagram },
    { label: 'Facebook', href: settings?.facebookUrl || '', Icon: Facebook },
    { label: 'Twitter / X', href: settings?.twitterUrl || '', Icon: Twitter },
    { label: 'YouTube', href: settings?.youtubeUrl || '', Icon: Youtube },
  ].filter((s) => /^https:\/\//.test(s.href));

  // Navigation comes from published content, with the static lists as a fallback.
  const serviceLinks: NavLink[] = services?.length ? services.map((s) => ({ label: s.title, href: `/services/${s.slug}` })) : footerNav.services;
  const solutionLinks: NavLink[] = solutions?.length ? solutions.map((s) => ({ label: s.title, href: `/solutions/${s.slug}` })) : footerNav.solutions;
  const industryLinks: NavLink[] = industries?.length ? industries.map((i) => ({ label: i.title, href: `/industries/${i.slug}` })) : [];

  return (
    <footer className={styles.footer}>
      <div className={styles.glow} aria-hidden />
      <div className="container">
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Link href="/" className={styles.logo}>
              <Image src="/logo.svg" alt="" width={34} height={34} className={styles.logoMark} unoptimized /> Globalantic
            </Link>
            <p className={styles.tagline}>{tagline}</p>
            <address className={styles.contact}>
              {tel && (
                <a href={tel} className={styles.contactItem}>
                  <Phone size={16} aria-hidden /> <span>{phone}</span>
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.contactItem}>
                  <MessageCircle size={16} aria-hidden /> <span>Chat on WhatsApp</span>
                  <span className="sr-only"> (opens WhatsApp)</span>
                </a>
              )}
              {emails.map((email) => (
                <a key={email} href={`mailto:${email}`} className={styles.contactItem}>
                  <Mail size={16} aria-hidden /> <span>{email}</span>
                </a>
              ))}
              {address && (
                <span className={styles.contactItem}>
                  <MapPin size={16} aria-hidden /> <span>{address}</span>
                </span>
              )}
            </address>
            {socials.length > 0 && (
              <div className={styles.social}>
                {socials.map(({ label, href, Icon }) => (
                  <a key={label} href={href} aria-label={`${label} (opens in a new tab)`} className={styles.socialLink} target="_blank" rel="noopener noreferrer">
                    <Icon size={18} aria-hidden />
                  </a>
                ))}
              </div>
            )}
            <div className={styles.newsletter}>
              <p className={styles.newsletterText}>Occasional updates on technology and digital growth.</p>
              <NewsletterForm />
            </div>
          </div>

          <nav className={styles.links} aria-label="Footer">
            <FooterCol title="Company" items={[{ label: 'Home', href: '/' }, ...footerNav.company]} />
            <FooterCol title="Services" items={[{ label: 'All services', href: '/services' }, ...serviceLinks]} />
            <FooterCol title="Solutions" items={[{ label: 'All solutions', href: '/solutions' }, ...solutionLinks]} />
            <FooterCol title="Industries" items={[{ label: 'All industries', href: '/industries' }, ...industryLinks]} />
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>
            © {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <ul className={styles.legal}>
            {[...footerNav.legal, { label: 'Sitemap', href: '/sitemap.xml' }].map((item) => (
              <li key={item.href}>
                {item.href.endsWith('.xml') ? <a href={item.href}>{item.label}</a> : <Link href={item.href}>{item.label}</Link>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: NavLink[] }) {
  return (
    <div className={styles.col}>
      <h2 className={styles.colTitle}>{title}</h2>
      <ul className={styles.colList}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.colLink}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
