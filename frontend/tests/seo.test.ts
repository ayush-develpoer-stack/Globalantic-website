import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteConfig } from '@/lib/config';
import { articleSchema, brandTitle, buildMetadata, founderSchema, isIndexable, organizationSchema } from '@/lib/seo';
import { buildServices } from '@/lib/mock/content';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  const restore = () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const out = fn();
  return out instanceof Promise ? out.finally(restore) : restore();
}

test('the brand appears exactly once in titles', () => {
  assert.equal(brandTitle('Web Development'), 'Web Development | Globalantic');
  assert.equal(brandTitle('Choosing a stack | Globalantic Blog'), 'Choosing a stack | Globalantic Blog');
  assert.equal(brandTitle('Web Development Services | Globalantic'), 'Web Development Services | Globalantic');
  assert.equal(brandTitle(), siteConfig.homeTitle);
});

test('only the production deployment is indexable', () => {
  withEnv({ ALLOW_INDEXING: undefined, VERCEL_ENV: 'preview' }, () => assert.equal(isIndexable(), false));
  withEnv({ ALLOW_INDEXING: 'true' }, () => assert.equal(isIndexable(), true));
  withEnv({ ALLOW_INDEXING: 'false' }, () => assert.equal(isIndexable(), false));
  withEnv({ ALLOW_INDEXING: undefined, VERCEL_ENV: 'preview' }, () => {
    const meta = buildMetadata({ title: 'X', path: '/x' });
    assert.deepEqual(meta.robots, { index: false, follow: true });
    assert.deepEqual(robots().rules, { userAgent: '*', disallow: '/' });
  });
  withEnv({ ALLOW_INDEXING: 'true' }, () => {
    const meta = buildMetadata({ title: 'X', path: '/x' });
    assert.equal((meta.robots as { index: boolean }).index, true);
    assert.equal(meta.alternates?.canonical, `${siteConfig.url}/x`);
    const r = robots();
    assert.ok(String(r.sitemap).endsWith('/sitemap.xml'));
    assert.deepEqual((r.rules as { disallow: string[] }).disallow, ['/admin', '/admin/', '/blog/preview']);
  });
  withEnv({ ALLOW_INDEXING: 'true' }, () => {
    assert.deepEqual(buildMetadata({ title: 'Gone', path: '/gone', noindex: true }).robots, { index: false, follow: false });
  });
});

test('blog posts get article Open Graph data', () => {
  const meta = buildMetadata({ title: 'Post', path: '/blog/post', article: { publishedTime: '2026-10-01T00:00:00.000Z', authors: ['Globalantic'], tags: ['seo'] } });
  const og = meta.openGraph as Record<string, unknown>;
  assert.equal(og.type, 'article');
  assert.equal(og.publishedTime, '2026-10-01T00:00:00.000Z');
});

test('Organization schema: city only, founder by name, no invented facts', () => {
  const org = organizationSchema({ socials: ['https://www.linkedin.com/company/x', '', null, 'http://insecure.example'] });
  assert.deepEqual(org.address, { '@type': 'PostalAddress', addressLocality: 'Bhopal', addressRegion: 'Madhya Pradesh', addressCountry: 'IN' });
  assert.ok(!('streetAddress' in org.address), 'no street address is published');
  assert.equal(org.founder.name, 'Ayush Ahirwar');
  assert.deepEqual(org.sameAs, ['https://www.linkedin.com/company/x'], 'only https profile links that were configured');
  assert.ok(!('aggregateRating' in org) && !('review' in org) && !('award' in org));
  const person = founderSchema();
  assert.deepEqual(Object.keys(person).sort(), ['@context', '@id', '@type', 'jobTitle', 'name', 'url', 'worksFor'].sort(), 'name and title only');
});

test('a founder-written post links the author to the founder entity', () => {
  const a = articleSchema({ title: 'T', description: 'D', path: '/blog/t', author: 'Ayush Ahirwar' });
  assert.equal((a.author as { '@id'?: string })['@id'], `${siteConfig.url}/about#founder`);
  const b = articleSchema({ title: 'T', description: 'D', path: '/blog/t', author: 'Globalantic' });
  assert.equal((b.author as { '@type': string })['@type'], 'Organization');
});

test('service SEO titles are unique, brand-free and not over-long', () => {
  const services = buildServices();
  const titles = services.map((s) => s.seoTitle!);
  assert.equal(new Set(titles).size, titles.length, 'unique titles');
  for (const s of services) {
    assert.ok(!/globalantic/i.test(s.seoTitle!) || s.seoTitle!.endsWith('| Globalantic'), s.slug);
    assert.ok(brandTitle(s.seoTitle).length <= 80, `${s.slug}: ${brandTitle(s.seoTitle)}`);
    assert.ok(s.seoDescription!.length >= 70 && s.seoDescription!.length <= 170, `${s.slug} description length ${s.seoDescription!.length}`);
    assert.ok(!/guarantee(d)? (rank|#1|first)|number one|best in/i.test(s.seoDescription!), `${s.slug}: no ranking promises`);
  }
});

test('sitemap lists canonical URLs only, with real modification dates', async () => {
  const entries = await sitemap();
  const urls = entries.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, 'no duplicates');
  for (const u of urls) {
    assert.ok(u.startsWith(siteConfig.url), u);
    assert.ok(!u.includes('?') && !/\/(admin|lp)(\/|$)/.test(u), u);
  }
  assert.ok(urls.includes(`${siteConfig.url}/services/web-development`));
  const home = entries.find((e) => e.url === siteConfig.url);
  assert.ok(home && !('lastModified' in home), 'static pages carry no fake lastModified');
});
