import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { siteConfig } from '@/lib/config';
import styles from '../legal.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Refund Policy',
  description:
    'Globalantic refund policy covering our training and internship program as well as general service engagements.',
  path: '/refund-policy',
});

const LAST_UPDATED = 'September 20, 2026';

export default function RefundPolicyPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Refund Policy', path: '/refund-policy' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />

      <PageHero
        eyebrow="Legal"
        title="Refund Policy"
        description="How refunds are handled for our training program and service engagements."
      />

      <section className="section">
        <div className="container">
          <div className={styles.wrap}>
            <span className={styles.updated}>Last updated: {LAST_UPDATED}</span>

            <p className={styles.intro}>
              This Refund Policy explains, in general terms, how {siteConfig.name} approaches refunds.
              It is organised into two parts — one for our training and internship program, and one
              for our general service engagements. Specific terms for any particular program or
              project are confirmed with you before you enrol or engage us.
            </p>

            <div className={styles.callout}>
              <p>
                This policy is intended as general guidance and is not a binding contract on its own.
                For the exact terms that apply to you, please refer to the details shared at the time
                of enrolment or engagement, or contact us at{' '}
                <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Training &amp; Internship Program</h2>
              <p>
                The following applies specifically to our Full Stack Development paid internship
                program.
              </p>

              <h3>Before the program begins</h3>
              <p>
                If you wish to withdraw before your batch starts, please contact us as early as
                possible. We will review refund requests made before the start date on a
                case-by-case basis, taking into account any administrative or reserved-seat costs.
              </p>

              <h3>After the program begins</h3>
              <p>
                Once a batch has started, seats are limited and resources are committed. Refunds
                after the program has begun are generally not available, except where required by
                applicable law or as otherwise agreed in writing.
              </p>

              <h3>How to request</h3>
              <p>
                To request a refund related to the program, email us with your name, application
                details and the reason for your request. We&apos;ll acknowledge it and let you know
                the applicable terms.
              </p>
            </div>

            <div className={styles.section}>
              <h2>General Service Engagements</h2>
              <p>
                The following applies to development, design, marketing and other project-based
                services we provide to clients.
              </p>

              <h3>Project payments</h3>
              <p>
                Services are typically delivered in agreed phases or milestones. Amounts for work
                already completed or in progress are generally non-refundable, as they cover time and
                resources already committed.
              </p>

              <h3>Cancellations</h3>
              <p>
                If a project is cancelled, any refund of amounts paid for work not yet started will be
                considered based on the terms agreed in your proposal or agreement.
              </p>

              <h3>Third-party costs</h3>
              <p>
                Fees paid to third parties on your behalf — such as domains, hosting, licences or ad
                spend — are subject to those providers&apos; own terms and are generally
                non-refundable.
              </p>
            </div>

            <div className={styles.section}>
              <h2>Questions</h2>
              <p>
                If you have any questions about refunds, or want to understand the terms that apply to
                your specific situation, please contact us at{' '}
                <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. We&apos;re happy to
                help.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
