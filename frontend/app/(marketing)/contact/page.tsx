import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { ContactForm } from '@/components/forms/ContactForm';
import { ContactChannels, OfficeMap } from '@/components/marketing/ContactChannels';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { getSettings } from '@/lib/api';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Contact Globalantic — Phone, WhatsApp & Email',
  description: 'Contact Globalantic by phone, WhatsApp or email, or send your project details for a free consultation.',
  path: '/contact',
});

export default async function ContactPage() {
  const settings = await getSettings();
  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact' },
  ];
  const hasMap = Boolean(settings?.mapEmbedUrl || settings?.mapUrl);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(breadcrumb)) }} />

      <PageHero
        eyebrow="Contact"
        title="Let's talk about your project"
        description="Call, message us on WhatsApp or send your requirements below. We help startups, growing businesses and established companies plan and build websites, software, apps and digital marketing."
        visual="answers"
        breadcrumb={breadcrumb}
        ctas={{ href: '#contact-form', label: 'Send your requirements', trackLabel: 'contact_hero' }}
        points={['Free, no-obligation consultation', 'We usually reply within one business day']}
      />

      <section className="section">
        <div className="container">
          <div className={styles.layout}>
            <aside className={styles.info}>
              <h2 className={styles.infoTitle}>Ways to reach us</h2>
              <p className={styles.intro}>
                Prefer a quick conversation? Call or WhatsApp us. For a detailed estimate, the form is the fastest way to share everything in one place.
              </p>
              <ContactChannels settings={settings} />
            </aside>

            <div className={styles.formWrap} id="contact-form">
              <h2 className={styles.formTitle}>Tell us about your project</h2>
              <ContactForm source="contact_page" />
            </div>
          </div>
        </div>
      </section>

      {hasMap && (
        <section className="section">
          <div className="container">
            <SectionHeading eyebrow="Visit us" title="Our office location" align="center" />
            <OfficeMap settings={settings} />
          </div>
        </section>
      )}
    </>
  );
}
