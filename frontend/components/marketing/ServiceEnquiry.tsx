import { siteConfig } from '@/lib/config';
import { ContactForm } from '@/components/forms/ContactForm';
import { WhatsAppButton } from './WhatsApp';
import styles from './Enquiry.module.css';

interface Props {
  /** Pre-selected service (service landing pages). */
  service?: string;
  /** CRM source, e.g. service_page:web-development */
  source: string;
  title?: string;
  lead?: string;
  id?: string;
}

/** "Discuss your project" section: what happens next + WhatsApp, next to the multi-step enquiry form. */
export function ServiceEnquiry({ service, source, id = 'enquiry', title = 'Discuss your project', lead }: Props) {
  return (
    <section className={`section ${styles.section}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="container">
        <div className={styles.layout}>
          <div className={styles.aside}>
            <span className={styles.eyebrow}>Free consultation</span>
            <h2 className={styles.title} id={`${id}-title`}>
              {title}
            </h2>
            <p className={styles.lead}>
              {lead ??
                `Tell us what you need${service ? ` from our ${service} team` : ''}. There is no obligation — a short conversation is the quickest way to scope your project and estimate cost and timeline.`}
            </p>
            <ol className={styles.steps}>
              <li className={styles.step}>
                <span>
                  <strong>Share your requirements</strong>A few questions about your goals, budget and timeline.
                </span>
              </li>
              <li className={styles.step}>
                <span>
                  <strong>Consultation</strong>We get in touch to understand your project and answer your questions.
                </span>
              </li>
              <li className={styles.step}>
                <span>
                  <strong>Proposal</strong>You receive a written proposal with scope, timeline and cost.
                </span>
              </li>
            </ol>
            <div className={styles.actions}>
              <WhatsAppButton service={service} label={`${source}:aside`} variant="outline" />
            </div>
            <p className={styles.note}>
              Prefer email? Write to <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
            </p>
          </div>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Request a quote</h3>
            <ContactForm defaultService={service} source={source} />
          </div>
        </div>
      </div>
    </section>
  );
}
