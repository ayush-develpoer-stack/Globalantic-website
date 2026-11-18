/**
 * prisma/seed-portfolio-blog.ts: real projects + blog drafts + company contacts.
 * The data must pass the same validators the admin CMS uses, and the seed must be create-only
 * (idempotent, never overwrites CMS edits, never publishes drafts).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client, prisma, startApi, type Api } from './helpers';
import { blogSchema, portfolioSchema } from '../src/validators';
import { realProjects } from '../../prisma/data/portfolio-real';
import { blogDrafts } from '../../prisma/data/blog-drafts';

let api: Api;
before(async () => {
  api = await startApi();
  await prisma.blogCategory.createMany({
    data: ['web-development', 'software-development', 'business-technology', 'ai', 'seo'].map((slug) => ({ slug, name: slug })),
    skipDuplicates: true,
  });
});
after(() => api.close());

const runSeed = () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', path.resolve(__dirname, '../../prisma/seed-portfolio-blog.ts')], { cwd: path.resolve(__dirname, '..'), env: process.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
};

test('every project and draft passes the admin CMS validators', () => {
  assert.equal(realProjects.length, 8);
  for (const p of realProjects) {
    const { order, featured, ...rest } = p;
    const parsed = portfolioSchema.safeParse({ ...rest, order, featured });
    assert.ok(parsed.success, `${p.slug}: ${JSON.stringify(!parsed.success && parsed.error.issues)}`);
    assert.ok(p.links.every((l) => l.url.startsWith('https://')));
  }
  assert.equal(new Set(realProjects.map((p) => p.slug)).size, 8);
  assert.equal(blogDrafts.length, 6);
  for (const d of blogDrafts) {
    const parsed = blogSchema.safeParse({ slug: d.slug, title: d.title, excerpt: d.excerpt, content: d.content, tags: d.tags, readingTime: d.readingTime, seoTitle: d.seoTitle, seoDescription: d.seoDescription });
    assert.ok(parsed.success, `${d.slug}: ${JSON.stringify(!parsed.success && parsed.error.issues)}`);
    assert.match(d.content, /Draft for review — not published/);
  }
});

test('the copy contains no unverified claims (figures, ratings, returns, guarantees)', () => {
  const text = JSON.stringify([realProjects, blogDrafts]);
  for (const banned of [/\d+\+\s*(customers|clients|trips|projects|reviews)/i, /\d(\.\d)?\s*(★|star|google rating)/i, /\d+\s*%\s*(p\.a|returns?|cagr|growth|increase)/i, /\bguaranteed (rankings?|results|returns|traffic)\b/i, /\b(we|globalantic) guarantees?\b/i, /AMFI|SEBI|ARN/]) {
    assert.doesNotMatch(text, banned);
  }
});

test('seed creates 8 published projects + 6 unpublished drafts + contacts; a second run changes nothing', async () => {
  await prisma.siteSetting.deleteMany();
  await prisma.siteSetting.create({ data: { email: 'hello@globalantic.com' } });
  runSeed();
  assert.equal(await prisma.portfolioProject.count({ where: { slug: { in: realProjects.map((p) => p.slug) }, published: true } }), 8);
  assert.equal(await prisma.blogPost.count({ where: { slug: { in: blogDrafts.map((d) => d.slug) }, published: false, publishedAt: null } }), 6);
  const s = await prisma.siteSetting.findFirstOrThrow();
  assert.equal(s.email, 'info@globalantic.com');
  assert.equal(s.secondaryEmail, 'info.globalantic@gmail.com');
  assert.equal(s.phone, '+91 76978 45157');
  assert.deepEqual((await prisma.notificationSettings.findUniqueOrThrow({ where: { id: 'default' } })).recipients, ['info@globalantic.com', 'info.globalantic@gmail.com']);

  // A CMS edit and a custom email survive a re-run.
  await prisma.portfolioProject.update({ where: { slug: realProjects[0].slug }, data: { title: 'Edited in CMS' } });
  await prisma.siteSetting.update({ where: { id: s.id }, data: { email: 'custom@globalantic.com' } });
  const out = runSeed();
  assert.match(out, /skip project/);
  assert.equal(await prisma.portfolioProject.count({ where: { slug: { in: realProjects.map((p) => p.slug) } } }), 8);
  assert.equal(await prisma.blogPost.count({ where: { slug: { in: blogDrafts.map((d) => d.slug) } } }), 6);
  assert.equal((await prisma.portfolioProject.findUniqueOrThrow({ where: { slug: realProjects[0].slug } })).title, 'Edited in CMS');
  assert.equal((await prisma.siteSetting.findFirstOrThrow()).email, 'custom@globalantic.com');
});

test('public API: projects are listed with the client hidden (not approved); drafts are not public', async () => {
  const anon = new Client(api.base);
  const list = await anon.get('/api/portfolio');
  const seeded = (list.body.data as { slug: string; client: string | null; industry: string }[]).filter((p) => realProjects.some((r) => r.slug === p.slug));
  assert.equal(seeded.length, 8);
  assert.ok(seeded.every((p) => p.client === null), 'client name stays hidden until approved');
  assert.equal(seeded.filter((p) => p.industry === 'Healthcare').length, 2);
  assert.equal((await anon.get(`/api/blog/${blogDrafts[0].slug}`)).status, 404);
});

test('regression: a URL pasted into a project or post title is rejected (422), as in the stray production row', async () => {
  const { staff } = await import('./helpers');
  const admin = (await staff(api.base, 'ADMIN')).client;
  for (const title of ['http://localhost:4000/api/files/public/ad800b6f-7627-4150-94fb-77f6c4be59e5', '/api/files/public/ad800b6f-7627-4150-94fb-77f6c4be59e5']) {
    const p = await admin.post('/api/admin/portfolio', { slug: `url-title-${Date.now()}`, title, shortDescription: 'x', description: 'x', category: 'Web' });
    assert.equal(p.status, 422);
    assert.ok(p.body.errors?.some((e) => e.field === 'title'));
    const b = await admin.post('/api/admin/blog', { slug: `url-title-${Date.now()}`, title, excerpt: 'x', content: 'x' });
    assert.equal(b.status, 422);
  }
  assert.equal((await admin.post('/api/admin/portfolio', { slug: `ok-title-${Date.now()}`, title: 'A normal title', shortDescription: 'x', description: 'x', category: 'Web' })).status, 201);
});
