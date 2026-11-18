import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Alert, Card, PageHeader } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import { siteUrls } from '@/lib/config';
import s from '@/styles/site.module.css';

export const metadata: Metadata = pageMeta({
  title: 'Fees & payments',
  description: 'How course fees, online payments, receipts and refunds work at Globalantic Training.',
  path: '/fees',
});

export default function FeesPage() {
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader eyebrow="Admissions" title="Fees and payments" description="Course fees are listed on each course and batch page." />
      <div className={s.stack}>
        <Card title="What you pay">
          <div className={s.prose}>
            <p>
              The fee for each course, and any discount, is shown on the course page. Some batches have their own fee, which is shown on the batch.
              The amount you are asked to pay is always calculated by our servers from the fee stored for the batch you applied to.
            </p>
          </div>
        </Card>
        <Card title="When and how to pay">
          <div className={s.prose}>
            <ul>
              <li>You pay only after the admissions team approves your application.</li>
              <li>Pay online from the student portal through Razorpay, our payment provider.</li>
              <li>We never ask for card details on our own pages. The payment form is provided by Razorpay.</li>
              <li>Your seat is confirmed after the payment is verified on our servers. You will get a notification and an email.</li>
            </ul>
          </div>
        </Card>
        <Card title="Receipts">
          <p>A receipt is created automatically after every verified payment. You can view and print it in the student portal under Payments.</p>
        </Card>
        <Card title="Refunds and cancellations">
          <p>
            Refunds follow the Globalantic refund policy. If a batch is cancelled, our admissions team will contact you about the next steps and any refund due.
          </p>
          <div style={{ marginTop: 12 }}>
            <ButtonLink href={`${siteUrls.mainSite}/refund-policy`} external variant="outline" size="sm">
              Read the refund policy
            </ButtonLink>
          </div>
        </Card>
        <Alert tone="info" title="Payment trouble?">
          If money was debited but your portal still shows the payment as pending, do not pay again. Raise a support request from the portal and we will check it with Razorpay.
        </Alert>
      </div>
    </div>
  );
}
