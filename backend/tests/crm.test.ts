/** Sales engine: public enquiries -> CRM leads (attribution, spam, duplicates, assignment, emails) and the staff CRM. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { landingPath, leadChannel } from '../src/lib/channel';
import { Client, phone, prisma, startApi, staff, testOutbox, uniq, type Api } from './helpers';

let api: Api;
let admin: Client;
let adminId: string;

before(async () => {
  api = await startApi();
  const a = await staff(api.base, 'ADMIN');
  admin = a.client;
  adminId = a.user.id;
});
after(() => api.close());

const enquiry = (extra: Record<string, unknown> = {}) => ({
  name: 'Priya Sharma',
  email: `${uniq('lead')}@example.test`,
  phone: phone(),
  company: 'Acme Retail',
  service: 'Web Development',
  budget: '₹1L–₹5L',
  timeline: '1–3 months',
  message: 'We need a new e-commerce website with online payments and an admin panel.',
  source: 'service_page:web-development',
  landingPage: '/services/web-development?utm_source=google',
  referrer: 'https://www.google.com/',
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'web-dev-oct',
  marketingConsent: true,
  contactPreference: 'whatsapp',
  elapsedMs: 45_000,
  ...extra,
});

async function submit(body: Record<string, unknown>) {
  return new Client(api.base).post('/api/contact', body);
}

test('a valid enquiry becomes a lead with reference, attribution, consent, follow-up and emails', async () => {
  const body = enquiry();
  testOutbox.length = 0;
  const r = await submit(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.data.reference, /^LEAD-\d{4}-\d{6}$/);
  const lead = await prisma.contactLead.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { activities: true } });
  assert.equal(lead.status, 'NEW');
  assert.equal(lead.utmSource, 'google');
  assert.equal(lead.utmCampaign, 'web-dev-oct');
  assert.equal(lead.source, 'service_page:web-development');
  assert.equal(lead.marketingConsent, true);
  assert.ok(lead.consentAt);
  assert.ok(lead.followUpAt && lead.followUpAt.getTime() > Date.now() + 23 * 3_600_000);
  assert.ok(lead.ipHash && !lead.ipHash.includes('.'), 'only a hash of the IP is stored');
  assert.equal(lead.activities[0].type, 'CREATED');
  const ack = testOutbox.find((m) => m.to === body.email);
  assert.ok(ack, 'acknowledgement sent');
  assert.match(ack!.subject, /LEAD-/);
  assert.ok(ack!.html.includes('https://wa.me/917697845157?text='));
  assert.ok(ack!.html.includes('Web Development'));
  const team = testOutbox.find((m) => m.to !== body.email && m.subject.startsWith('New enquiry'));
  assert.ok(team, 'team alert sent');
  assert.ok(team!.html.includes('web-dev-oct'));
  // An admin got an in-app alert for the unassigned lead
  assert.ok(await prisma.notification.findFirst({ where: { userId: adminId, type: 'LEAD' } }));
});

test('validation, spam checks and rate-limit-safe errors', async () => {
  assert.equal((await submit(enquiry({ email: 'not-an-email' }))).status, 422);
  assert.equal((await submit(enquiry({ message: 'short' }))).status, 422);
  assert.equal((await submit(enquiry({ source: 'bad source!' }))).status, 422);
  const links = await submit(enquiry({ message: 'see http://a.example http://b.example http://c.example http://d.example please' }));
  assert.equal(links.status, 422);
  assert.ok(links.body.errors?.some((e) => e.field === 'message'));
  const before = await prisma.contactLead.count();
  const honeypot = await submit(enquiry({ website: 'http://spam.example' }));
  assert.equal(honeypot.status, 201, 'bots get the same answer');
  assert.equal(honeypot.body.data.reference, null);
  assert.equal((await submit(enquiry({ elapsedMs: 400 }))).status, 201);
  assert.equal(await prisma.contactLead.count(), before, 'spam is not stored');
  // Older clients (no new fields) keep working
  const legacy = await submit({ name: 'Legacy Form', email: `${uniq('legacy')}@example.test`, message: 'Hello, I would like a quote for an app.' });
  assert.equal(legacy.status, 201);
});

test('repeat enquiries from the same person are linked, not lost', async () => {
  const first = await submit(enquiry({ email: 'Repeat.Person+site@gmail.com' }));
  const second = await submit(enquiry({ email: 'repeatperson@gmail.com', service: 'Mobile App Development', message: 'Also interested in a companion mobile app.' }));
  assert.equal(second.status, 201);
  const dup = await prisma.contactLead.findUniqueOrThrow({ where: { id: second.body.data.id } });
  assert.equal(dup.duplicateOfId, first.body.data.id);
  assert.ok(await prisma.leadActivity.findFirst({ where: { leadId: first.body.data.id, type: 'REPEAT_ENQUIRY' } }));
  const list = await admin.get('/api/crm/leads?search=gmail.com&pageSize=100');
  const ids = list.body.data.items.map((l: { id: string }) => l.id);
  assert.ok(ids.includes(first.body.data.id));
  assert.ok(!ids.includes(second.body.data.id), 'duplicates hidden by default');
  const withDup = await admin.get('/api/crm/leads?search=gmail.com&includeDuplicates=true&pageSize=100');
  assert.ok(withDup.body.data.items.some((l: { id: string }) => l.id === second.body.data.id));
  const detail = await admin.get(`/api/crm/leads/${first.body.data.id}`);
  assert.equal(detail.body.data.duplicates.length, 1);
  assert.ok(!('ipHash' in detail.body.data) && !('emailNormalized' in detail.body.data));
});

test('CRM access: permissions and ownership', async () => {
  const s1 = await staff(api.base, 'SALES');
  const s2 = await staff(api.base, 'SALES');
  for (const role of ['STUDENT', 'TRAINER', 'FINANCE', 'EDITOR', 'HR'] as const) {
    const c = (await staff(api.base, role)).client;
    assert.equal((await c.get('/api/crm/leads')).status, 403, role);
  }
  assert.equal((await new Client(api.base).get('/api/crm/leads')).status, 401);

  const r = await submit(enquiry());
  const id = r.body.data.id;
  // Sales rep claims an unassigned lead; cannot hand it to a colleague
  assert.equal((await s1.client.patch(`/api/crm/leads/${id}`, { assignedToId: s2.user.id })).status, 403);
  assert.equal((await s1.client.patch(`/api/crm/leads/${id}`, { assignedToId: s1.user.id })).status, 200);
  // The other rep can no longer see it
  assert.equal((await s2.client.get(`/api/crm/leads/${id}`)).status, 404);
  assert.ok(!(await s2.client.get('/api/crm/leads?pageSize=100')).body.data.items.some((l: { id: string }) => l.id === id));
  assert.equal((await s2.client.patch(`/api/crm/leads/${id}`, { status: 'CONTACTED' })).status, 404);
  // Admin sees everything and can reassign
  assert.equal((await admin.patch(`/api/crm/leads/${id}`, { assignedToId: s2.user.id })).status, 200);
  assert.ok(await prisma.notification.findFirst({ where: { userId: s2.user.id, type: 'LEAD' } }));
  // Rules are admin-only
  assert.equal((await s1.client.put('/api/crm/rules', { rules: [] })).status, 403);
  // A student cannot own leads
  const student = await staff(api.base, 'STUDENT');
  assert.equal((await admin.patch(`/api/crm/leads/${id}`, { assignedToId: student.user.id })).status, 422);
});

test('assignment rules route new leads by service', async () => {
  const mobile = await staff(api.base, 'SALES');
  const fallback = await staff(api.base, 'SALES');
  const set = await admin.put('/api/crm/rules', { rules: [{ service: 'Mobile App Development', assigneeId: mobile.user.id }, { service: null, assigneeId: fallback.user.id }] });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  testOutbox.length = 0;
  const a = await submit(enquiry({ service: 'mobile app development' }));
  const b = await submit(enquiry({ service: 'SEO' }));
  assert.equal((await prisma.contactLead.findUniqueOrThrow({ where: { id: a.body.data.id } })).assignedToId, mobile.user.id);
  assert.equal((await prisma.contactLead.findUniqueOrThrow({ where: { id: b.body.data.id } })).assignedToId, fallback.user.id);
  assert.ok(testOutbox.some((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(mobile.user.email)), 'owner gets the team alert');
  // The owner works it from their own CRM view
  assert.ok((await mobile.client.get('/api/crm/leads?assignedToId=me')).body.data.items.some((l: { id: string }) => l.id === a.body.data.id));
  await admin.put('/api/crm/rules', { rules: [] });
});

test('pipeline: stages, notes, consultation, follow-ups, summary funnel, export, tracking', async () => {
  const r = await submit(enquiry({ utmCampaign: 'funnel-test' }));
  const id = r.body.data.id;
  assert.equal((await admin.patch(`/api/crm/leads/${id}`, { status: 'IN_PROGRESS' })).status, 422, 'legacy stage not offered');
  assert.equal((await admin.patch(`/api/crm/leads/${id}`, {})).status, 422);
  for (const status of ['CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION']) {
    assert.equal((await admin.patch(`/api/crm/leads/${id}`, { status, note: `moved to ${status}` })).status, 200);
  }
  assert.equal((await admin.post(`/api/crm/leads/${id}/notes`, { body: 'Discovery call held; scope agreed.', type: 'CONSULTATION' })).status, 201);
  const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const fu = await admin.patch(`/api/crm/leads/${id}`, { followUpAt: due, priority: 'HIGH' });
  assert.equal(fu.body.data.priority, 'HIGH');
  const won = await admin.patch(`/api/crm/leads/${id}`, { status: 'WON', note: 'Signed the proposal' });
  assert.equal(won.body.data.status, 'WON');
  assert.equal(won.body.data.followUpAt, null, 'closed leads need no follow-up');
  const types = won.body.data.activities.map((a: { type: string }) => a.type);
  for (const t of ['STATUS_CHANGED', 'CONSULTATION', 'FOLLOW_UP_SET', 'PRIORITY_CHANGED', 'CREATED']) assert.ok(types.includes(t), t);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'lead.updated', entityId: id } }));

  // Anonymous tracking
  assert.equal((await new Client(api.base).post('/api/track', { type: 'cta_click', label: 'Request a Quote', page: '/services/seo?utm_source=x', email: 'x@y.z' })).status, 204);
  assert.equal((await new Client(api.base).post('/api/track', { type: 'whatsapp_click', label: 'floating' })).status, 204);
  assert.equal((await new Client(api.base).post('/api/track', { type: 'page_view' })).status, 422);
  const ev = await prisma.marketingEvent.findFirstOrThrow({ where: { type: 'cta_click' } });
  assert.equal(ev.page, '/services/seo', 'query strings are dropped');
  assert.ok(!JSON.stringify(ev).includes('x@y.z'), 'no personal data stored');

  const sum = (await admin.get('/api/crm/summary')).body.data;
  const stage = (n: string) => sum.funnel.find((f: { stage: string }) => f.stage === n).value;
  assert.equal(stage('Visitors'), null, 'not measured without an analytics provider');
  assert.ok(stage('CTA clicks') >= 1);
  assert.ok(stage('WhatsApp clicks') >= 1);
  assert.ok(stage('Qualified') >= 1 && stage('Proposal') >= 1 && stage('Consultation') >= 1 && stage('Customer') >= 1);
  assert.ok(sum.byCampaign.some((c: { utmCampaign: string }) => c.utmCampaign === 'funnel-test'));
  // Channel + landing page breakdowns (cpc-tagged Google traffic is Paid, not organic); UTM query strings collapse
  assert.ok(sum.byChannel.some((c: { channel: string; leads: number }) => c.channel === 'Paid' && c.leads >= 1));
  assert.ok(sum.byLandingPage.some((l: { page: string }) => l.page === '/services/web-development'));
  assert.ok(!sum.byLandingPage.some((l: { page: string }) => l.page.includes('?')));

  const exp = await admin.get('/api/crm/leads/export?utmCampaign=funnel-test');
  assert.equal(exp.status, 200);
  assert.equal(exp.body.data.rows[0].stage, 'WON');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'report.exported', entityId: 'leads' } }));
});

test('manual leads, follow-up reminders (idempotent) and the cron endpoint', async () => {
  const rep = await staff(api.base, 'SALES');
  const m = await rep.client.post('/api/crm/leads', { name: 'Walk-in Client', email: `${uniq('wa')}@example.test`, phone: '9123456789', message: 'Spoke on WhatsApp about a CRM.', source: 'manual_whatsapp', service: 'CRM Development' });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.data.assignedToId, rep.user.id, 'defaults to the rep who added it');
  await prisma.contactLead.update({ where: { id: m.body.data.id }, data: { followUpAt: new Date(Date.now() - 3_600_000) } });

  assert.equal((await new Client(api.base).post('/api/crm/reminders/dispatch', {})).status, 404, 'disabled without CRON_SECRET');
  assert.equal((await rep.client.post('/api/crm/reminders/run')).status, 403);
  const run1 = await admin.post('/api/crm/reminders/run');
  assert.equal(run1.status, 200);
  assert.ok(run1.body.data.leads >= 1);
  assert.ok(await prisma.notification.findFirst({ where: { userId: rep.user.id, type: 'LEAD_REMINDER' } }));
  const run2 = await admin.post('/api/crm/reminders/run');
  assert.equal(await prisma.leadActivity.count({ where: { leadId: m.body.data.id, type: 'REMINDER_SENT' } }), 1, 'not repeated within a day');
  void run2;
  const overdue = await rep.client.get('/api/crm/leads?followUp=overdue');
  assert.ok(overdue.body.data.items.some((l: { id: string }) => l.id === m.body.data.id));

  // The legacy CMS contacts list still works on the same table
  assert.equal((await admin.get('/api/admin/contacts')).status, 200);
});

test('acquisition channel classification', () => {
  assert.equal(leadChannel({ referrer: 'https://www.google.com/' }), 'Organic search');
  assert.equal(leadChannel({ referrer: 'https://www.google.co.in/' }), 'Organic search');
  assert.equal(leadChannel({ referrer: 'https://www.bing.com/search' }), 'Organic search');
  assert.equal(leadChannel({ referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'cpc' }), 'Paid');
  assert.equal(leadChannel({ referrer: 'https://chatgpt.com/' }), 'AI assistant');
  assert.equal(leadChannel({ referrer: 'https://gemini.google.com/app' }), 'AI assistant');
  assert.equal(leadChannel({ referrer: 'https://www.perplexity.ai/search' }), 'AI assistant');
  assert.equal(leadChannel({ referrer: 'https://www.linkedin.com/feed/' }), 'Social');
  assert.equal(leadChannel({ utmSource: 'newsletter', utmMedium: 'email' }), 'Email');
  assert.equal(leadChannel({ utmSource: 'partner-site' }), 'Campaign (other)');
  assert.equal(leadChannel({ referrer: 'https://example.org/post' }), 'Referral');
  assert.equal(leadChannel({ referrer: 'not a url' }), 'Direct / unknown');
  assert.equal(leadChannel({}), 'Direct / unknown');
  assert.equal(landingPath('/services/seo?utm_source=x#top'), '/services/seo');
  assert.equal(landingPath(null), 'Not recorded');
});
