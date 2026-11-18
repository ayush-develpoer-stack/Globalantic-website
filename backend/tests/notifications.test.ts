/**
 * Admin notification centre: platform events -> per-staff notifications (deduplicated, scoped),
 * business-recipient emails (settings, both addresses, delivery state), the SSE stream with
 * missed-event recovery, the cron dispatcher (email retry + retention), and access control.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, createUser, login, phone, prisma, startApi, staff, testOutbox, tokenFromOutbox, uniq, type Api } from './helpers';
import { emitAdminEvent, emailEvent } from '../src/services/admin-events.service';
import { endAllStreams, streamStats } from '../src/routes/notifications.routes';
import { env } from '../src/config/env';

let api: Api;
let admin: Client;
let adminId: string;
let sales: { client: Client; user: { id: string } };
let editor: Client;
let hr: Client;

const RECIPIENTS = ['info@globalantic.com', 'info.globalantic@gmail.com'];
const N = '/api/notifications';

before(async () => {
  api = await startApi();
  const a = await staff(api.base, 'ADMIN');
  admin = a.client;
  adminId = a.user.id;
  sales = await staff(api.base, 'SALES');
  editor = (await staff(api.base, 'EDITOR')).client;
  hr = (await staff(api.base, 'HR')).client;
  const r = await admin.put(`${N}/settings`, { recipients: RECIPIENTS, emailEnabled: true, emailMinSeverity: 'important', mutedCategories: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
after(() => api.close());

const enquiry = () => ({
  name: 'Notify Tester',
  email: `${uniq('lead')}@example.test`,
  phone: phone(),
  service: 'Web Development',
  message: 'We would like a quote for a new business website, please.',
  elapsedMs: 30_000,
});

test('settings: ADMIN only, validated, audited; recipients come from settings first', async () => {
  assert.equal((await new Client(api.base).get(`${N}/settings`)).status, 401);
  assert.equal((await sales.client.get(`${N}/settings`)).status, 403);
  assert.equal((await hr.put(`${N}/settings`, { emailEnabled: false })).status, 403);
  const bad = await admin.put(`${N}/settings`, { recipients: ['not-an-email'], emailMinSeverity: 'loud', retentionDays: 1 });
  assert.equal(bad.status, 422);
  const s = await admin.get(`${N}/settings`);
  assert.equal(s.status, 200);
  assert.deepEqual(s.body.data.effectiveRecipients, RECIPIENTS);
  assert.ok(s.body.data.categories.includes('lead'));
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'notifications.settings_update', actorId: adminId } }));
});

test('new lead: notification for admin + lead managers, one dedicated email to BOTH business addresses', async () => {
  testOutbox.length = 0;
  const r = await new Client(api.base).post('/api/contact', enquiry());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const leadId = r.body.data.id as string;
  const event = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: `lead.created:${leadId}` } });
  assert.equal(event.category, 'lead');
  assert.equal(event.emailStatus, 'NONE'); // the dedicated lead email carries it, not the generic one
  const copies = await prisma.notification.findMany({ where: { eventId: event.id } });
  const ids = copies.map((c) => c.userId);
  assert.ok(ids.includes(adminId) && ids.includes(sales.user.id), 'admin and unassigned-lead managers are notified');
  assert.ok(copies.every((c) => c.type === 'LEAD' && c.link === `/leads/${leadId}` && !c.body.includes('@')), 'no email address in the preview');
  const alert = testOutbox.filter((m) => /New enquiry/.test(m.subject));
  assert.equal(alert.length, 1);
  assert.deepEqual([...(alert[0].to as string[])].sort(), [...RECIPIENTS].sort());
  const log = await prisma.emailLog.findFirst({ where: { kind: 'lead.admin_alert', entityId: leadId } });
  assert.equal(log?.status, 'SENT');
});

test('an assigned lead is visible only to its owner and admins (no leak to other salespeople)', async () => {
  const other = await staff(api.base, 'SALES');
  const owner = sales.user.id;
  await prisma.leadAssignmentRule.create({ data: { service: 'SEO', assigneeId: owner, active: true } });
  const r = await new Client(api.base).post('/api/contact', { ...enquiry(), service: 'SEO' });
  assert.equal(r.status, 201);
  const event = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: `lead.created:${r.body.data.id}` } });
  const ids = (await prisma.notification.findMany({ where: { eventId: event.id } })).map((n) => n.userId);
  assert.ok(ids.includes(owner) && ids.includes(adminId));
  assert.ok(!ids.includes(other.user.id));
});

test('events are idempotent: the same dedupeKey twice creates one event and one copy per user', async () => {
  const key = `test.dup:${uniq()}`;
  const input = { dedupeKey: key, category: 'system' as const, severity: 'critical' as const, title: 'Duplicate test', body: 'Body' };
  testOutbox.length = 0;
  await emitAdminEvent(input);
  await emitAdminEvent(input);
  assert.equal(await prisma.adminEvent.count({ where: { dedupeKey: key } }), 1);
  const event = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: key } });
  assert.equal(await prisma.notification.count({ where: { eventId: event.id, userId: adminId } }), 1);
  // critical >= important -> generic email once, to both recipients, provider-accepted
  assert.equal(testOutbox.filter((m) => m.subject === '[Globalantic] Duplicate test').length, 1);
  assert.equal(event.emailStatus, 'SENT');
  assert.equal(event.emailAttempts, 1);
  // system events reach ADMIN only
  const hrUser = await prisma.user.findFirstOrThrow({ where: { role: 'HR' } });
  assert.equal(await prisma.notification.count({ where: { eventId: event.id, userId: hrUser.id } }), 0);
});

test('event emails escape the title (an editor-controlled CMS title cannot inject links into staff email)', async () => {
  testOutbox.length = 0;
  const title = 'Post <a href="https://evil.example">Re-authenticate</a>';
  await emitAdminEvent({ dedupeKey: `test.esc:${uniq()}`, category: 'system', severity: 'critical', title, body: 'x' });
  const mail = testOutbox.find((m) => m.subject.includes('Re-authenticate'));
  assert.ok(mail, 'email sent');
  assert.doesNotMatch(String(mail.html), /<a href="https:\/\/evil\.example">/);
  assert.match(String(mail.html), /&lt;a href=/);
});

test('email preferences: below minimum severity or muted category -> in-app only', async () => {
  testOutbox.length = 0;
  await emitAdminEvent({ dedupeKey: `test.info:${uniq()}`, category: 'system', severity: 'info', title: 'Info only', body: 'x' });
  await admin.put(`${N}/settings`, { mutedCategories: ['system'] });
  await emitAdminEvent({ dedupeKey: `test.muted:${uniq()}`, category: 'system', severity: 'critical', title: 'Muted critical', body: 'x' });
  await admin.put(`${N}/settings`, { mutedCategories: [] });
  assert.equal(testOutbox.filter((m) => /Info only|Muted critical/.test(m.subject)).length, 0);
  assert.equal(await prisma.notification.count({ where: { userId: adminId, title: { in: ['Info only', 'Muted critical'] } } }), 2);
});

test('list, filters, unread count, mark read / mark all — scoped to the caller', async () => {
  await emitAdminEvent({ dedupeKey: `test.list1:${uniq()}`, category: 'payment', severity: 'important', title: 'List payment', body: 'p', link: '/payments' });
  await emitAdminEvent({ dedupeKey: `test.list2:${uniq()}`, category: 'hr', severity: 'info', title: 'List hr', body: 'h', audience: 'users.manage' });
  const all = await admin.get(`${N}?pageSize=50`);
  assert.equal(all.status, 200);
  assert.ok(all.body.data.unread >= 2);
  const pay = await admin.get(`${N}?category=payment`);
  assert.ok(pay.body.data.items.length >= 1 && pay.body.data.items.every((n: { category: string }) => n.category === 'payment'));
  const crit = await admin.get(`${N}?severity=critical&unread=true`);
  assert.ok(crit.body.data.items.every((n: { severity: string; readAt: string | null }) => n.severity === 'critical' && n.readAt === null));
  assert.equal((await admin.get(`${N}?category=nope`)).status, 422);
  assert.equal((await admin.get(`${N}?pageSize=500`)).status, 422);

  const target = pay.body.data.items[0].id as string;
  // Another staff member cannot mark the admin's notification.
  assert.equal((await sales.client.post(`${N}/read`, { ids: [target] })).body.data.updated, 0);
  assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: target } })).readAt, null);
  assert.equal((await admin.post(`${N}/read`, { ids: [target] })).body.data.updated, 1);
  assert.ok((await prisma.notification.findUniqueOrThrow({ where: { id: target } })).readAt);
  assert.equal((await admin.post(`${N}/read`, { ids: ['bad'] })).status, 422);
  await admin.post(`${N}/read`, { ids: 'all' });
  assert.equal((await admin.get(`${N}/unread-count`)).body.data.unread, 0);
});

test('access: 401 signed out; students and employees get 403', async () => {
  assert.equal((await new Client(api.base).get(N)).status, 401);
  assert.equal((await new Client(api.base).get(`${N}/stream`)).status, 401);
  const student = await createUser('STUDENT');
  const sc = await login(api.base, student.email);
  assert.equal((await sc.get(N)).status, 403);
  assert.equal((await sc.get(`${N}/stream`)).status, 403);
});

/** Opens the SSE stream with the client's cookie and collects frames. */
function openStream(c: Client, lastEventId?: string) {
  const controller = new AbortController();
  const frames: { event: string; id?: string; data: string }[] = [];
  const ready = (async () => {
    const res = await fetch(`${api.base}${N}/stream`, { headers: { Cookie: c.cookie, 'X-Forwarded-For': c.ip, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) }, signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const f: { event: string; id?: string; data: string } = { event: 'message', data: '' };
            for (const line of raw.split('\n')) {
              if (line.startsWith('event: ')) f.event = line.slice(7);
              else if (line.startsWith('id: ')) f.id = line.slice(4);
              else if (line.startsWith('data: ')) f.data += line.slice(6);
            }
            if (f.data || f.event !== 'message') frames.push(f);
          }
        }
      } catch {
        /* aborted */
      }
    })();
  })();
  const waitFor = async (pred: (f: (typeof frames)[number]) => boolean, ms = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for frame; got ${JSON.stringify(frames)}`);
  };
  return { ready, frames, waitFor, close: () => controller.abort() };
}

test('SSE: new events arrive live; a reconnect with Last-Event-ID replays what was missed; scoped per user', async () => {
  const s = openStream(admin);
  await s.ready;
  await s.waitFor((f) => f.event === 'ready');
  const salesStream = openStream(sales.client);
  await salesStream.ready;
  await salesStream.waitFor((f) => f.event === 'ready');

  await emitAdminEvent({ dedupeKey: `test.live:${uniq()}`, category: 'system', severity: 'info', title: 'Live event', body: 'pushed' });
  const live = await s.waitFor((f) => f.event === 'notification' && JSON.parse(f.data).title === 'Live event');
  assert.ok(live.id);
  // system events are ADMIN-only: the salesperson's stream must not receive it.
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!salesStream.frames.some((f) => f.event === 'notification' && JSON.parse(f.data).title === 'Live event'));
  s.close();
  salesStream.close();

  // While disconnected, two more events happen; reconnecting from the last seen id recovers both.
  await new Promise((r) => setTimeout(r, 20));
  await emitAdminEvent({ dedupeKey: `test.missed1:${uniq()}`, category: 'system', severity: 'info', title: 'Missed one', body: 'x' });
  await emitAdminEvent({ dedupeKey: `test.missed2:${uniq()}`, category: 'system', severity: 'info', title: 'Missed two', body: 'x' });
  const again = openStream(admin, live.id);
  await again.ready;
  await again.waitFor((f) => f.event === 'notification' && JSON.parse(f.data).title === 'Missed one');
  await again.waitFor((f) => f.event === 'notification' && JSON.parse(f.data).title === 'Missed two');
  const ready = await again.waitFor((f) => f.event === 'ready');
  assert.ok(JSON.parse(ready.data).unread >= 2);
  again.close();
});

test('SSE: a client that disconnects while the stream is starting does not leak a connection slot', async () => {
  const baseline = streamStats().total;
  const n = await prisma.notification.findFirstOrThrow({ where: { userId: adminId }, select: { id: true } });
  for (let i = 0; i < 10; i++) {
    const controller = new AbortController();
    // Last-Event-ID makes the server run its replay queries after the headers are flushed;
    // aborting as soon as the headers arrive closes the socket while those queries are pending.
    const res = await fetch(`${api.base}${N}/stream`, { headers: { Cookie: admin.cookie, 'X-Forwarded-For': admin.ip, 'Last-Event-ID': n.id }, signal: controller.signal });
    assert.equal(res.status, 200);
    controller.abort();
  }
  const t0 = Date.now();
  while (streamStats().total !== baseline && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
  assert.equal(streamStats().total, baseline, 'every aborted stream released its slot');
});

test('deliveries: ADMIN sees recent event emails with their delivery state; other staff get 403', async () => {
  await emitAdminEvent({ dedupeKey: `test.delivery:${uniq()}`, category: 'system', severity: 'critical', title: 'Delivery check', body: 'x' });
  const r = await admin.get(`${N}/deliveries`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = (r.body.data as { title: string; emailStatus: string }[]).find((d) => d.title === 'Delivery check');
  assert.equal(row?.emailStatus, 'SENT');
  assert.equal((await sales.client.get(`${N}/deliveries`)).status, 403);
  assert.equal((await hr.get(`${N}/deliveries`)).status, 403);
});

test('shutdown: endAllStreams() ends open streams so server.close() can finish', async () => {
  const s = openStream(admin);
  try {
    await s.ready;
    await s.waitFor((f) => f.event === 'ready');
    assert.ok(streamStats().total >= 1);
    endAllStreams();
    const t0 = Date.now();
    while (streamStats().total !== 0 && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 25));
    assert.equal(streamStats().total, 0, 'every open stream was closed by the server');
  } finally {
    s.close();
  }
});

test('cron dispatch: 404 without CRON_SECRET; retries FAILED emails (bounded) and purges old read copies', async () => {
  assert.equal((await new Client(api.base).post(`${N}/dispatch`)).status, 404);
  const w = env as { cronSecret: string };
  const saved = w.cronSecret;
  w.cronSecret = 'test-cron-secret';
  try {
    assert.equal((await new Client(api.base).req('POST', `${N}/dispatch`, {}, { 'x-cron-secret': 'wrong' })).status, 404);
    const key = `test.retry:${uniq()}`;
    await emitAdminEvent({ dedupeKey: key, category: 'system', severity: 'critical', title: 'Retry me', body: 'x' });
    await prisma.adminEvent.update({ where: { dedupeKey: key }, data: { emailStatus: 'FAILED', emailError: 'simulated' } });
    // An old read copy outside the retention window
    const old = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: key } });
    const copy = await prisma.notification.findFirstOrThrow({ where: { eventId: old.id, userId: adminId } });
    await prisma.notification.update({ where: { id: copy.id }, data: { readAt: new Date(Date.now() - 400 * 86_400_000) } });
    const r = await new Client(api.base).req('POST', `${N}/dispatch`, {}, { 'x-cron-secret': 'test-cron-secret' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.retried >= 1 && r.body.data.sent >= 1);
    assert.ok(r.body.data.purged >= 1);
    const e = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: key } });
    assert.equal(e.emailStatus, 'SENT');
    assert.equal(e.emailAttempts, 2);
    assert.equal(await prisma.notification.count({ where: { id: copy.id } }), 0);
    // Attempts are capped: an event at the limit is never sent again.
    await prisma.adminEvent.update({ where: { dedupeKey: key }, data: { emailStatus: 'FAILED', emailAttempts: 5 } });
    assert.equal(await emailEvent(e.id), null);
  } finally {
    w.cronSecret = saved;
  }
});

test('HR: a leave request notifies leave approvers (HR) and admins, not sales', async () => {
  const email = `${uniq('emp')}@example.test`;
  const created = await hr.post('/api/hr/employees', { name: 'Leave Tester', email, department: 'Ops', designation: 'Associate', employmentType: 'FULL_TIME', joiningDate: '2026-01-05' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const token = tokenFromOutbox(email, 'reset-password');
  await new Client(api.base).post('/api/auth/reset-password', { token, password: PASSWORD });
  const emp = await login(api.base, email);
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const leave = await emp.post('/api/employee/leave', { type: 'CASUAL', startDate: day(10), endDate: day(11), reason: 'Family function' });
  assert.equal(leave.status, 201, JSON.stringify(leave.body));
  const event = await prisma.adminEvent.findUniqueOrThrow({ where: { dedupeKey: `hr.leave_requested:${leave.body.data.id}` } });
  const ids = (await prisma.notification.findMany({ where: { eventId: event.id } })).map((n) => n.userId);
  const hrUser = await prisma.user.findFirstOrThrow({ where: { role: 'HR' } });
  assert.ok(ids.includes(hrUser.id) && ids.includes(adminId));
  assert.ok(!ids.includes(sales.user.id));
  assert.ok(!event.body.includes('Family function'), 'the leave reason (personal) is not in the preview');
});

test('content: publishing a draft notifies cms.publish holders once; an editor asking to publish creates an approval request', async () => {
  const slug = uniq('proj-').toLowerCase();
  const draft = await editor.post('/api/admin/portfolio', { slug, title: 'Event Project', shortDescription: 'Short', description: 'Long description', category: 'Web', published: true });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const id = draft.body.data.id as string;
  assert.ok(await prisma.adminEvent.findFirst({ where: { entityId: id, dedupeKey: { startsWith: 'content.awaiting_approval:' } } }));
  assert.equal((await admin.patch(`/api/admin/portfolio/${id}/publish`)).status, 200);
  assert.equal(await prisma.adminEvent.count({ where: { entityId: id, dedupeKey: { startsWith: 'content.published:' } } }), 1);
  // Publishing something already live is not a new event.
  await admin.patch(`/api/admin/portfolio/${id}/publish`);
  assert.equal(await prisma.adminEvent.count({ where: { entityId: id, dedupeKey: { startsWith: 'content.published:' } } }), 1);
  const editorUser = await prisma.user.findFirstOrThrow({ where: { role: 'EDITOR' } });
  const ev = await prisma.adminEvent.findFirstOrThrow({ where: { entityId: id, dedupeKey: { startsWith: 'content.published:' } } });
  assert.equal(await prisma.notification.count({ where: { eventId: ev.id, userId: editorUser.id } }), 0, 'editors lack cms.publish');
  assert.equal(ev.link, `/website/projects/${id}`);
});

test('content: a stale save (expectedUpdatedAt older than the record) is refused with 409 and changes nothing', async () => {
  const slug = uniq('post-').toLowerCase();
  const p = await admin.post('/api/admin/blog', { slug, title: 'Concurrency', excerpt: 'Excerpt', content: 'Body', coverImageAlt: 'A laptop on a desk' });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const loaded = p.body.data.updatedAt as string;
  assert.equal(p.body.data.coverImageAlt, 'A laptop on a desk');
  const first = await admin.put(`/api/admin/blog/${p.body.data.id}`, { title: 'First save', expectedUpdatedAt: loaded });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const stale = await admin.put(`/api/admin/blog/${p.body.data.id}`, { title: 'Second (stale) save', expectedUpdatedAt: loaded });
  assert.equal(stale.status, 409);
  assert.equal((await prisma.blogPost.findUniqueOrThrow({ where: { id: p.body.data.id } })).title, 'First save');
  // Without the token the existing behaviour (last write wins) is unchanged.
  assert.equal((await admin.put(`/api/admin/blog/${p.body.data.id}`, { title: 'No token' })).status, 200);
});

test('site settings: secondary email is public, updates are audited', async () => {
  const r = await admin.put('/api/admin/settings', { email: 'info@globalantic.com', secondaryEmail: 'info.globalantic@gmail.com', phone: '+91 76978 45157', whatsapp: '917697845157' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pub = await new Client(api.base).get('/api/settings');
  assert.equal(pub.body.data.email, 'info@globalantic.com');
  assert.equal(pub.body.data.secondaryEmail, 'info.globalantic@gmail.com');
  assert.equal(pub.body.data.recipients, undefined);
  const a = await prisma.auditLog.findFirst({ where: { action: 'settings.updated', actorId: adminId }, orderBy: { createdAt: 'desc' } });
  assert.ok(a);
  assert.equal((await admin.put('/api/admin/settings', { secondaryEmail: 'nope' })).status, 422);
});
