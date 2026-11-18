import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import { HeroVisual, accentFor, type HeroVariant } from '@/components/visuals/HeroVisual';
import styles from './PremiumHero.module.css';

export interface Crumb {
  name: string;
  path: string;
}

export interface PremiumHeroProps {
  eyebrow?: string;
  title: string;
  /** Optional emphasised line under the title (e.g. a service tagline) */
  tagline?: string | null;
  description?: string;
  breadcrumb?: Crumb[];
  /** Illustration style; omit for a centred text-only hero (legal pages) */
  visual?: HeroVariant;
  /** Standard CTA row: consultation + WhatsApp (+ optional secondary link) */
  ctas?: {
    /** Where the consultation CTA points (default /get-a-quote) */
    href?: string;
    label?: string;
    /** Service name for WhatsApp greeting + click tracking */
    service?: string | null;
    trackLabel: string;
    secondary?: { href: string; label: string };
  };
  /** Small factual points under the CTAs (e.g. "Free consultation") */
  points?: string[];
  children?: React.ReactNode;
}

/**
 * Premium hero used across the public site: what Globalantic does, who it helps,
 * and the next step. Visuals are original, decorative compositions (aria-hidden).
 */
export function PremiumHero({ eyebrow, title, tagline, description, breadcrumb, visual, ctas, points, children }: PremiumHeroProps) {
  const centered = !visual;
  return (
    <section className={`${styles.hero} ${centered ? styles.centered : ''}`} style={visual ? ({ ['--va' as string]: accentFor(visual) } as React.CSSProperties) : undefined}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.copy}>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <ol>
                {breadcrumb.map((c, i) => (
                  <li key={c.path}>
                    {i === breadcrumb.length - 1 ? (
                      <span aria-current="page">{c.name}</span>
                    ) : (
                      <>
                        <Link href={c.path}>{c.name}</Link>
                        <ChevronRight size={13} aria-hidden />
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          <h1 className={styles.title}>{title}</h1>
          {tagline && <p className={styles.tagline}>{tagline}</p>}
          {description && <p className={styles.description}>{description}</p>}
          {ctas && (
            <div className={styles.actions}>
              <TrackedLink href={ctas.href ?? '/get-a-quote'} label={`${ctas.trackLabel}_consultation`} service={ctas.service} className={styles.primary}>
                {ctas.label ?? 'Get a Free Consultation'} <ArrowRight size={18} aria-hidden />
              </TrackedLink>
              <WhatsAppButton service={ctas.service} label={ctas.trackLabel} size="lg" variant="outline" />
              {ctas.secondary && (
                <TrackedLink href={ctas.secondary.href} label={`${ctas.trackLabel}_secondary`} service={ctas.service} className={styles.secondary}>
                  {ctas.secondary.label}
                </TrackedLink>
              )}
            </div>
          )}
          {children && <div className={styles.actions}>{children}</div>}
          {points && points.length > 0 && (
            <ul className={styles.points}>
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        {visual && (
          <div className={styles.visual}>
            <HeroVisual variant={visual} />
          </div>
        )}
      </div>
    </section>
  );
}
