/** Referral programme: attribution, fraud controls, reward lifecycle and authorisation. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  Client,
  applyAndApprove,
  payApplication,
  postWebhook,
  prisma,
  registerStudent,
  seedCourse,
  startApi,
  staff,
  useFakeGateway,
  webhookBody,
  type Api,
  type FakeGateway,
} from './helpers';

let api: Api;
let admin: Client;
let finance: Client;
let trainer: Client;
let gateway: FakeGateway;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  trainer = (await staff(api.base, 'TRAINER')).client;
  gateway = useFakeGateway();
});
after(() => api.close());

/** An enrolled (paid) student who therefore owns a referral code. */
async function enrolledReferrer() {
  const s = await registerStudent(api.base);
  const { batch } = await seedCourse();
  const app = await applyAndApprove(s.client, admin, batch.id);
  await payApplication(s.client, gateway, app.id);
  const dash = await s.client.get('/api/training/student/referrals');
  assert.equal(dash.status, 200);
  return { ...s, code: dash.body.data.code as string, link: dash.body.data.link as string };
}

async function referredAndPaid(code: string) {
  const s = await registerStudent(api.base, { referralCode: code });
  const { batch } = await seedCourse();
  const app = await applyAndApprove(s.client, admin, batch.id);
  const pay = await payApplication(s.client, gateway, app.id);
  return { ...s, app, pay };
}

test('code is generated server-side only after enrollment; link carries no personal data', async () => {
  const fresh = await registerStudent(api.base);
  const before = await fresh.client.get('/api/training/student/referrals');
  assert.equal(before.body.data.eligible, false);
  assert.equal(before.body.data.code, null);

  const r = await enrolledReferrer();
  assert.match(r.code, /^[A-Z2-9]{8}$/);
  assert.equal(r.link, `http://localhost:3001/register?ref=${r.code}`);
  assert.ok(!r.link.includes(r.phone) && !r.link.includes(r.email));
  // Same code every time (one code per student)
  const again = await r.client.get('/api/training/student/referrals');
  assert.equal(again.body.data.code, r.code);
  assert.equal(await prisma.referralCode.count({ where: { userId: r.user.id } }), 1);
  // Reward amount comes from server settings (₹2,000 default)
  assert.equal(again.body.data.rewardAmountPaise, 200_000);
});

test('clicks are tracked (deduplicated per visitor) and bogus codes are rejected', async () => {
  const r = await enrolledReferrer();
  const anon = new Client(api.base);
  assert.equal((await anon.post('/api/training/referrals/click', { code: r.code })).body.data.valid, true);
  await anon.post('/api/training/referrals/click', { code: r.code });
  assert.equal((await anon.post('/api/training/referrals/click', { code: 'ZZZZZZZZ' })).body.data.valid, false);
  assert.equal((await anon.post('/api/training/referrals/click', { code: "<script>" })).body.data.valid, false);
  const code = await prisma.referralCode.findUniqueOrThrow({ where: { code: r.code } });
  assert.equal(await prisma.referralClick.count({ where: { codeId: code.id } }), 1);
  const program = await anon.get('/api/training/referrals/program');
  assert.equal(program.body.data.rewardAmountPaise, 200_000);
});

test('self-referral is rejected (same phone, or alias of the same mailbox)', async () => {
  const r = await enrolledReferrer();
  // Same phone as the referrer → registration is refused for the duplicate phone anyway
  const samePhone = await new Client(api.base).post('/api/auth/register', {
    fullName: 'Me Again',
    email: `other-${Date.now()}@example.test`,
    phone: r.phone,
    password: 'Str0ngPass!',
    consent: true,
    referralCode: r.code,
  });
  assert.equal(samePhone.status, 202);
  assert.equal(await prisma.referralRegistration.count({ where: { referrerId: r.user.id } }), 0);

  // Using one's own code at application time is ignored
  const { batch } = await seedCourse();
  await r.client.post('/api/training/student/applications', { batchId: batch.id, qualification: 'BSc', referralCode: r.code });
  assert.equal(await prisma.referralRegistration.count({ where: { referredUserId: r.user.id } }), 0);

  // Gmail alias of the referrer cannot register at all (canonical duplicate)
  const gmailReferrer = await registerStudent(api.base, { email: `ref.erer${Date.now()}@gmail.com` });
  void gmailReferrer;
  const alias = await new Client(api.base).post('/api/auth/register', {
    fullName: 'Alias',
    email: gmailReferrer.email.replace('ref.erer', 'referer').replace('@', '+x@'),
    phone: `9${String(Date.now()).slice(-9)}`,
    password: 'Str0ngPass!',
    consent: true,
  });
  assert.equal(alias.status, 202);
  assert.equal(await prisma.user.count({ where: { email: gmailReferrer.email.replace('ref.erer', 'referer').replace('@', '+x@') } }), 0);
});

test('full funnel: registered -> verified -> admitted -> paid -> reward (amount from settings)', async () => {
  const r = await enrolledReferrer();
  const referred = await referredAndPaid(r.code);
  const reg = await prisma.referralRegistration.findUniqueOrThrow({ where: { referredUserId: referred.user.id }, include: { reward: true } });
  assert.equal(reg.referrerId, r.user.id);
  assert.equal(reg.stage, 'PAID');
  assert.ok(reg.verifiedAt && reg.admittedAt && reg.paidAt);
  assert.ok(reg.reward);
  assert.equal(reg.reward!.amountPaise, 200_000);
  assert.equal(reg.reward!.status, 'PENDING');
  const days = (reg.reward!.eligibleAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7, 'eligible after the 7-day refund window');

  const dash = await r.client.get('/api/training/student/referrals');
  assert.equal(dash.body.data.stats.paid, 1);
  assert.equal(dash.body.data.stats.rewards.PENDING.amountPaise, 200_000);
  // Referred student's PII is masked
  const shown = JSON.stringify(dash.body.data.referrals);
  assert.ok(!shown.includes(referred.email) && !shown.includes(referred.phone));
});

test('duplicate rewards are impossible: second payment / second course / webhook replay', async () => {
  const r = await enrolledReferrer();
  const referred = await referredAndPaid(r.code);
  // Second course purchase by the same referred student
  const { batch } = await seedCourse();
  const app2 = await applyAndApprove(referred.client, admin, batch.id);
  await payApplication(referred.client, gateway, app2.id);
  // Replay of the first capture webhook
  const p = gateway.payments.get(referred.pay.paymentId)!;
  await postWebhook(api.base, webhookBody('payment.captured', p), { eventId: 'evt_dup_reward' });
  await postWebhook(api.base, webhookBody('payment.captured', p), { eventId: 'evt_dup_reward' });
  assert.equal(await prisma.referralReward.count({ where: { referredUserId: referred.user.id } }), 1);
});

test('reward amount cannot be set by the client; settings changes need ADMIN and apply to new rewards only', async () => {
  const r = await enrolledReferrer();
  const referred = await referredAndPaid(r.code);
  const reward = await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: referred.user.id } });

  // Students/trainers/finance cannot change settings
  for (const c of [r.client, trainer, finance]) {
    const res = await c.put('/api/training/admin/referrals/settings', { rewardAmountPaise: 999_999, reason: 'pls' });
    assert.equal(res.status, 403);
  }
  // Extra fields in the review payload are ignored
  await prisma.referralReward.update({ where: { id: reward.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
  const approve = await finance.post(`/api/training/admin/referrals/rewards/${reward.id}/review`, { decision: 'APPROVE', amountPaise: 999_999 });
  assert.equal(approve.status, 200);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } })).amountPaise, 200_000);

  // Admin changes the amount: existing reward keeps its snapshot, new ones use the new amount
  const set = await admin.put('/api/training/admin/referrals/settings', { rewardAmountPaise: 250_000, reason: 'Diwali campaign' });
  assert.equal(set.status, 200);
  const r2 = await enrolledReferrer();
  const ref2 = await referredAndPaid(r2.code);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: ref2.user.id } })).amountPaise, 250_000);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } })).amountPaise, 200_000);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'referral.settings_updated', reason: 'Diwali campaign' } }));
  await admin.put('/api/training/admin/referrals/settings', { rewardAmountPaise: 200_000, reason: 'Campaign ended' });
});

test('review rules: window, reasons, authorisation, payout once', async () => {
  const r = await enrolledReferrer();
  const referred = await referredAndPaid(r.code);
  const reward = await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: referred.user.id } });
  const path = `/api/training/admin/referrals/rewards/${reward.id}`;

  assert.equal((await r.client.post(`${path}/review`, { decision: 'APPROVE' })).status, 403, 'referrer cannot approve');
  assert.equal((await trainer.post(`${path}/review`, { decision: 'APPROVE' })).status, 403);
  const early = await admin.post(`${path}/review`, { decision: 'APPROVE' });
  assert.equal(early.status, 409, 'cannot approve inside the refund window');
  assert.equal((await admin.post(`${path}/payout`, { method: 'UPI', reference: 'UPI-1' })).status, 409, 'cannot pay an unapproved reward');

  await prisma.referralReward.update({ where: { id: reward.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
  assert.equal((await admin.post(`${path}/review`, { decision: 'APPROVE' })).status, 200);
  assert.equal((await admin.post(`${path}/review`, { decision: 'APPROVE' })).status, 409, 'no double approval');
  const pay = await finance.post(`${path}/payout`, { method: 'UPI', reference: 'UPI-REF-77' });
  assert.equal(pay.status, 201);
  assert.equal((await finance.post(`${path}/payout`, { method: 'UPI', reference: 'UPI-REF-78' })).status, 409, 'paid once');
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { id: reward.id } })).status, 'PAID');
  const trail = await admin.get('/api/training/admin/referrals/audit');
  assert.ok(trail.body.data.items.some((l: { entityId: string; action: string }) => l.entityId === reward.id && l.action === 'referral.reward_paid'));

  // Rejection needs a reason
  const r3 = await enrolledReferrer();
  const ref3 = await referredAndPaid(r3.code);
  const rw3 = await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: ref3.user.id } });
  assert.equal((await admin.post(`/api/training/admin/referrals/rewards/${rw3.id}/review`, { decision: 'REJECT' })).status, 422);
  assert.equal((await admin.post(`/api/training/admin/referrals/rewards/${rw3.id}/review`, { decision: 'REJECT', reason: 'Duplicate household' })).status, 200);
});

test('refund cancels a pending reward; fraud confirmation disqualifies', async () => {
  const r = await enrolledReferrer();
  const referred = await referredAndPaid(r.code);
  const p = gateway.payments.get(referred.pay.paymentId)!;
  await postWebhook(api.base, webhookBody('refund.processed', { ...p, status: 'refunded' }));
  const reward = await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: referred.user.id } });
  assert.equal(reward.status, 'CANCELLED');

  // Fraud review flow
  const r2 = await enrolledReferrer();
  const ref2 = await referredAndPaid(r2.code);
  const reg = await prisma.referralRegistration.findUniqueOrThrow({ where: { referredUserId: ref2.user.id } });
  const review = await prisma.fraudReview.create({ data: { registrationId: reg.id, signals: ['MANUAL_FLAG'] } });
  const rw = await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: ref2.user.id } });
  await prisma.referralReward.update({ where: { id: rw.id }, data: { eligibleAt: new Date(Date.now() - 1000) } });
  assert.equal((await admin.post(`/api/training/admin/referrals/rewards/${rw.id}/review`, { decision: 'APPROVE' })).status, 409, 'open fraud review blocks approval');
  const resolve = await finance.post(`/api/training/admin/referrals/fraud-reviews/${review.id}/resolve`, { outcome: 'CONFIRMED', notes: 'Same device as referrer' });
  assert.equal(resolve.status, 200);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { id: rw.id } })).status, 'REJECTED');
  assert.equal((await prisma.referralRegistration.findUniqueOrThrow({ where: { id: reg.id } })).stage, 'DISQUALIFIED');
});

test('same network as the referrer -> fraud signal and manual review', async () => {
  const r = await enrolledReferrer();
  const s = await registerStudent(api.base, { referralCode: r.code, ip: r.client.ip });
  const reg = await prisma.referralRegistration.findUniqueOrThrow({ where: { referredUserId: s.user.id } });
  assert.deepEqual(reg.fraudSignals, ['SAME_IP_AS_REFERRER']);
  assert.equal(await prisma.fraudReview.count({ where: { registrationId: reg.id, status: 'OPEN' } }), 1);
  const { batch } = await seedCourse();
  const app = await applyAndApprove(s.client, admin, batch.id);
  await payApplication(s.client, gateway, app.id);
  assert.equal((await prisma.referralReward.findUniqueOrThrow({ where: { referredUserId: s.user.id } })).status, 'UNDER_REVIEW');
});

test('admin referral views require permission and expose fraud signals', async () => {
  for (const p of ['/api/training/admin/referrals/overview', '/api/training/admin/referrals/registrations', '/api/training/admin/referrals/fraud-reviews']) {
    assert.equal((await admin.get(p)).status, 200, p);
    assert.equal((await trainer.get(p)).status, 403, p);
  }
});
