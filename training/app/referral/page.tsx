import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Alert, Card, ErrorState, PageHeader, formatINR } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import { siteUrls } from '@/lib/config';
import { load } from '@/lib/server';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Referral programme',
  description: 'Refer friends to Globalantic Training and earn a reward when they join.',
  path: '/referral',
});

export default async function ReferralPage() {
  const program = await load((a) => a.catalog.referralProgram());
  if (!program.data) {
    return (
      <div className={`container ${s.page}`}>
        <ErrorState title="Referral details could not be loaded" message={program.error} />
      </div>
    );
  }
  const p = program.data;
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader
        eyebrow="Refer & earn"
        title="Referral programme"
        description={p.enabled ? `Earn ${formatINR(p.rewardAmountPaise)} for every friend who joins through your link.` : 'The referral programme is currently paused.'}
      />
      {!p.enabled && <Alert tone="info">New referrals are not being rewarded right now. Rewards already earned are not affected.</Alert>}
      <div className={s.stack}>
        <Card title="How it works">
          <ol className={s.steps} style={{ listStyle: 'none' }}>
            {[
              { t: 'Get your link', d: p.requireActiveEnrollment ? 'Once you are enrolled, your personal referral link appears in the student portal.' : 'Your personal referral link appears in the student portal.' },
              { t: 'Share it', d: 'Your friend registers through your link. Your link never contains your phone number or email.' },
              { t: 'They join', d: 'Your friend is admitted and completes a verified admission payment.' },
              { t: 'You are rewarded', d: `After the ${p.refundWindowDays}-day refund window, the reward is reviewed and paid out.` },
            ].map((x, i) => (
              <li key={x.t} className={s.step}>
                <span className={s.stepNum} aria-hidden>
                  {i + 1}
                </span>
                <h3>{x.t}</h3>
                <p>{x.d}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Rules">
          <div className={s.prose}>
            <ul>
              <li>The reward is {formatINR(p.rewardAmountPaise)} per successful referral. The amount in force when the reward is created applies.</li>
              <li>One reward per referred student, however many courses they take.</li>
              <li>You cannot refer yourself, including through a second account, email alias or shared phone number.</li>
              <li>Rewards are reviewed before payout. Referrals that look duplicated or fraudulent may be rejected.</li>
              <li>If the referred student&apos;s payment is refunded, the pending reward is cancelled.</li>
            </ul>
          </div>
        </Card>
        <div className={s.row}>
          <ButtonLink href={`${siteUrls.internPortal}/referrals`} external>
            Open my referral dashboard
          </ButtonLink>
          <ButtonLink href="/courses" variant="outline">
            Browse courses
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
