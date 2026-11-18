/**
 * Endpoint coverage for the website side of the API: account self-service, the public
 * catalogue and forms, the CRM helpers, and every admin CMS / lead route that had no test.
 * Each write is checked against the database; each guard is checked for 401/403.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Client, PASSWORD, createUser, login, prisma, startApi, staff, testOutbox, uniq, type Api } from './helpers';
import { env } from '../src/config/env';
import { hashPassword } from '../src/utils/password';

/** env is read-only by type; tests flip CRON_SECRET at runtime. */
const mutableEnv = env as { cronSecret: string };

let api: Api;
let admin: Client;
let editor: Client;
let sales: Client;
let student: Client;
let pub: Client;
let salesUser: { id: string; name: string };
const slug = (p: string) => `${p}-${uniq('').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
const missingId = () => crypto.randomUUID();

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  editor = (await staff(api.base, 'EDITOR')).client;
  const s = await staff(api.base, 'SALES');
  sales = s.client;
  salesUser = s.user;
  student = (await staff(api.base, 'STUDENT')).client;
  pub = new Client(api.base);
});
after(() => api.close());

// ---- /api/auth -----------------------------------------------------------------

test('POST /api/auth/resend-verification: 401 anonymous; unverified user gets a new link; verified user gets none', async () => {
  assert.equal((await pub.post('/api/auth/resend-verification')).status, 401);

  const email = `${uniq('unverified')}@example.test`;
  await prisma.user.create({
    data: {
      email,
      name: 'Unverified Student',
      role: 'STUDENT',
      passwordHash: await hashPassword(PASSWORD),
      studentProfile: { create: { emailCanonical: email, consentAt: new Date(), consentVersion: 'test' } },
    },
  });
  const unverified = await login(api.base, email);
  const before = await prisma.authToken.count({ where: { user: { email }, type: 'VERIFY_EMAIL' } });
  const r = await unverified.post('/api/auth/resend-verification');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.authToken.count({ where: { user: { email }, type: 'VERIFY_EMAIL' } }), before + 1);
  assert.ok(testOutbox.some((m) => m.to === email && m.html.includes('/verify-email?token=')), 'verification email sent');

  // Already verified: same answer, nothing issued (no account-state oracle)
  const tokensBefore = await prisma.authToken.count();
  const v = await student.post('/api/auth/resend-verification');
  assert.equal(v.status, 200);
  assert.equal(await prisma.authToken.count(), tokensBefore);
});

test('POST /api/auth/change-password: 401, 422 (wrong current / weak new), success revokes other sessions only', async () => {
  assert.equal((await pub.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'NewPass123' })).status, 401);

  const u = await createUser('EDITOR');
  const here = await login(api.base, u.email);
  const elsewhere = await login(api.base, u.email);

  const wrong = await here.post('/api/auth/change-password', { currentPassword: 'not-my-password1', newPassword: 'NewPass123' });
  assert.equal(wrong.status, 422);
  assert.equal(wrong.body.errors?.[0]?.field, 'currentPassword');
  const weak = await here.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' });
  assert.equal(weak.status, 422);
  assert.equal((await here.post('/api/auth/change-password', {})).status, 422);

  const ok = await here.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'NewPass123' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await here.get('/api/auth/me')).status, 200, 'current session stays signed in');
  assert.equal((await elsewhere.get('/api/auth/me')).status, 401, 'other sessions are revoked');
  assert.equal((await new Client(api.base).post('/api/auth/login', { email: u.email, password: PASSWORD })).status, 401, 'old password no longer works');
  await login(api.base, u.email, 'NewPass123');
});

// ---- Public catalogue ------------------------------------------------------------

test('GET /api/technologies and /api/blog-categories list stored rows', async () => {
  const tech = await prisma.technology.create({ data: { name: uniq('Tech'), category: 'Backend', order: 1 } });
  const cat = await prisma.blogCategory.create({ data: { name: 'Engineering', slug: slug('eng') } });
  const t = await pub.get('/api/technologies');
  assert.equal(t.status, 200);
  assert.ok(t.body.data.some((x: { id: string }) => x.id === tech.id));
  const c = await pub.get('/api/blog-categories');
  assert.equal(c.status, 200);
  assert.ok(c.body.data.some((x: { slug: string }) => x.slug === cat.slug));
});

// ---- Public forms ----------------------------------------------------------------

test('POST /api/training/apply: 201 persists the application; invalid body -> 422 with field errors', async () => {
  const email = `${uniq('apply')}@example.test`;
  const r = await new Client(api.base).post('/api/training/apply', { fullName: 'Asha Verma', phone: '9876543210', email, qualification: 'B.Sc', mode: 'ONLINE', age: 21 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = await prisma.trainingApplication.findUniqueOrThrow({ where: { id: r.body.data.id } });
  assert.equal(row.email, email);
  assert.equal(row.status, 'NEW');
  assert.equal(row.whatsapp, null, 'empty optional fields are stored as null');

  const bad = await new Client(api.base).post('/api/training/apply', { fullName: 'A', email: 'nope', mode: 'SOMETIMES' });
  assert.equal(bad.status, 422);
  const fields = (bad.body.errors ?? []).map((e) => e.field);
  for (const f of ['fullName', 'phone', 'email', 'qualification', 'mode']) assert.ok(fields.includes(f), `${f} reported`);
});

test('POST /api/careers/apply: 201 persists; invalid URL / missing fields -> 422', async () => {
  const email = `${uniq('career')}@example.test`;
  const r = await new Client(api.base).post('/api/careers/apply', { name: 'Ravi Kumar', email, position: 'Frontend Developer', portfolioUrl: 'https://example.test/ravi' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = await prisma.careerApplication.findUniqueOrThrow({ where: { id: r.body.data.id } });
  assert.equal(row.position, 'Frontend Developer');
  assert.equal(row.resumeUrl, null);

  const bad = await new Client(api.base).post('/api/careers/apply', { name: 'R', email, position: 'Dev', resumeUrl: 'not a url' });
  assert.equal(bad.status, 422);
  assert.ok((bad.body.errors ?? []).some((e) => e.field === 'resumeUrl'));
});

test('POST /api/newsletter: 201 subscribes (case-insensitive), repeat is 200 without a duplicate row; invalid -> 422', async () => {
  const email = `${uniq('News')}@Example.test`;
  const first = await new Client(api.base).post('/api/newsletter', { email });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const again = await new Client(api.base).post('/api/newsletter', { email: email.toLowerCase() });
  assert.equal(again.status, 200);
  assert.match(again.body.message, /already subscribed/i);
  assert.equal(await prisma.newsletterSubscriber.count({ where: { email: email.toLowerCase() } }), 1);

  // An unsubscribed address is re-subscribed in place
  await prisma.newsletterSubscriber.update({ where: { email: email.toLowerCase() }, data: { status: 'UNSUBSCRIBED' } });
  assert.equal((await new Client(api.base).post('/api/newsletter', { email })).status, 201);
  assert.equal((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: email.toLowerCase() } })).status, 'SUBSCRIBED');

  assert.equal((await new Client(api.base).post('/api/newsletter', { email: 'not-an-email' })).status, 422);
});

// ---- /api/crm ----------------------------------------------------------------------

test('GET /api/crm/assignees: only people who can own leads; 401/403 otherwise', async () => {
  assert.equal((await pub.get('/api/crm/assignees')).status, 401);
  assert.equal((await editor.get('/api/crm/assignees')).status, 403);
  const r = await sales.get('/api/crm/assignees');
  assert.equal(r.status, 200);
  const ids = r.body.data.map((u: { id: string }) => u.id);
  assert.ok(ids.includes(salesUser.id), 'sales user listed');
  assert.ok(r.body.data.every((u: { role: string }) => u.role !== 'STUDENT' && u.role !== 'EDITOR'));
  assert.ok(r.body.data.every((u: Record<string, unknown>) => !('passwordHash' in u) && !('permissionGrants' in u)));
});

test('GET /api/crm/rules returns the stored assignment rules with the assignee; 401/403 otherwise', async () => {
  assert.equal((await pub.get('/api/crm/rules')).status, 401);
  assert.equal((await student.get('/api/crm/rules')).status, 403);
  const rule = await prisma.leadAssignmentRule.create({ data: { service: 'Web Development', assigneeId: salesUser.id, active: true } });
  const r = await sales.get('/api/crm/rules');
  assert.equal(r.status, 200);
  const got = r.body.data.find((x: { id: string }) => x.id === rule.id);
  assert.ok(got);
  assert.equal(got.assignee.id, salesUser.id);
  assert.equal(got.service, 'Web Development');
});

test('POST /api/crm/reminders/dispatch: 404 without / with a wrong CRON_SECRET; reminds overdue leads once with it', async () => {
  const saved = env.cronSecret;
  try {
    mutableEnv.cronSecret = '';
    assert.equal((await pub.req('POST', '/api/crm/reminders/dispatch', {}, { 'x-cron-secret': 'anything' })).status, 404, 'disabled when unset');
    mutableEnv.cronSecret = 'test-cron-secret-value';
    assert.equal((await pub.post('/api/crm/reminders/dispatch')).status, 404, 'missing header');
    assert.equal((await pub.req('POST', '/api/crm/reminders/dispatch', {}, { 'x-cron-secret': 'wrong-secret-value!!!' })).status, 404, 'wrong secret');

    const lead = await prisma.contactLead.create({
      data: { name: 'Overdue Lead', email: `${uniq('lead')}@example.test`, message: 'Please call back about a website', status: 'CONTACTED', followUpAt: new Date(Date.now() - 3_600_000), assignedToId: salesUser.id },
    });
    const ok = await pub.req('POST', '/api/crm/reminders/dispatch', {}, { 'x-cron-secret': 'test-cron-secret-value' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(ok.body.data.leads >= 1);
    assert.equal(await prisma.leadActivity.count({ where: { leadId: lead.id, type: 'REMINDER_SENT' } }), 1);
    assert.ok(await prisma.notification.count({ where: { userId: salesUser.id, type: 'LEAD_REMINDER' } }) >= 1);

    // Running again within the window does not remind the same lead twice
    await pub.req('POST', '/api/crm/reminders/dispatch', {}, { 'x-cron-secret': 'test-cron-secret-value' });
    assert.equal(await prisma.leadActivity.count({ where: { leadId: lead.id, type: 'REMINDER_SENT' } }), 1);
  } finally {
    mutableEnv.cronSecret = saved;
  }
});

// ---- /api/admin CMS content (services, solutions, industries, portfolio) ----------------

type Delegate = { findUnique(a: unknown): Promise<unknown>; count(a?: unknown): Promise<number> };
interface Kind {
  path: 'services' | 'solutions' | 'industries' | 'portfolio';
  publicPath: string;
  delegate: Delegate;
  body: (s: string) => Record<string, unknown>;
}

const kinds: Kind[] = [
  { path: 'services', publicPath: '/api/services', delegate: prisma.service as unknown as Delegate, body: (s) => ({ slug: s, title: 'Cloud Migration', shortDesc: 'Move workloads to the cloud.', overview: 'We plan and migrate.', published: false }) },
  { path: 'solutions', publicPath: '/api/solutions', delegate: prisma.solution as unknown as Delegate, body: (s) => ({ slug: s, title: 'Clinic CRM', shortDesc: 'Patient pipeline.', overview: 'A CRM for clinics.', published: false }) },
  { path: 'industries', publicPath: '/api/industries', delegate: prisma.industry as unknown as Delegate, body: (s) => ({ slug: s, title: 'Logistics', shortDesc: 'Software for logistics.', overview: 'Fleet and warehouse tools.', published: false }) },
  { path: 'portfolio', publicPath: '/api/portfolio', delegate: prisma.portfolioProject as unknown as Delegate, body: (s) => ({ slug: s, title: 'Inventory App', shortDescription: 'Stock tracking.', description: 'A stock tracking app.', category: 'Web App', published: false }) },
];

for (const k of kinds) {
  test(`/api/admin/${k.path}: full CRUD, slug checks, editorial guards, public visibility`, async () => {
    const base = `/api/admin/${k.path}`;
    assert.equal((await pub.get(base)).status, 401);
    assert.equal((await student.get(base)).status, 403);
    assert.equal((await sales.post(base, k.body(slug('x')))).status, 403);

    // Create (+ an unrelated record that must survive the later delete)
    const s = slug(k.path.slice(0, 4));
    const keep = await admin.post(base, k.body(slug('keep')));
    assert.equal(keep.status, 201, JSON.stringify(keep.body));
    assert.equal((await admin.post(base, { slug: s })).status, 422, 'missing required fields');
    const created = await admin.post(base, k.body(s));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    assert.ok(await k.delegate.findUnique({ where: { id } }), 'persisted');
    assert.equal((await admin.post(base, k.body(s))).status, 409, 'duplicate slug');

    // List (plain + paginated), slug availability, read one
    const list = await editor.get(base);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.some((r: { id: string }) => r.id === id));
    const paged = await editor.get(`${base}?page=1&pageSize=5&search=${s}`);
    assert.equal(paged.status, 200);
    assert.equal(paged.body.data.total, 1);
    assert.equal(paged.body.data.items[0].id, id);
    assert.equal((await editor.get(`${base}/slug-available?slug=${s}`)).body.data.available, false);
    assert.equal((await editor.get(`${base}/slug-available?slug=${s}&excludeId=${id}`)).body.data.available, true);
    assert.equal((await editor.get(`${base}/slug-available?slug=${slug('free')}`)).body.data.available, true);
    assert.equal((await editor.get(`${base}/slug-available`)).body.data.available, false, 'empty slug is never available');
    const one = await editor.get(`${base}/${id}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.data.slug, s);
    assert.equal((await editor.get(`${base}/${missingId()}`)).status, 404);

    // Update
    const upd = await editor.put(`${base}/${id}`, { title: 'Renamed Title' });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.equal(((await k.delegate.findUnique({ where: { id } })) as { title: string }).title, 'Renamed Title');
    assert.equal((await editor.put(`${base}/${id}`, { title: '' })).status, 422);
    assert.equal((await editor.put(`${base}/${missingId()}`, { title: 'X' })).status, 404);

    // Publish / unpublish: publishers only; drafts are not public
    assert.equal((await pub.get(`${k.publicPath}/${s}`)).status, 404, 'draft hidden');
    assert.equal((await editor.patch(`${base}/${id}/publish`)).status, 403, 'editor cannot publish');
    assert.equal((await admin.patch(`${base}/${missingId()}/publish`)).status, 404);
    assert.equal((await admin.patch(`${base}/${id}/publish`)).status, 200);
    const live = await pub.get(`${k.publicPath}/${s}`);
    assert.equal(live.status, 200);
    assert.equal(live.body.data.title, 'Renamed Title');
    assert.ok((await pub.get(k.publicPath)).body.data.some((r: { slug: string }) => r.slug === s), 'in public list');
    assert.equal((await editor.put(`${base}/${id}`, { title: 'Editor edit of live' })).status, 403, 'live content needs a publisher');
    assert.equal((await editor.del(`${base}/${id}`)).status, 403, 'editor cannot delete live content');
    assert.equal((await editor.patch(`${base}/${id}/unpublish`)).status, 403);
    assert.equal((await admin.patch(`${base}/${id}/unpublish`)).status, 200);
    assert.equal(((await k.delegate.findUnique({ where: { id } })) as { published: boolean }).published, false);
    assert.equal((await pub.get(`${k.publicPath}/${s}`)).status, 404, 'unpublished hidden again');

    // Delete: only the target goes
    const del = await editor.del(`${base}/${id}`);
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(await k.delegate.findUnique({ where: { id } }), null);
    assert.ok(await k.delegate.findUnique({ where: { id: keep.body.data.id } }), 'unrelated record untouched');
    assert.equal((await editor.del(`${base}/${id}`)).status, 404, 'already gone');
  });
}

test('/api/admin/portfolio archive + restore: archived is never public; restore returns a draft', async () => {
  const s = slug('arch');
  const id = (await admin.post('/api/admin/portfolio', { slug: s, title: 'Archive Me', shortDescription: 'x', description: 'y', category: 'Web', published: true })).body.data.id;
  assert.equal((await pub.get(`/api/portfolio/${s}`)).status, 200);
  assert.equal((await editor.patch(`/api/admin/portfolio/${id}/restore`)).status, 403);
  assert.equal((await admin.patch(`/api/admin/portfolio/${id}/archive`)).status, 200);
  assert.equal((await pub.get(`/api/portfolio/${s}`)).status, 404);
  assert.equal((await admin.patch(`/api/admin/portfolio/${id}/publish`)).status, 409, 'archived cannot be published');
  const r = await admin.patch(`/api/admin/portfolio/${id}/restore`);
  assert.equal(r.status, 200);
  const row = await prisma.portfolioProject.findUniqueOrThrow({ where: { id } });
  assert.equal(row.archivedAt, null);
  assert.equal(row.published, false, 'restored as a draft');
  assert.equal((await admin.patch(`/api/admin/portfolio/${missingId()}/restore`)).status, 404);
});

// ---- /api/admin blog, categories, landing pages ------------------------------------------

test('/api/admin/blog GET /:id and DELETE /:id', async () => {
  const keep = await admin.post('/api/admin/blog', { slug: slug('keep'), title: 'Keep me', excerpt: 'Stays.', content: 'Body', published: false });
  const s = slug('post');
  const created = await editor.post('/api/admin/blog', { slug: s, title: 'Delete me', excerpt: 'Short.', content: 'Body text' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal((await pub.get(`/api/admin/blog/${id}`)).status, 401);
  assert.equal((await sales.get(`/api/admin/blog/${id}`)).status, 403);
  const one = await editor.get(`/api/admin/blog/${id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.slug, s);
  assert.equal((await editor.get(`/api/admin/blog/${missingId()}`)).status, 404);
  assert.equal((await editor.del(`/api/admin/blog/${id}`)).status, 200);
  assert.equal(await prisma.blogPost.findUnique({ where: { id } }), null);
  assert.ok(await prisma.blogPost.findUnique({ where: { id: keep.body.data.id } }));
  assert.equal((await editor.del(`/api/admin/blog/${id}`)).status, 404);
});

test('GET /api/admin/blog-categories lists categories with post counts', async () => {
  const cat = await prisma.blogCategory.create({ data: { name: 'Counted', slug: slug('counted') } });
  await prisma.blogPost.create({ data: { slug: slug('cp'), title: 'In category', excerpt: 'e', content: 'c', categoryId: cat.id, published: false } });
  assert.equal((await pub.get('/api/admin/blog-categories')).status, 401);
  assert.equal((await student.get('/api/admin/blog-categories')).status, 403);
  const r = await editor.get('/api/admin/blog-categories');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.find((c: { id: string }) => c.id === cat.id)._count.posts, 1);
});

test('/api/admin/landing-pages: list, read one, delete (editor cannot delete a live page)', async () => {
  const svc = slug('lpsvc');
  await prisma.service.create({ data: { slug: svc, title: 'LP Service', shortDesc: 's', overview: 'o', published: true } });
  const make = (s: string) => ({ slug: s, serviceSlug: svc, headline: 'Get a website fast', subheadline: 'A landing page made for testing.', published: true });
  const keepId = (await admin.post('/api/admin/landing-pages', make(slug('keep')))).body.data.id;
  const created = await admin.post('/api/admin/landing-pages', make(slug('lp')));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;

  assert.equal((await pub.get('/api/admin/landing-pages')).status, 401);
  assert.equal((await sales.get('/api/admin/landing-pages')).status, 403);
  const list = await editor.get('/api/admin/landing-pages');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((p: { id: string }) => p.id === id));
  assert.equal((await editor.get(`/api/admin/landing-pages/${id}`)).body.data.serviceSlug, svc);
  assert.equal((await editor.get('/api/admin/landing-pages/not-a-uuid')).status, 422);
  assert.equal((await editor.get(`/api/admin/landing-pages/${missingId()}`)).status, 404);

  assert.equal((await editor.del(`/api/admin/landing-pages/${id}`)).status, 403, 'live page needs a publisher');
  assert.equal((await admin.del(`/api/admin/landing-pages/${id}`)).status, 200);
  assert.equal(await prisma.landingPage.findUnique({ where: { id } }), null);
  assert.ok(await prisma.landingPage.findUnique({ where: { id: keepId } }));
  assert.equal((await admin.del(`/api/admin/landing-pages/${id}`)).status, 404);
  assert.equal((await admin.del('/api/admin/landing-pages/not-a-uuid')).status, 422);
});

// ---- /api/admin leads (ADMIN only) ------------------------------------------------------

const leadKinds = [
  {
    path: 'contacts',
    status: 'CONTACTED',
    create: async () => (await prisma.contactLead.create({ data: { name: 'Lead', email: `${uniq('c')}@example.test`, message: 'Need a website quote' } })).id,
    read: (id: string) => prisma.contactLead.findUnique({ where: { id } }),
  },
  {
    path: 'training',
    status: 'SHORTLISTED',
    create: async () => (await prisma.trainingApplication.create({ data: { fullName: 'Trainee', phone: '9876500000', email: `${uniq('t')}@example.test`, qualification: 'B.Sc', mode: 'ONLINE' } })).id,
    read: (id: string) => prisma.trainingApplication.findUnique({ where: { id } }),
  },
  {
    path: 'careers',
    status: 'INTERVIEW',
    create: async () => (await prisma.careerApplication.create({ data: { name: 'Applicant', email: `${uniq('a')}@example.test`, position: 'QA' } })).id,
    read: (id: string) => prisma.careerApplication.findUnique({ where: { id } }),
  },
] as const;

for (const k of leadKinds) {
  test(`/api/admin/${k.path}: PUT /:id status and DELETE /:id (ADMIN only)`, async () => {
    const id = await k.create();
    const keep = await k.create();
    const base = `/api/admin/${k.path}`;
    assert.equal((await pub.put(`${base}/${id}`, { status: k.status })).status, 401);
    assert.equal((await editor.put(`${base}/${id}`, { status: k.status })).status, 403, 'editors cannot touch leads');
    assert.equal((await admin.put(`${base}/${id}`, { status: 'NOT_A_STATUS' })).status, 422);
    assert.equal((await admin.put(`${base}/${id}`, {})).status, 422);
    assert.equal((await admin.put(`${base}/${missingId()}`, { status: k.status })).status, 404);
    const r = await admin.put(`${base}/${id}`, { status: k.status });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await k.read(id))?.status, k.status);

    assert.equal((await editor.del(`${base}/${id}`)).status, 403);
    assert.equal((await admin.del(`${base}/${id}`)).status, 200);
    assert.equal(await k.read(id), null);
    assert.ok(await k.read(keep), 'unrelated lead untouched');
    assert.equal((await admin.del(`${base}/${id}`)).status, 404);
  });
}

test('DELETE /api/admin/contacts/:id also removes the lead timeline (cascade), not other leads', async () => {
  const lead = await prisma.contactLead.create({ data: { name: 'With history', email: `${uniq('h')}@example.test`, message: 'Has activities attached' } });
  await prisma.leadActivity.create({ data: { leadId: lead.id, type: 'CREATED', body: 'x' } });
  assert.equal((await admin.del(`/api/admin/contacts/${lead.id}`)).status, 200);
  assert.equal(await prisma.leadActivity.count({ where: { leadId: lead.id } }), 0);
});

test('/api/admin/newsletter: GET lists subscribers, DELETE removes one (ADMIN only)', async () => {
  const a = await prisma.newsletterSubscriber.create({ data: { email: `${uniq('n1')}@example.test`, status: 'SUBSCRIBED' } });
  const b = await prisma.newsletterSubscriber.create({ data: { email: `${uniq('n2')}@example.test`, status: 'SUBSCRIBED' } });
  assert.equal((await pub.get('/api/admin/newsletter')).status, 401);
  assert.equal((await editor.get('/api/admin/newsletter')).status, 403);
  const list = await admin.get('/api/admin/newsletter');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((s: { id: string }) => s.id === a.id));
  assert.equal((await editor.del(`/api/admin/newsletter/${a.id}`)).status, 403);
  assert.equal((await admin.del(`/api/admin/newsletter/${a.id}`)).status, 200);
  assert.equal(await prisma.newsletterSubscriber.findUnique({ where: { id: a.id } }), null);
  assert.ok(await prisma.newsletterSubscriber.findUnique({ where: { id: b.id } }));
  assert.equal((await admin.del(`/api/admin/newsletter/${a.id}`)).status, 404);
});

test('GET /api/admin/faqs (category filter, 422 on repeated category) and GET /api/admin/settings', async () => {
  const cat = uniq('cat');
  const faq = await prisma.fAQ.create({ data: { question: 'Is this a test?', answer: 'Yes.', category: cat } });
  await prisma.fAQ.create({ data: { question: 'Other?', answer: 'Other.', category: uniq('other') } });
  assert.equal((await pub.get('/api/admin/faqs')).status, 401);
  assert.equal((await editor.get('/api/admin/faqs')).status, 403);
  const r = await admin.get(`/api/admin/faqs?category=${cat}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map((f: { id: string }) => f.id), [faq.id]);
  assert.equal((await admin.get('/api/admin/faqs?category=a&category=b')).status, 422);

  assert.equal((await pub.get('/api/admin/settings')).status, 401);
  assert.equal((await editor.get('/api/admin/settings')).status, 403);
  const s = await admin.get('/api/admin/settings');
  assert.equal(s.status, 200);
  assert.ok(s.body.data.id);
  assert.equal(await prisma.siteSetting.count(), 1, 'one settings row (created on first read if missing)');
  const put = await admin.put('/api/admin/settings', { companyName: 'Globalantic Test' });
  assert.equal(put.status, 200);
  assert.equal((await admin.get('/api/admin/settings')).body.data.companyName, 'Globalantic Test');
});
