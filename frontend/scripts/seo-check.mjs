#!/usr/bin/env node
/**
 * SEO crawl check for a running site (no dependencies).
 *
 *   node scripts/seo-check.mjs <baseUrl> [--canonical https://globalantic.com] [--private /admin/login,/login]
 *                              [--expect-noindex-site] [--json report.json]
 *
 * Reads robots.txt and sitemap.xml, fetches every sitemap URL and checks: HTTP 200, one <title> and
 * meta description (unique across the site), a self-referencing canonical, no noindex, one <h1>,
 * Open Graph tags, valid JSON-LD (FAQ answers must be visible on the page), images with alt text,
 * and every internal link found (broken links / redirects). It also checks that an unknown URL
 * returns 404 + noindex and that --private paths are noindex.
 *
 * --canonical: the production origin the pages declare (canonicals/sitemap use it while the
 * site is served from localhost). Sitemap URLs are rewritten to <baseUrl> for fetching.
 * --expect-noindex-site: for preview/staging builds — expects robots.txt "Disallow: /" and noindex everywhere.
 */
const args = process.argv.slice(2);
const base = (args[0] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/seo-check.mjs <baseUrl> [--canonical <origin>] [--private /a,/b] [--expect-noindex-site]');
  process.exit(2);
}
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : undefined;
};
const canonicalOrigin = (opt('--canonical') || base).replace(/\/+$/, '');
const privatePaths = (opt('--private') || '').split(',').filter(Boolean);
const expectNoindexSite = args.includes('--expect-noindex-site');
const jsonOut = opt('--json');

const errors = [];
const warnings = [];
const err = (url, msg) => errors.push(`${url}: ${msg}`);
const warn = (url, msg) => warnings.push(`${url}: ${msg}`);

const toLocal = (u) => (u.startsWith(canonicalOrigin) ? base + u.slice(canonicalOrigin.length) : u);
const toCanonical = (u) => (u.startsWith(base) ? canonicalOrigin + u.slice(base.length) : u);
const norm = (u) => u.replace(/\/+$/, '').replace(/\/(?=\?)/, '');

async function get(url, redirect = 'manual') {
  const res = await fetch(url, { redirect, headers: { 'User-Agent': 'GlobalanticSeoCheck/1.0 (+local verification)' } });
  const text = res.status >= 300 && res.status < 400 ? '' : await res.text();
  return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? '') : null;
};
const metaContent = (html, key, keyAttr = 'name') => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) if (attr(m[0], keyAttr)?.toLowerCase() === key) return attr(m[0], 'content');
  return null;
};
const visibleText = (html) =>
  decode(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

const titles = new Map();
const descriptions = new Map();
const internalLinks = new Map(); // url -> first page that links to it
const pages = [];

function checkPage(url, html, headers) {
  const page = { url, title: null, description: null, canonical: null, h1: 0, schemaTypes: [] };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  page.title = title ? decode(title).trim() : null;
  if (!page.title) err(url, 'missing <title>');
  else {
    if (page.title.length > 70) warn(url, `title is ${page.title.length} chars (may be truncated): "${page.title}"`);
    if (page.title.length < 15) warn(url, `short title: "${page.title}"`);
    if ((page.title.match(/globalantic/gi) || []).length > 1 && !/globalantic training/i.test(page.title)) err(url, `brand repeated in title: "${page.title}"`);
    titles.set(page.title, [...(titles.get(page.title) ?? []), url]);
  }
  page.description = metaContent(html, 'description');
  if (!page.description) err(url, 'missing meta description');
  else {
    if (page.description.length > 170) warn(url, `description is ${page.description.length} chars`);
    if (page.description.length < 50) warn(url, `short description (${page.description.length} chars)`);
    descriptions.set(page.description, [...(descriptions.get(page.description) ?? []), url]);
  }
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, 'rel') === 'canonical');
  page.canonical = canonicalTag ? attr(canonicalTag, 'href') : null;
  const expected = toCanonical(url);
  if (!page.canonical) err(url, 'missing canonical');
  else if (!/^https?:\/\//.test(page.canonical)) err(url, `canonical is not absolute: ${page.canonical}`);
  else if (norm(page.canonical) !== norm(expected)) err(url, `canonical ${page.canonical} != ${expected}`);
  const robots = (metaContent(html, 'robots') || '') + ',' + (headers.get('x-robots-tag') || '');
  if (/noindex/i.test(robots)) err(url, `listed in sitemap but noindex (${robots})`);
  page.h1 = (html.match(/<h1\b/gi) || []).length;
  if (page.h1 !== 1) err(url, `${page.h1} <h1> elements (expected 1)`);
  for (const k of ['og:title', 'og:description', 'og:url']) if (!metaContent(html, k, 'property')) err(url, `missing ${k}`);
  if (!metaContent(html, 'og:image', 'property')) warn(url, 'no og:image');
  if (!/<html[^>]*\slang="/i.test(html)) err(url, 'missing <html lang>');

  const text = visibleText(html);
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      err(url, `invalid JSON-LD: ${e.message}`);
      continue;
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      if (node['@context'] !== 'https://schema.org') err(url, `JSON-LD without schema.org @context (${node['@type']})`);
      if (!node['@type']) err(url, 'JSON-LD node without @type');
      page.schemaTypes.push(node['@type']);
      if (node['@type'] === 'FAQPage') {
        for (const q of node.mainEntity ?? []) {
          const answer = q.acceptedAnswer?.text ?? '';
          if (!text.includes(q.name)) err(url, `FAQ question not visible on page: "${q.name}"`);
          if (!text.includes(answer.slice(0, 60))) err(url, `FAQ answer not visible on page: "${answer.slice(0, 60)}…"`);
        }
      }
      if (node['@type'] === 'BreadcrumbList') for (const li of node.itemListElement ?? []) if (!/^https?:\/\//.test(li.item ?? '')) err(url, 'breadcrumb item without absolute URL');
      if (/"(telephone|email)":\s*""/.test(JSON.stringify(node))) err(url, 'empty contact field in JSON-LD');
    }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (attr(m[0], 'alt') === null) err(url, `<img> without alt: ${m[0].slice(0, 100)}`);
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, url).toString();
    } catch {
      err(url, `malformed link: ${href}`);
      continue;
    }
    if (abs.startsWith(canonicalOrigin)) abs = toLocal(abs);
    if (!abs.startsWith(base)) continue;
    abs = abs.split('#')[0];
    if (!internalLinks.has(abs)) internalLinks.set(abs, url);
  }
  pages.push(page);
}

async function main() {
  // robots.txt
  const robots = await get(`${base}/robots.txt`);
  if (robots.status !== 200) err('/robots.txt', `status ${robots.status}`);
  const disallowAll = /^Disallow:\s*\/\s*$/im.test(robots.text);
  if (expectNoindexSite) {
    if (!disallowAll) err('/robots.txt', 'preview/staging build should disallow everything');
    const home = await get(`${base}/`, 'follow');
    if (!/noindex/i.test(metaContent(home.text, 'robots') || '')) err('/', 'preview/staging home page should be noindex');
    return;
  }
  if (disallowAll) err('/robots.txt', 'production robots.txt disallows the whole site');
  const sitemapLine = robots.text.match(/^Sitemap:\s*(\S+)/im)?.[1];
  if (!sitemapLine) err('/robots.txt', 'no Sitemap line');

  // sitemap
  const sm = await get(`${base}/sitemap.xml`);
  if (sm.status !== 200) err('/sitemap.xml', `status ${sm.status}`);
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]).trim());
  if (!urls.length) err('/sitemap.xml', 'no URLs');
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dup.length) err('/sitemap.xml', `duplicate URLs: ${dup.join(', ')}`);
  for (const u of urls) {
    if (!u.startsWith(canonicalOrigin)) err('/sitemap.xml', `URL not on canonical origin: ${u}`);
    if (u.includes('?')) err('/sitemap.xml', `query-string URL: ${u}`);
    if (/\/(admin|login|register|apply|application-status|lp)(\/|$)/.test(u)) err('/sitemap.xml', `private or campaign URL listed: ${u}`);
  }

  for (const u of urls) {
    const local = toLocal(u);
    const res = await get(local);
    if (res.status !== 200) {
      err(local, `sitemap URL returns ${res.status}${res.location ? ` → ${res.location}` : ''}`);
      continue;
    }
    checkPage(local, res.text, res.headers);
  }

  for (const [t, list] of titles) if (list.length > 1) err(list.join(', '), `duplicate title "${t}"`);
  for (const [d, list] of descriptions) if (list.length > 1) warn(list.join(', '), `duplicate description "${d.slice(0, 70)}…"`);

  // internal links
  const sitemapLocal = new Set(urls.map((u) => norm(toLocal(u))));
  for (const [link, from] of internalLinks) {
    const res = await get(link);
    if (res.status >= 400) err(from, `broken internal link ${link} (${res.status})`);
    else if (res.status >= 300) warn(from, `internal link redirects: ${link} → ${res.location}`);
    else if (!link.includes('?') && !sitemapLocal.has(norm(link))) {
      const robotsMeta = (metaContent(res.text, 'robots') || '') + (res.headers.get('x-robots-tag') || '');
      if (!/noindex/i.test(robotsMeta) && /text\/html/.test(res.headers.get('content-type') || '')) warn(from, `indexable page not in sitemap: ${link}`);
    }
  }

  // 404 handling
  const missing = await get(`${base}/this-page-does-not-exist-${Date.now()}`);
  if (missing.status !== 404) err('404', `unknown URL returned ${missing.status}`);
  if (!/noindex/i.test(metaContent(missing.text, 'robots') || '')) warn('404', 'not-found page has no noindex meta (404 status is enough for Google)');
  // Unknown slugs under each dynamic section must be real 404s, not soft 404s (a 200 with "not found").
  const sections = new Set(urls.map((u) => new URL(u).pathname.split('/').filter(Boolean)).filter((p) => p.length === 2).map((p) => p[0]));
  for (const section of sections) {
    const res = await get(`${base}/${section}/this-slug-does-not-exist-${Date.now()}`);
    if (res.status !== 404) err(`/${section}/[slug]`, `unknown slug returned ${res.status} (soft 404)`);
  }

  // private pages
  for (const p of privatePaths) {
    const res = await get(`${base}${p}`, 'follow');
    const robotsMeta = (metaContent(res.text, 'robots') || '') + ',' + (res.headers.get('x-robots-tag') || '');
    if (!/noindex/i.test(robotsMeta)) err(p, `private page is indexable (robots: "${robotsMeta}")`);
    if (urls.some((u) => u.endsWith(p))) err(p, 'private page is in the sitemap');
  }
}

main()
  .catch((e) => err('crawl', e.stack || String(e)))
  .finally(() => {
    const summary = { base, canonicalOrigin, pages: pages.length, internalLinks: internalLinks.size, errors: errors.length, warnings: warnings.length };
    if (jsonOut) import('node:fs').then((fs) => fs.writeFileSync(jsonOut, JSON.stringify({ summary, errors, warnings, pages }, null, 2)));
    console.log(`\nSEO check: ${base} (canonical ${canonicalOrigin})`);
    console.log(`  pages checked: ${pages.length}, internal links checked: ${internalLinks.size}`);
    for (const p of pages) console.log(`  ✓ ${p.url.replace(base, '') || '/'} — "${p.title}" [${p.schemaTypes.join(', ')}]`);
    if (warnings.length) console.log(`\nWarnings (${warnings.length}):\n  - ${warnings.join('\n  - ')}`);
    if (errors.length) console.log(`\nErrors (${errors.length}):\n  - ${errors.join('\n  - ')}`);
    console.log(errors.length ? '\nFAILED' : '\nPASSED');
    process.exitCode = errors.length ? 1 : 0;
  });
