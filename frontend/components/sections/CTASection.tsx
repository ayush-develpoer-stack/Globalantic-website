import { ArrowRight } from 'lucide-react';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import { buttonClass } from '@/components/ui/Button';
import styles from './CTASection.module.css';

/** Prominent final call-to-action band: request a quote or start a WhatsApp chat. */
export function CTASection({ label = 'cta_band' }: { label?: string }) {
  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <div className={styles.band}>
          <div className={styles.glow} aria-hidden />
          <div className={styles.content}>
            <h2 className={styles.title}>Have a project in mind? Let&apos;s discuss it.</h2>
            <p className={styles.subtitle}>
              Share your goals, budget and timeline. We will get back to you to arrange a free consultation, then send a
              written proposal with scope, timeline and cost.
            </p>
            <div className={styles.actions}>
              <TrackedLink href="/get-a-quote" label={`${label}_quote`} className={buttonClass('secondary', 'lg')}>
                Request a Quote <ArrowRight size={18} />
              </TrackedLink>
              <WhatsAppButton label={label} size="lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
