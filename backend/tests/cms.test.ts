/** Website CMS: blog + portfolio lifecycle, permissions, public visibility, landing pages, map settings. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, prisma, startApi, staff, uniq, type Api } from './helpers';

let api: Api;
let admin: Client;
let editor: Client;
let sales: Client;
let pub: Client;
const slug = (p: string) => `${p}-${uniq('').toLowerCase().replace(/[^a-z0-9]/g, '')}`;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  editor = (await staff(api.base, 'EDITOR')).client;
  sales = (await staff(api.base, 'SALES')).client;
  pub = new Client(api.base);
});
after(() => api.close());

const post = (s: string, extra: Record<string, unknown> = {}) => ({ slug: s, title: 'Choosing a tech stack', excerpt: 'How to choose a stack for a new product.', content: '## Intro\n\nText.', tags: ['stack'], ...extra });

test('blog: editors write drafts, publishers approve; drafts, scheduled and archived posts are never public', async () => {
  assert.equal((await sales.get('/api/admin/blog?page=1')).status, 403);
  assert.equal((await pub.get('/api/admin/blog')).status, 401);

  const s = slug('stack');
  const created = await editor.post('/api/admin/blog', post(s));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  assert.equal(created.body.data.published, false);
  assert.equal((await pub.get(`/api/blog/${s}`)).status, 404, 'draft is not public');

  // Slugs: format, uniqueness, availability check
  assert.equal((await editor.post('/api/admin/blog', post('Bad Slug!'))).status, 422);
  assert.equal((await editor.post('/api/admin/blog', post(s))).status, 409);
  assert.equal((await editor.get(`/api/admin/blog/slug-available?slug=${s}`)).body.data.available, false);
  assert.equal((await editor.get(`/api/admin/blog/slug-available?slug=${s}&excludeId=${id}`)).body.data.available, true);
  assert.equal((await editor.put(`/api/admin/blog/${id}`, { coverImage: 'javascript:alert(1)' })).status, 422);

  // Editorial approval: an editor cannot publish; asking for it keeps a draft awaiting review
  assert.equal((await editor.patch(`/api/admin/blog/${id}/publish`)).status, 403, 'editor cannot publish');
  const asked = await editor.put(`/api/admin/blog/${id}`, { published: true, title: 'Choosing a tech stack (draft 2)' });
  assert.equal(asked.status, 200);
  assert.equal(asked.body.data.published, false, 'stays a draft');
  assert.equal(asked.body.data.title, 'Choosing a tech stack (draft 2)', 'other edits are kept');
  assert.match(asked.body.message, /publisher/i);
  const s2 = slug('stack2');
  const direct = await editor.post('/api/admin/blog', post(s2, { published: true }));
  assert.equal(direct.status, 201);
  assert.equal(direct.body.data.published, false, 'editor-created content is a draft');
  assert.equal((await pub.get(`/api/blog/${s2}`)).status, 404);

  // Scheduled: published with a future date stays hidden
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  assert.equal((await admin.put(`/api/admin/blog/${id}`, { publishedAt: future })).status, 200);
  assert.equal((await admin.patch(`/api/admin/blog/${id}/publish`)).status, 200);
  assert.equal((await pub.get(`/api/blog/${s}`)).status, 404, 'scheduled post hidden');
  const sched = await editor.get('/api/admin/blog?page=1&status=scheduled');
  assert.ok(sched.body.data.items.some((p: { id: string }) => p.id === id));

  // Publish now
  await admin.put(`/api/admin/blog/${id}`, { publishedAt: new Date(Date.now() - 60_000).toISOString() });
  const live = await pub.get(`/api/blog/${s}`);
  assert.equal(live.status, 200);
  assert.ok((await pub.get('/api/blog')).body.data.some((p: { slug: string }) => p.slug === s));

  // Live content: editors can neither change, delete, unpublish nor archive it
  assert.equal((await editor.put(`/api/admin/blog/${id}`, { title: 'Sneaky live edit' })).status, 403);
  assert.equal((await editor.del(`/api/admin/blog/${id}`)).status, 403);
  assert.equal((await editor.patch(`/api/admin/blog/${id}/unpublish`)).status, 403);
  assert.equal((await editor.patch(`/api/admin/blog/${id}/archive`)).status, 403);
  assert.equal((await pub.get(`/api/blog/${s}`)).body.data.title, 'Choosing a tech stack (draft 2)');

  // Unpublish keeps the date; archive hides and blocks publishing until restored
  await admin.patch(`/api/admin/blog/${id}/unpublish`);
  assert.ok((await prisma.blogPost.findUniqueOrThrow({ where: { id } })).publishedAt, 'publication date kept');
  assert.equal((await editor.put(`/api/admin/blog/${id}`, { excerpt: 'Edited while unpublished.' })).status, 200, 'drafts are editable again');
  assert.equal((await admin.patch(`/api/admin/blog/${id}/archive`)).status, 200);
  assert.equal((await admin.patch(`/api/admin/blog/${id}/publish`)).status, 409);
  assert.equal((await pub.get(`/api/blog/${s}`)).status, 404);
  const archived = await editor.get('/api/admin/blog?page=1&status=archived');
  assert.equal(archived.body.data.items[0].id, id);
  assert.equal((await admin.patch(`/api/admin/blog/${id}/restore`)).status, 200);
  assert.equal((await admin.patch(`/api/admin/blog/${id}/publish`)).status, 200);
  assert.equal((await pub.get(`/api/blog/${s}`)).status, 200);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: 'BlogPost', entityId: id, action: 'blogpost.published' } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: 'BlogPost', entityId: id, action: 'blogpost.archived' } }));

  // The embedded admin's plain-array listing still works
  const plain = await admin.get('/api/admin/blog');
  assert.ok(Array.isArray(plain.body.data));
});

test('blog categories CRUD', async () => {
  const c = await editor.post('/api/admin/blog-categories', { name: 'Engineering', slug: slug('engineering') });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal((await editor.put(`/api/admin/blog-categories/${c.body.data.id}`, { name: 'Engineering notes', slug: c.body.data.slug })).status, 200);
  assert.equal((await sales.get('/api/admin/blog-categories')).status, 403);
  assert.equal((await editor.del(`/api/admin/blog-categories/${c.body.data.id}`)).status, 200);
});

test('portfolio: client details only when approved; filter by service; archive', async () => {
  const s = slug('clinic-portal');
  const body = { slug: s, title: 'Clinic booking portal', shortDescription: 'Online booking for a clinic.', description: 'Built an online booking portal.', category: 'Web application', client: 'Example Clinic', outcome: 'Bookings moved online.', services: ['web-application-development'], technologies: ['Next.js'], links: [{ label: 'Live site', url: 'https://example.test' }], published: true };
  assert.equal((await editor.post('/api/admin/portfolio', { ...body, slug: slug('x'), links: [{ label: 'Bad', url: 'http://insecure.test' }] })).status, 422);
  const p = await editor.post('/api/admin/portfolio', body);
  assert.equal(p.status, 201, JSON.stringify(p.body));
  assert.equal((await pub.get(`/api/portfolio/${s}`)).status, 404, 'editor submission awaits approval');
  assert.equal((await admin.patch(`/api/admin/portfolio/${p.body.data.id}/publish`)).status, 200);
  const view = await pub.get(`/api/portfolio/${s}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.data.client, null, 'client hidden until approved');
  assert.equal(view.body.data.outcome, null);
  assert.equal((await editor.put(`/api/admin/portfolio/${p.body.data.id}`, { clientApproved: true })).status, 403, 'live item: publisher only');
  await admin.put(`/api/admin/portfolio/${p.body.data.id}`, { clientApproved: true });
  assert.equal((await pub.get(`/api/portfolio/${s}`)).body.data.client, 'Example Clinic');
  const forService = await pub.get('/api/portfolio?service=web-application-development');
  assert.ok(forService.body.data.some((x: { slug: string }) => x.slug === s));
  const other = await pub.get('/api/portfolio?service=seo');
  assert.ok(!other.body.data.some((x: { slug: string }) => x.slug === s));
  await admin.patch(`/api/admin/portfolio/${p.body.data.id}/archive`);
  assert.equal((await pub.get(`/api/portfolio/${s}`)).status, 404);
});

test('landing pages: CMS-managed, public only when published, tied to a real service', async () => {
  const svc = await prisma.service.create({ data: { slug: slug('svc'), title: 'Test service', shortDesc: 'Short', overview: 'Overview', published: true } });
  assert.equal((await editor.post('/api/admin/landing-pages', { slug: slug('lp'), serviceSlug: 'does-not-exist', headline: 'A headline here', subheadline: 'A longer subheadline here.' })).status, 422);
  const lpSlug = slug('lp');
  const lp = await editor.post('/api/admin/landing-pages', { slug: lpSlug, serviceSlug: svc.slug, headline: 'Websites that bring enquiries', subheadline: 'Talk to us about your new website.', benefits: ['Mobile-first', 'Fast'] });
  assert.equal(lp.status, 201, JSON.stringify(lp.body));
  assert.equal((await pub.get(`/api/landing-pages/${lpSlug}`)).status, 404, 'draft hidden');
  await editor.put(`/api/admin/landing-pages/${lp.body.data.id}`, { published: true, indexable: true });
  assert.equal((await pub.get(`/api/landing-pages/${lpSlug}`)).status, 404, 'editor cannot publish');
  assert.equal((await prisma.landingPage.findUniqueOrThrow({ where: { id: lp.body.data.id } })).indexable, false);
  await admin.put(`/api/admin/landing-pages/${lp.body.data.id}`, { published: true });
  const live = await pub.get(`/api/landing-pages/${lpSlug}`);
  assert.equal(live.status, 200);
  assert.equal(live.body.data.service.slug, svc.slug);
  assert.equal(live.body.data.priceNote, null, 'no price unless one was entered');
  assert.equal((await editor.patch(`/api/admin/landing-pages/${lp.body.data.id}/archive`)).status, 403);
  await admin.patch(`/api/admin/landing-pages/${lp.body.data.id}/archive`);
  assert.equal((await pub.get(`/api/landing-pages/${lpSlug}`)).status, 404);
});

test('site settings: map fields accept only Google Maps URLs; settings stay ADMIN-only', async () => {
  assert.equal((await editor.put('/api/admin/settings', { mapUrl: 'https://maps.app.goo.gl/abc' })).status, 403);
  assert.equal((await admin.put('/api/admin/settings', { mapEmbedUrl: 'https://evil.test/embed' })).status, 422);
  assert.equal((await admin.put('/api/admin/settings', { mapUrl: 'http://maps.app.goo.gl/abc' })).status, 422);
  const ok = await admin.put('/api/admin/settings', { mapUrl: 'https://maps.app.goo.gl/abc123', mapEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const s = await pub.get('/api/settings');
  assert.equal(s.body.data.mapUrl, 'https://maps.app.goo.gl/abc123');
  assert.equal(s.body.data.mapEmbedUrl, 'https://www.google.com/maps/embed?pb=!1m18!1m12');
  await admin.put('/api/admin/settings', { mapUrl: '', mapEmbedUrl: '' });
});
