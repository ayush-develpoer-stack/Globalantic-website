import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import Link from 'next/link';
import { PageHeader } from '@globalantic/ui';
import s from '@/styles/site.module.css';

export const metadata: Metadata = pageMeta({ title: 'Privacy policy', description: 'What personal data Globalantic Training collects and how it is used.', path: '/privacy' });

export default function PrivacyPage() {
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader eyebrow="Legal" title="Privacy policy" description="How Globalantic Training handles your personal data." />
      <div className={s.prose}>
        <h2>What we collect</h2>
        <ul>
          <li>At registration: your full name, email address, phone number, city and (optionally) date of birth, plus your consent to these terms.</li>
          <li>When you apply: your qualification, institution, year of passing and anything you choose to write in your statement.</li>
          <li>While you study: attendance, assignment submissions, marks, trainer feedback and support requests.</li>
          <li>For payments: the amount, status and the payment reference from Razorpay. Card and bank details are handled by Razorpay, not stored by us.</li>
          <li>For security and referral fraud checks: a one-way, non-reversible fingerprint of your IP address. We do not store the raw address.</li>
        </ul>
        <h2>Why we use it</h2>
        <p>
          To run admissions, deliver classes, issue receipts and certificates, prevent fraud and contact you about your studies. We do not sell your
          personal data.
        </p>
        <h2>Who can see it</h2>
        <p>
          Your trainers see your name, email address and learning records for the batches they teach. The admissions and finance teams see the
          records they need for their work. Referrers only see a masked first name for people they referred, never their contact details.
        </p>
        <h2>Your rights</h2>
        <p>
          You can ask to access, correct or erase your personal data, or withdraw consent, as provided by applicable Indian data protection law,
          including the Digital Personal Data Protection Act, 2023. Some records, such as payment receipts, may have to be kept for legal or
          accounting reasons.
        </p>
        <h2>Contact</h2>
        <p>
          To exercise your rights or ask a question, use the <Link className={s.inlineLink} href="/contact">contact form</Link> or raise a support
          request in the student portal.
        </p>
      </div>
    </div>
  );
}
