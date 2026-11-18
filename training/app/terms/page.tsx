import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import Link from 'next/link';
import { PageHeader } from '@globalantic/ui';
import s from '@/styles/site.module.css';

export const metadata: Metadata = pageMeta({ title: 'Terms of use', description: 'Terms for using Globalantic Training and its student portal.', path: '/terms' });

export default function TermsPage() {
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader eyebrow="Legal" title="Terms of use" description="These terms apply to Globalantic Training, its admission process and the student portal." />
      <div className={s.prose}>
        <h2>1. Accounts</h2>
        <p>
          You must give accurate information when you register and keep your password private. One person may hold only one account. We may
          suspend accounts that are shared, duplicated or used to misuse the platform.
        </p>
        <h2>2. Admissions</h2>
        <p>
          Submitting an application does not guarantee a seat. Applications are reviewed against the eligibility shown on the course page.
          A seat is confirmed only after approval and a verified payment, or immediately after approval for courses with no fee.
        </p>
        <h2>3. Fees and payments</h2>
        <p>
          Fees are those shown for the batch at the time you apply. Payments are processed by Razorpay. Refunds follow the Globalantic refund
          policy. A batch may be rescheduled or cancelled. If that happens, we will contact you about alternatives or a refund.
        </p>
        <h2>4. Conduct</h2>
        <p>
          Submit your own work. Treat trainers and fellow learners with respect. Do not share course materials outside your batch unless they
          are marked as public.
        </p>
        <h2>5. Certificates</h2>
        <p>
          Certificates are issued only to students who meet the completion criteria described on the course page. A certificate obtained through
          misconduct may be revoked. Every certificate can be checked on our verification page.
        </p>
        <h2>6. Referral programme</h2>
        <p>
          Referral rewards are subject to the rules on the <Link className={s.inlineLink} href="/referral">referral page</Link>. This includes review
          before payout and cancellation if the referred payment is refunded.
        </p>
        <h2>7. Changes</h2>
        <p>We may update these terms. The version in force is the one published on this page. For questions, please <Link className={s.inlineLink} href="/contact">contact us</Link>.</p>
      </div>
    </div>
  );
}
