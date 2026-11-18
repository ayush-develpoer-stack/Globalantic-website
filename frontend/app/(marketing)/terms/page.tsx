import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { siteConfig } from '@/lib/config';
import styles from '../legal.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service',
  description:
    'The terms that apply to your use of the Globalantic website. Please read them carefully.',
  path: '/terms',
});

const LAST_UPDATED = 'September 20, 2026';

export default function TermsPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Terms', path: '/terms' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />

      <PageHero
        eyebrow="Legal"
        title="Terms of Service"
        description="These terms govern your use of the Globalantic website."
      />

      <section className="section">
        <div className="container">
          <div className={styles.wrap}>
            <span className={styles.updated}>Last updated: {LAST_UPDATED}</span>

            <p className={styles.intro}>
              These Terms of Service (&ldquo;Terms&rdquo;) apply to your use of the {siteConfig.name}{' '}
              website. By accessing or using this website, you agree to these Terms. If you do not
              agree, please do not use the site.
            </p>

            <div className={styles.section}>
              <h2>Use of the Website</h2>
              <p>
                You may use this website for lawful purposes only. You agree not to use it in any way
                that could damage, disable or impair the site, or interfere with any other party&apos;s
                use of it.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Intellectual Property</h2>
              <p>
                Unless stated otherwise, the content on this website — including text, graphics,
                logos and design — is the property of {siteConfig.name} or its licensors and is
                protected by applicable intellectual property laws. You may not reproduce or
                redistribute it without our prior written permission.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Disclaimers</h2>
              <p>
                This website and its content are provided on an &ldquo;as is&rdquo; and &ldquo;as
                available&rdquo; basis. While we aim to keep information accurate and up to date, we
                make no warranties or representations about the completeness, accuracy or reliability
                of any content on the site.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Limitation of Liability</h2>
              <p>
                To the extent permitted by law, {siteConfig.name} will not be liable for any loss or
                damage arising from your use of, or inability to use, this website, including any
                reliance placed on its content.
              </p>
            </div>

            <div className={styles.section}>
              <h2>External Links</h2>
              <p>
                This website may contain links to third-party websites. We are not responsible for
                the content or practices of those sites, and links do not imply endorsement.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Governing Law</h2>
              <p>
                These Terms are governed by and construed in accordance with the laws of India,
                without regard to conflict-of-law principles.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of the website after any
                changes indicates your acceptance of the revised Terms.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Contact Us</h2>
              <p>
                Questions about these Terms? Email us at{' '}
                <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
