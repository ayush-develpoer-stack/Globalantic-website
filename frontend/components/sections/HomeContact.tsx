import { ArrowRight } from 'lucide-react';
import { getSettings } from '@/lib/api';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ContactChannels } from '@/components/marketing/ContactChannels';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import { buttonClass } from '@/components/ui/Button';
import styles from './HomeContact.module.css';

/** Homepage contact block: phone, WhatsApp, email, location and a route to the enquiry form. */
export async function HomeContact() {
  const settings = await getSettings();
  return (
    <section className="section" aria-labelledby="home-contact-title">
      <div className="container">
        <div className={styles.wrap}>
          <div className={styles.copy}>
            <SectionHeading eyebrow="Contact" title="Talk to Globalantic" align="left" />
            <p className={styles.lead}>
              Tell us what you want to build or improve. A short conversation is the quickest way to scope a project — the first consultation is free.
            </p>
            <TrackedLink href="/get-a-quote" label="home_contact_quote" className={buttonClass('primary', 'lg')}>
              Discuss Your Project <ArrowRight size={18} aria-hidden />
            </TrackedLink>
          </div>
          <ContactChannels settings={settings} compact />
        </div>
      </div>
    </section>
  );
}
