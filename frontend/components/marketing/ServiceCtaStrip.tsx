import { ArrowRight } from 'lucide-react';
import { TrackedLink } from './TrackedLink';
import { WhatsAppButton } from './WhatsApp';
import styles from './Enquiry.module.css';

/** Primary actions under a service/landing hero: quote (scrolls to the form), consultation, WhatsApp. */
export function ServiceCtaStrip({ service, quoteHref = '#enquiry' }: { service?: string; quoteHref?: string }) {
  return (
    <div className="container">
      <div className={styles.strip}>
        <TrackedLink href={quoteHref} label="hero_request_quote" service={service} className={styles.primaryCta}>
          Request a Quote <ArrowRight size={18} aria-hidden />
        </TrackedLink>
        <TrackedLink href={quoteHref} label="hero_free_consultation" service={service} className={styles.secondaryCta}>
          Get a Free Consultation
        </TrackedLink>
        <WhatsAppButton service={service} label="hero" size="lg" />
      </div>
    </div>
  );
}
