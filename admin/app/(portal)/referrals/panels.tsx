'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { FRAUD_REVIEW_STATUSES, PAYOUT_METHODS, REFERRAL_STAGES, REWARD_STATUSES, enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Input,
  Modal,
  Pagination,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  Textarea,
  Toolbar,
  formatDate,
  formatDateTime,
  formatINR,
  rupeesToPaise,
  useAsync,
  useSession,
  useToast,
} from '@globalantic/ui';
import { enumOptions, paiseToRupees, useConfirm } from '@/lib/admin';
import { JsonDiff, actionLabel } from '@/lib/AuditHistory';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function Signals({ signals }: { signals: unknown }) {
  const list = Array.isArray(signals) ? (signals as string[]) : [];
  if (!list.length) return <span className={s.small}>None</span>;
  return <>{list.map((x) => <span key={x} className={s.signal}>{x}</span>)}</>;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewPanel() {
  const state = useAsync(() => api().admin.referralOverview(), 'ref-overview');
  return (
    <AsyncView state={state}>
      {(o) => (
        <div className={s.stack}>
          <StatGrid>
            <Stat label="Reward per referral" value={formatINR(o.settings.rewardAmountPaise)} hint={o.settings.enabled ? 'Programme enabled' : 'Programme disabled'} tone={o.settings.enabled ? 'primary' : 'warning'} />
            <Stat label="Referral codes" value={o.codes} />
            <Stat label="Link clicks" value={o.clicks} hint="Unique visitors per day" />
            <Stat label="Open fraud reviews" value={o.openFraudReviews} tone={o.openFraudReviews ? 'danger' : undefined} />
          </StatGrid>
          <div className={s.grid2}>
            <Card title="Referral funnel">
              <dl className={s.list}>
                {REFERRAL_STAGES.map((st) => (
                  <div key={st} className={s.rowBetween}>
                    <dt className={s.muted}>{enumLabel(st)}</dt>
                    <dd className={s.strong}>{o.stages[st] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="Rewards">
              <dl className={s.list}>
                {REWARD_STATUSES.map((st) => (
                  <div key={st} className={s.rowBetween}>
                    <dt className={s.muted}>{enumLabel(st)}</dt>
                    <dd className={s.strong}>{o.rewards[st]?.count ?? 0} · {formatINR(o.rewards[st]?.amountPaise ?? 0)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}
    </AsyncView>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsForm({ settings, editable, onSaved }: { settings: Row; editable: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    enabled: Boolean(settings.enabled),
    reward: paiseToRupees(settings.rewardAmountPaise),
    requireActiveEnrollment: Boolean(settings.requireActiveEnrollment),
    minPaid: paiseToRupees(settings.minPaidAmountPaise),
    refundWindowDays: String(settings.refundWindowDays),
    attributionWindowDays: String(settings.attributionWindowDays),
    maxPerMonth: settings.maxRewardsPerReferrerPerMonth === null ? '' : String(settings.maxRewardsPerReferrerPerMonth),
    reason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const local: Record<string, string> = {};
    const rewardAmountPaise = rupeesToPaise(v.reward);
    const minPaidAmountPaise = rupeesToPaise(v.minPaid || '0');
    if (!Number.isFinite(rewardAmountPaise) || rewardAmountPaise < 0) local.rewardAmountPaise = 'Enter a valid amount in rupees';
    if (!Number.isFinite(minPaidAmountPaise) || minPaidAmountPaise < 0) local.minPaidAmountPaise = 'Enter a valid amount in rupees';
    if (v.reason.trim().length < 3) local.reason = 'A reason is required';
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      await api().admin.updateReferralSettings({
        enabled: v.enabled,
        rewardAmountPaise,
        requireActiveEnrollment: v.requireActiveEnrollment,
        minPaidAmountPaise,
        refundWindowDays: Number(v.refundWindowDays),
        attributionWindowDays: Number(v.attributionWindowDays),
        maxRewardsPerReferrerPerMonth: v.maxPerMonth.trim() === '' ? null : Number(v.maxPerMonth),
        reason: v.reason,
      });
      toast('Referral settings saved');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Card title="Programme settings">
        <div className={s.stack}>
          {!editable && <Alert tone="info">Only administrators can change referral settings. You have read-only access.</Alert>}
          <Alert tone="info">Changes apply to rewards created from now on. Existing rewards keep the amount recorded when they were created.</Alert>
          {error && <Alert tone="danger">{error}</Alert>}
          <fieldset disabled={!editable} className={s.formGrid}>
            <div className={s.toggleRow}>
              <input id="ref-enabled" type="checkbox" checked={v.enabled} onChange={set('enabled')} />
              <label htmlFor="ref-enabled">Programme enabled</label>
            </div>
            <div className={s.toggleRow}>
              <input id="ref-enrolled" type="checkbox" checked={v.requireActiveEnrollment} onChange={set('requireActiveEnrollment')} />
              <label htmlFor="ref-enrolled">Referrer must be enrolled</label>
            </div>
            <Input label="Reward amount (₹)" inputMode="decimal" value={v.reward} onChange={set('reward')} error={errors.rewardAmountPaise} />
            <Input label="Minimum qualifying payment (₹)" inputMode="decimal" value={v.minPaid} onChange={set('minPaid')} error={errors.minPaidAmountPaise} />
            <Input label="Refund window (days)" type="number" min={0} max={365} value={v.refundWindowDays} onChange={set('refundWindowDays')} error={errors.refundWindowDays} hint="Rewards can be approved only after this many days" />
            <Input label="Attribution window (days)" type="number" min={1} max={365} value={v.attributionWindowDays} onChange={set('attributionWindowDays')} error={errors.attributionWindowDays} />
            <Input label="Max rewards per referrer per month" type="number" min={1} value={v.maxPerMonth} onChange={set('maxPerMonth')} error={errors.maxRewardsPerReferrerPerMonth} hint="Leave empty for no cap (extra rewards go to review)" />
            <Textarea label="Reason for change" required containerClassName={s.span2} value={v.reason} onChange={set('reason')} error={errors.reason} rows={2} maxLength={500} />
          </fieldset>
          {editable && <div className={s.actions}><Button type="submit" loading={pending}>Save settings</Button></div>}
          <p className={s.small}>Last updated {formatDateTime(settings.updatedAt)}</p>
        </div>
      </Card>
    </form>
  );
}

export function SettingsPanel() {
  const { can } = useSession();
  const state = useAsync(() => api().admin.referralSettings(), 'ref-settings');
  return <AsyncView state={state}>{(st) => <SettingsForm key={st.updatedAt} settings={st} editable={can('referrals.settings')} onSaved={state.reload} />}</AsyncView>;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

function PayoutModal({ reward, onClose, onDone }: { reward: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.recordPayout(reward.id, { method, reference, notes: notes || undefined });
      toast('Payout recorded');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Record payout of ${formatINR(reward.amountPaise)}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={reference.trim().length < 3}>Record payout</Button></>}>
      <Alert tone="warning">Record the payout only after the money has been sent to {reward.referrer.name}. The amount is fixed by the server and the action is audited.</Alert>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={enumOptions(PAYOUT_METHODS)} />
      <Input label="Transaction reference" required value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} hint="UPI / bank transaction id" />
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
    </Modal>
  );
}

export function RewardsPanel() {
  const { can, user } = useSession();
  const { ask, dialog } = useConfirm();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [payout, setPayout] = useState<Row | null>(null);
  const state = useAsync(() => api().admin.referralRewards({ status, page, pageSize: 20 }), `rewards-${status}-${page}`);

  const review = (r: Row, decision: 'APPROVE' | 'REJECT' | 'UNDER_REVIEW') =>
    ask({
      title: decision === 'APPROVE' ? `Approve ${formatINR(r.amountPaise)} for ${r.referrer.name}?` : decision === 'REJECT' ? 'Reject this reward?' : 'Move to manual review?',
      message: decision === 'APPROVE' ? 'Allowed only after the refund window, with no open fraud review and a payment that is still paid.' : decision === 'REJECT' ? 'The referrer is notified with your reason.' : undefined,
      confirmLabel: decision === 'APPROVE' ? 'Approve' : decision === 'REJECT' ? 'Reject' : 'Move to review',
      tone: decision === 'REJECT' ? 'danger' : 'primary',
      requireReason: decision === 'REJECT',
      reasonLabel: 'Rejection reason',
      onConfirm: async (reason) => {
        await api().admin.reviewReward(r.id, decision, reason || undefined);
        state.reload();
      },
      success: 'Reward updated',
    });

  return (
    <>
      <Toolbar>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={enumOptions(REWARD_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No rewards', description: 'Rewards are created automatically when a referred student’s payment is verified.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Referral rewards"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'ref', header: 'Referrer', render: (r) => (<><Link className={s.link} href={`/students/${r.referrer.id}`}>{r.referrer.name}</Link><div className={s.small}>{r.referrer.email}</div></>) },
                { key: 'who', header: 'Referred student', hideOnMobile: true, render: (r) => (<><div>{r.registration.referred.name}</div><div className={s.small}>{r.registration.referred.email}</div></>) },
                { key: 'amt', header: 'Amount', render: (r) => (<><div className={s.strong}>{formatINR(r.amountPaise)}</div><div className={s.small}>payment {formatINR(r.payment.amountPaise)} · <StatusBadge status={r.payment.status} /></div></>) },
                { key: 'elig', header: 'Eligible from', hideOnMobile: true, render: (r) => formatDate(r.eligibleAt) },
                { key: 'sig', header: 'Fraud signals', hideOnMobile: true, render: (r) => (<><Signals signals={r.registration.fraudSignals} />{r.fraudReviews?.some((f: Row) => f.status === 'OPEN') && <div className={s.small}>Open fraud review</div>}</>) },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.rejectionReason && <div className={s.small}>{r.rejectionReason}</div>}{r.payout && <div className={s.small}>{enumLabel(r.payout.method)} · {r.payout.reference}</div>}</>) },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) => {
                    const own = r.referrer.id === user.id;
                    return (
                      <div className={s.actions}>
                        {can('referrals.review') && !own && ['PENDING', 'UNDER_REVIEW'].includes(r.status) && <Button size="sm" onClick={() => review(r, 'APPROVE')}>Approve</Button>}
                        {can('referrals.review') && !own && r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => review(r, 'UNDER_REVIEW')}>Review</Button>}
                        {can('referrals.review') && !own && ['PENDING', 'UNDER_REVIEW', 'APPROVED'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => review(r, 'REJECT')}>Reject</Button>}
                        {can('referrals.payout') && !own && r.status === 'APPROVED' && <Button size="sm" variant="outline" onClick={() => setPayout(r)}>Pay out</Button>}
                      </div>
                    );
                  },
                },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {payout && <PayoutModal reward={payout} onClose={() => setPayout(null)} onDone={state.reload} />}
      {dialog}
    </>
  );
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export function RegistrationsPanel() {
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const state = useAsync(() => api().admin.referralRegistrations({ stage, page, pageSize: 20 }), `regs-${stage}-${page}`);
  return (
    <>
      <Toolbar>
        <Select label="Stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }} placeholder="All stages" options={enumOptions(REFERRAL_STAGES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No referred registrations yet' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Referral history"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'ref', header: 'Referrer', render: (r) => (<><Link className={s.link} href={`/students/${r.referrer.id}`}>{r.referrer.name}</Link><div className={s.mono}>{r.code.code}</div></>) },
                { key: 'who', header: 'Referred', render: (r) => (<><Link className={s.link} href={`/students/${r.referred.id}`}>{r.referred.name}</Link><div className={s.small}>{r.referred.email}</div></>) },
                { key: 'when', header: 'Registered', hideOnMobile: true, render: (r) => formatDate(r.registeredAt) },
                { key: 'sig', header: 'Signals', hideOnMobile: true, render: (r) => <Signals signals={r.fraudSignals} /> },
                { key: 'rw', header: 'Reward', hideOnMobile: true, render: (r) => (r.reward ? <>{formatINR(r.reward.amountPaise)} <StatusBadge status={r.reward.status} /></> : '—') },
                { key: 'st', header: 'Stage', render: (r) => (<><StatusBadge status={r.stage} />{r.disqualifiedReason && <div className={s.small}>{r.disqualifiedReason}</div>}</>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fraud reviews
// ---------------------------------------------------------------------------

function ResolveModal({ review, onClose, onDone }: { review: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<'CLEARED' | 'CONFIRMED'>('CLEARED');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.resolveFraud(review.id, outcome, notes);
      toast('Fraud review resolved');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Resolve fraud review" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={outcome === 'CONFIRMED' ? 'danger' : 'primary'} onClick={submit} loading={pending} disabled={notes.trim().length < 3}>{outcome === 'CONFIRMED' ? 'Confirm fraud' : 'Clear review'}</Button></>}>
      <DescriptionList items={[{ label: 'Signals', value: <Signals signals={review.signals} /> }, { label: 'Referrer', value: review.registration?.referrer?.name }, { label: 'Referred', value: review.registration?.referred?.name }]} />
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as 'CLEARED' | 'CONFIRMED')} options={[{ value: 'CLEARED', label: 'Cleared — legitimate referral' }, { value: 'CONFIRMED', label: 'Confirmed — disqualify and reject rewards' }]} />
      {outcome === 'CONFIRMED' && <Alert tone="warning">Confirming disqualifies the referral and rejects any unpaid reward.</Alert>}
      <Textarea label="Notes" required value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} />
    </Modal>
  );
}

export function FraudPanel() {
  const { can } = useSession();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<Row | null>(null);
  const state = useAsync(() => api().admin.fraudReviews({ status, page, pageSize: 20 }), `fraud-${status}-${page}`);
  return (
    <>
      <Toolbar>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={enumOptions(FRAUD_REVIEW_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No fraud reviews', description: 'Reviews open automatically on suspicious signals (same network, high velocity, monthly cap, refunds after payout).' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Fraud reviews"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'sig', header: 'Signals', render: (r) => <Signals signals={r.signals} /> },
                { key: 'ref', header: 'Referrer → referred', render: (r) => (r.registration ? <><div>{r.registration.referrer.name}</div><div className={s.small}>→ {r.registration.referred.name}</div></> : '—') },
                { key: 'rw', header: 'Reward', hideOnMobile: true, render: (r) => (r.reward ? <>{formatINR(r.reward.amountPaise)} <StatusBadge status={r.reward.status} /></> : '—') },
                { key: 'when', header: 'Opened', hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.notes && <div className={s.small}>{r.notes}</div>}</>) },
                { key: 'x', header: <span className="sr-only">Actions</span>, render: (r) => (r.status === 'OPEN' && can('referrals.review') ? <Button size="sm" variant="outline" onClick={() => setResolving(r)}>Resolve</Button> : null) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {resolving && <ResolveModal review={resolving} onClose={() => setResolving(null)} onDone={state.reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function ReferralAuditPanel() {
  const [page, setPage] = useState(1);
  const state = useAsync(() => api().admin.referralAudit({ page, pageSize: 25 }), `ref-audit-${page}`);
  return (
    <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No referral activity yet' }}>
      {(d) => (
        <>
          <DataTable<Row>
            caption="Referral audit log"
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: 'When', render: (r) => formatDateTime(r.createdAt) },
              { key: 'act', header: 'Action', render: (r) => (<><div className={s.strong}>{actionLabel(r.action)}</div><div className={s.mono}>{r.entityType} {r.entityId}</div></>) },
              { key: 'who', header: 'By', hideOnMobile: true, render: (r) => r.actor?.name ?? (r.actorRole === 'SYSTEM' || !r.actorRole ? 'System' : r.actorRole) },
              { key: 'why', header: 'Details', render: (r) => (<>{r.reason && <div className={s.small}>Reason: {r.reason}</div>}<JsonDiff before={r.before} after={r.after} /></>) },
            ]}
          />
          <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
        </>
      )}
    </AsyncView>
  );
}
