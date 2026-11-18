import { buttonClass } from '@/components/ui/Button';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import styles from './DetailCTA.module.css';

interface DetailCTAProps {
  title?: string;
  subtitle?: string;
  /** Context for the WhatsApp greeting and click counter (e.g. an industry or solution name). */
  topic?: string;
}

/** Gradient call-to-action band with links to contact and portfolio. */
export function DetailCTA({
  title = 'Ready to build something great?',
  subtitle = 'Tell us about your goals and get a free, no-obligation consultation with our team.',
  topic,
}: DetailCTAProps) {
  return (
    <section className="section">
      <div className="container">
        <div className={styles.band}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
          <div className={styles.actions}>
            <TrackedLink href={`/get-a-quote${topic ? `?service=${encodeURIComponent(topic)}` : ''}`} label="detail_cta_quote" service={topic} className={buttonClass('secondary', 'lg')}>
              Request a Quote
            </TrackedLink>
            <TrackedLink href="/contact" label="detail_cta_consultation" service={topic} className={buttonClass('outline', 'lg', false, styles.outlineLight)}>
              Get a Free Consultation
            </TrackedLink>
            <WhatsAppButton service={topic} label="detail_cta" size="lg" />
          </div>
        </div>
      </div>
    </section>
  );
}
