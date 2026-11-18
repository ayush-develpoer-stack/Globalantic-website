'use client';

import { useEffect, useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { enumLabel, type RewardStatus } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Stat,
  StatGrid,
  StatusBadge,
  formatDate,
  formatINR,
  useAsync,
  useToast,
} from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

const REWARD_ORDER: RewardStatus[] = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'];

export default function ReferralsPage() {
  usePageTitle('Refer & earn');
  const toast = useToast();
  const state = useAsync(() => api().student.referrals(), 'referrals');
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast('Could not copy — select and copy it manually', 'danger');
    }
  };

  return (
    <AsyncView state={state} loadingRows={4}>
      {(d) => (
        <div className={s.stack}>
          <PageHeader
            title="Refer & earn"
            description={`Recommend Globalantic Training to friends. When someone you refer completes their admission payment, you can earn ${formatINR(d.rewardAmountPaise)} after a review.`}
          />

          {!d.programEnabled && <Alert tone="warning">The referral programme is currently paused. Existing rewards are not affected.</Alert>}

          {!d.code ? (
            <Card>
              <EmptyState title="Your referral code is not available yet" description={d.reason ?? 'Referral codes unlock once you are enrolled in a course.'} />
            </Card>
          ) : (
            <>
              {!d.eligible && d.reason && <Alert tone="warning">{d.reason}</Alert>}
              <Card title="Your referral link">
                <div className={s.stackSm}>
                  <div className={s.row}>
                    <span className={s.code} aria-label="Referral code">
                      {d.code}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => void copy(d.code!, 'Code')}>
                      <Copy size={16} aria-hidden /> Copy code
                    </Button>
                  </div>
                  <div className={s.urlBox}>{d.link}</div>
                  <div className={s.row}>
                    <Button size="sm" onClick={() => void copy(d.link!, 'Link')}>
                      <Copy size={16} aria-hidden /> Copy link
                    </Button>
                    {canShare && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void navigator
                            .share({ title: 'Globalantic Training', text: 'Join me at Globalantic Training — register with my link:', url: d.link! })
                            .catch(() => {})
                        }
                      >
                        <Share2 size={16} aria-hidden /> Share
                      </Button>
                    )}
                  </div>
                  <p className={s.small}>
                    Rewards are reviewed after a {d.refundWindowDays ?? 7}-day refund window. Self-referrals, duplicate accounts and refunded payments do not qualify.
                  </p>
                </div>
              </Card>

              {d.stats && (
                <>
                  <StatGrid>
                    <Stat label="Link clicks" value={d.stats.clicks} />
                    <Stat label="Registrations" value={d.stats.registrations} />
                    <Stat label="Verified" value={d.stats.verified} />
                    <Stat label="Admitted" value={d.stats.admitted} />
                    <Stat label="Paid" value={d.stats.paid} tone="primary" />
                  </StatGrid>
                  <Card title="Rewards">
                    {Object.keys(d.stats.rewards).length === 0 ? (
                      <p className={s.muted}>No rewards yet.</p>
                    ) : (
                      <StatGrid>
                        {REWARD_ORDER.filter((st) => d.stats!.rewards[st]).map((st) => (
                          <Stat key={st} label={enumLabel(st)} value={formatINR(d.stats!.rewards[st]!.amountPaise)} hint={`${d.stats!.rewards[st]!.count} reward(s)`} tone={st === 'PAID' ? 'success' : st === 'REJECTED' ? 'danger' : undefined} />
                        ))}
                      </StatGrid>
                    )}
                  </Card>
                </>
              )}

              <Card title="People you referred">
                {d.referrals.length === 0 ? (
                  <EmptyState title="No referrals yet" description="Share your link to get started." />
                ) : (
                  <DataTable
                    caption="People you referred"
                    rows={d.referrals}
                    rowKey={(r) => r.id}
                    columns={[
                      { key: 'n', header: 'Name', render: (r) => r.name },
                      { key: 'd', header: 'Joined', hideOnMobile: true, render: (r) => formatDate(r.registeredAt) },
                      { key: 's', header: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
                      {
                        key: 'r',
                        header: 'Reward',
                        render: (r) =>
                          r.reward ? (
                            <span className={s.row}>
                              <StatusBadge status={r.reward.status} /> {formatINR(r.reward.amountPaise)}
                            </span>
                          ) : (
                            '—'
                          ),
                      },
                      {
                        key: 'x',
                        header: 'Note',
                        hideOnMobile: true,
                        render: (r) => (r.reward?.rejectionReason ? r.reward.rejectionReason : r.reward && r.reward.status === 'PENDING' ? `Reviewable from ${formatDate(r.reward.eligibleAt)}` : '—'),
                      },
                    ]}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </AsyncView>
  );
}
