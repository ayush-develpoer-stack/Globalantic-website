import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { footerNav, mainNav, serviceLinks, SERVICE_OPTIONS } from '@/lib/config';
import { buildIndustries, buildServices, buildSolutions } from '@/lib/mock/content';
import { contentService } from '@/services/content.service';

/** Every navigation/footer link must point at a real route (static page or a known slug). */
const app = path.resolve(process.cwd(), 'app', '(marketing)');
const dynamic: Record<string, Set<string>> = {
  services: new Set(buildServices().map((s) => s.slug)),
  solutions: new Set(buildSolutions().map((s) => s.slug)),
  industries: new Set(buildIndustries().map((s) => s.slug)),
};

function routeExists(href: string): boolean {
  if (href === '/') return fs.existsSync(path.join(app, 'page.tsx'));
  if (href === '/sitemap.xml') return fs.existsSync(path.resolve(process.cwd(), 'app', 'sitemap.ts'));
  const [first, slug, ...rest] = href.replace(/^\//, '').split('/');
  if (rest.length) return false;
  if (slug) return Boolean(dynamic[first]?.has(slug)) && fs.existsSync(path.join(app, first, '[slug]', 'page.tsx'));
  return fs.existsSync(path.join(app, first, 'page.tsx'));
}

test('main nav, mega menu and footer links all resolve to routes', () => {
  const all = [...mainNav, ...serviceLinks, ...footerNav.company, ...footerNav.services, ...footerNav.solutions, ...footerNav.legal, { label: 'Sitemap', href: '/sitemap.xml' }];
  const broken = all.filter((l) => !routeExists(l.href)).map((l) => `${l.label} -> ${l.href}`);
  assert.deepEqual(broken, []);
});

test('every published service, solution and industry has a detail page route', () => {
  for (const kind of Object.keys(dynamic)) assert.ok(fs.existsSync(path.join(app, kind, '[slug]', 'page.tsx')), kind);
  assert.ok(fs.existsSync(path.join(app, 'lp', '[slug]', 'page.tsx')), 'campaign landing pages');
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'app', 'llms.txt', 'route.ts')), 'llms.txt');
});

test('the five added services exist with audience, industries and a hero style', async () => {
  const services = (await contentService.getServices()) ?? [];
  for (const slug of ['web-application-development', 'api-integration', 'website-maintenance', 'aeo', 'geo']) {
    const s = services.find((x) => x.slug === slug);
    assert.ok(s, slug);
    assert.ok(s!.heroVariant, `${slug} hero style`);
    assert.ok((s!.audience ?? []).length > 0, `${slug} audience`);
    for (const ind of s!.industries ?? []) assert.ok(dynamic.industries.has(ind), `${slug} -> unknown industry ${ind}`);
  }
  assert.equal(services.length, 19);
  for (const name of ['Website Maintenance & Support', 'AEO (Answer Engine Optimization)', 'GEO (Generative Engine Optimization)']) assert.ok((SERVICE_OPTIONS as readonly string[]).includes(name), name);
});

test('hero styles match the values the API accepts', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
  const list = (src: string, name: string) => {
    const block = src.slice(src.indexOf(name), src.indexOf('] as const', src.indexOf(name)));
    return [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  };
  assert.deepEqual(list(read('components/visuals/HeroVisual.tsx'), 'HERO_VARIANTS = ['), list(read('../backend/src/validators/index.ts'), 'HERO_VARIANTS = ['));
});

test('no unconfigured map or fake location: mock settings ship without map URLs', async () => {
  const s = await contentService.getSettings();
  assert.equal(s?.mapUrl ?? null, null);
  assert.equal(s?.mapEmbedUrl ?? null, null);
});
