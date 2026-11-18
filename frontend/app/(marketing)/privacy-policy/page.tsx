import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { siteConfig } from '@/lib/config';
import styles from '../legal.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'How Globalantic collects, uses and protects the information you share with us through our website and forms.',
  path: '/privacy-policy',
});

const LAST_UPDATED = 'September 20, 2026';

export default function PrivacyPolicyPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Privacy Policy', path: '/privacy-policy' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />

      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        description="Your privacy matters to us. This policy explains what we collect and how we use it."
      />

      <section className="section">
        <div className="container">
          <div className={styles.wrap}>
            <span className={styles.updated}>Last updated: {LAST_UPDATED}</span>

            <p className={styles.intro}>
              This Privacy Policy describes how {siteConfig.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;
              or &ldquo;our&rdquo;) handles information you provide when you visit our website or get
              in touch with us. Please read it alongside our other policies.
            </p>

            <div className={styles.section}>
              <h2>Information We Collect</h2>
              <p>We only collect information you choose to share with us, which may include:</p>
              <ul className={styles.list}>
                <li>Contact details submitted through our contact form, such as your name, email, phone number and company.</li>
                <li>Details submitted through our training or internship application form, such as qualification, city and preferences.</li>
                <li>Details submitted through our careers application form, such as your resume or portfolio links.</li>
                <li>Your email address when you subscribe to our newsletter.</li>
                <li>
                  With an enquiry you submit: the page you first arrived on, the website that referred you and any
                  campaign tags in the link (for example utm_source), so we know which pages and campaigns bring enquiries.
                  This is kept in your browser for the current visit only and sent to us only if you submit the form.
                </li>
                <li>
                  Anonymous counts of clicks on buttons such as &ldquo;Request a Quote&rdquo; or &ldquo;Chat on WhatsApp&rdquo;
                  (which button and page, with no name, contact details, cookie or device identifier).
                </li>
                <li>Basic technical information your browser sends automatically, such as general usage data.</li>
              </ul>
            </div>

            <div className={styles.section}>
              <h2>How We Use Your Information</h2>
              <p>We use the information you provide to:</p>
              <ul className={styles.list}>
                <li>Respond to your enquiries and provide the information or services you request.</li>
                <li>Process training, internship and career applications.</li>
                <li>Send newsletters or updates where you have opted in.</li>
                <li>Improve our website and the way we communicate.</li>
              </ul>
            </div>

            <div className={styles.section}>
              <h2>Cookies</h2>
              <p>
                Our website may use cookies or similar technologies to help the site function and to
                understand general usage. You can control or disable cookies through your browser
                settings; some parts of the site may not work as intended if you do.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Third Parties</h2>
              <p>
                We may use trusted third-party service providers, such as email or hosting providers,
                to help us operate our website and communicate with you. These providers only receive
                the information needed to perform their services. We do not sell your personal
                information.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Data Retention</h2>
              <p>
                We keep the information you provide only for as long as is reasonably necessary for
                the purposes described in this policy, or as required to meet applicable obligations,
                after which it is removed or anonymised.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Your Rights</h2>
              <p>
                You may request access to the personal information we hold about you, ask us to
                correct or update it, or request that we delete it. You can also opt out of our
                newsletter at any time. To make a request, please contact us using the details below.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Any changes will be reflected on
                this page with a revised &ldquo;last updated&rdquo; date.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Contact Us</h2>
              <p>
                If you have any questions about this policy or your information, email us at{' '}
                <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
