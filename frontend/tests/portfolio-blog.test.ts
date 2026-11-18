import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactDetails } from '@/lib/contact';
import { siteConfig } from '@/lib/config';
import { filterProjects, liveLinks, placeholderTheme, projectCover, relatedProjects } from '@/lib/portfolio';
import { isPublicPost, listingHref, paginate, postsWithTag, relatedPosts, searchPosts, tagSlug } from '@/lib/blog';
import { listingSeo } from '@/lib/blog-data';
import { extractHeadings, parseInline, parseMarkdown, safeHref } from '@/lib/markdown';
import { absoluteImage, mediaUrl } from '@/lib/images';
import { buildBlogPosts } from '@/lib/mock/content';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import type { BlogPost, PortfolioProject } from '@/types';

// ---------------------------------------------------------------- contact details

test('contact details: verified fallbacks, both emails, legacy placeholder ignored', () => {
  const none = contactDetails(null);
  assert.equal(none.email, 'info@globalantic.com');
  assert.equal(none.secondaryEmail, 'info.globalantic@gmail.com');
  assert.deepEqual(none.emails, ['info@globalantic.com', 'info.globalantic@gmail.com']);
  assert.equal(none.phone, '+91 76978 45157');
  assert.equal(none.tel, 'tel:+917697845157');
  assert.match(none.whatsapp ?? '', /^https:\/\/wa\.me\/917697845157\?text=/);
  assert.equal(none.address, siteConfig.location);

  // The old column default is not a real inbox.
  assert.equal(contactDetails({ email: 'hello@globalantic.com' }).email, 'info@globalantic.com');
  // Admin-configured values win; a duplicate secondary is dropped.
  const custom = contactDetails({ email: 'Sales@Example.com', secondaryEmail: 'sales@example.com', phone: '+91 90000 00000', whatsapp: '919000000000' });
  assert.equal(custom.email, 'sales@example.com');
  assert.equal(custom.secondaryEmail, null);
  assert.deepEqual(custom.emails, ['sales@example.com']);
  assert.match(custom.whatsapp ?? '', /wa\.me\/919000000000/);
});

// ---------------------------------------------------------------- portfolio

const project = (p: Partial<PortfolioProject>): PortfolioProject =>
  ({ id: p.slug, slug: 'x', title: 'X', shortDescription: 's', description: 'd', category: 'Web', features: [], technologies: [], images: [], gallery: [], featured: false, published: true, createdAt: '', updatedAt: '', ...p }) as PortfolioProject;

test('placeholder theme: each project family gets its own motif (no shared stock image)', () => {
  const cases: [string, string | null, string][] = [
    ['Travel & Tourism Website', 'Travel & Tourism', 'travel'],
    ['Car Rental & Lead Generation', 'Travel & Tourism', 'travel'],
    ['Business Website & Online Store', 'Beauty & Personal Care', 'commerce'],
    ['News & Publishing Platform', 'News & Media', 'media'],
    ['Healthcare CRM / Business Software', 'Healthcare', 'healthcare'],
    ['Healthcare Website', 'Healthcare', 'healthcare'],
    ['IT & Digital Solutions Website', 'IT Services', 'software'],
    ['Financial Services Website', 'Financial Services', 'finance'],
  ];
  for (const [category, industry, expected] of cases) assert.equal(placeholderTheme(category, industry), expected, category);
  assert.equal(placeholderTheme('Something else', null), 'web');
  assert.equal(placeholderTheme('', 'Healthcare'), 'healthcare', 'falls back to the industry');
  assert.ok(new Set(cases.map((c) => c[2])).size >= 6);
});

test('project cover: dedicated cover first, then images[0]; alt text with a safe fallback', () => {
  assert.deepEqual(projectCover(project({ title: 'Lab', coverImage: 'https://x/c.png', coverImageAlt: 'Lab homepage', images: ['https://x/a.png'] })), { src: 'https://x/c.png', alt: 'Lab homepage' });
  assert.deepEqual(projectCover(project({ title: 'Lab', images: ['https://x/a.png'] })), { src: 'https://x/a.png', alt: 'Lab — project cover' });
  assert.equal(projectCover(project({ title: 'Lab', coverImage: '  ' })), null);
});

test('related projects: same industry (same organisation) first, then category; never itself', () => {
  const a = project({ slug: 'maharaj', industry: 'Travel & Tourism', category: 'Travel & Tourism Website' });
  const b = project({ slug: 'maharaj-car', industry: 'Travel & Tourism', category: 'Car Rental & Lead Generation' });
  const c = project({ slug: 'nakul', industry: 'Healthcare', category: 'Healthcare Website' });
  const d = project({ slug: 'other-travel-cat', industry: 'Hospitality', category: 'Travel & Tourism Website' });
  assert.deepEqual(relatedProjects([a, b, c, d], a).map((p) => p.slug), ['maharaj-car', 'other-travel-cat']);
  assert.deepEqual(relatedProjects([a, b, c, d], c).map((p) => p.slug), []);
});

test('portfolio filter + search, and https-only live links', () => {
  const list = [
    project({ slug: 'n', title: 'News Sukh Dukh', category: 'News & Publishing Platform', technologies: ['Next.js'] }),
    project({ slug: 'i', title: 'Ideal Hair', category: 'Business Website & Online Store' }),
  ];
  assert.deepEqual(filterProjects(list, { query: 'next.js' }).map((p) => p.slug), ['n']);
  assert.deepEqual(filterProjects(list, { category: 'Business Website & Online Store' }).map((p) => p.slug), ['i']);
  assert.deepEqual(filterProjects(list, { query: 'hair ideal' }).map((p) => p.slug), ['i']);
  assert.equal(filterProjects(list, { query: 'zzz' }).length, 0);
  assert.deepEqual(liveLinks(project({ links: [{ label: 'Live', url: 'https://idealhair.in/' }, { label: 'Bad', url: 'http://x' }, { label: 'JS', url: 'javascript:alert(1)' }] })), [{ label: 'Live', url: 'https://idealhair.in/' }]);
});

test('uploaded image paths resolve against the API origin', () => {
  assert.equal(mediaUrl('/api/files/public/0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7', 'https://api.globalantic.com/api'), 'https://api.globalantic.com/api/files/public/0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7');
  assert.equal(mediaUrl('https://res.cloudinary.com/x.png', 'https://api.globalantic.com/api'), 'https://res.cloudinary.com/x.png');
  assert.equal(absoluteImage(null), undefined);
  assert.equal(absoluteImage('https://cdn.example/x.png'), 'https://cdn.example/x.png');
});

// ---------------------------------------------------------------- blog

const post = (p: Partial<BlogPost> & { archivedAt?: string | null }): BlogPost =>
  ({ id: p.slug, slug: 'p', title: 'T', excerpt: 'E', content: 'C', author: 'Globalantic', tags: [], readingTime: 3, published: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', publishedAt: '2026-01-01T00:00:00.000Z', category: null, ...p }) as BlogPost;

test('only published, unarchived, already-live posts are public', () => {
  assert.equal(isPublicPost(post({})), true);
  assert.equal(isPublicPost(post({ published: false })), false);
  assert.equal(isPublicPost(post({ archivedAt: '2026-02-01T00:00:00.000Z' })), false);
  assert.equal(isPublicPost(post({ publishedAt: new Date(Date.now() + 86_400_000).toISOString() })), false, 'scheduled');
});

test('blog search, tag lookup, related posts and pagination', () => {
  const crm = { id: 'c1', slug: 'crm', name: 'CRM' };
  const list = [
    post({ slug: 'a', title: 'How a CRM improves lead management', tags: ['CRM', 'Sales'], category: crm }),
    post({ slug: 'b', title: 'Website SEO foundations', tags: ['SEO'] }),
    post({ slug: 'c', title: 'Choosing software', tags: ['Sales'] }),
    post({ slug: 'd', title: 'Another CRM note', category: crm }),
  ];
  assert.deepEqual(searchPosts(list, 'crm lead').map((p) => p.slug), ['a']);
  assert.equal(searchPosts(list, '  ').length, 4);
  assert.equal(tagSlug('AI Automation'), 'ai-automation');
  assert.deepEqual(postsWithTag(list, 'sales').posts.map((p) => p.slug), ['a', 'c']);
  assert.equal(postsWithTag(list, 'sales').tag, 'Sales');
  assert.equal(postsWithTag(list, 'nope').tag, null);
  assert.deepEqual(relatedPosts(list, list[0]).map((p) => p.slug), ['d', 'c'], 'same category, then shared tag');

  const many = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(paginate(many, '2', 9).items, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.equal(paginate(many, '99', 9).page, 3, 'clamped to the last page');
  assert.equal(paginate(many, 'abc', 9).page, 1);
  assert.equal(paginate([], '1', 9).totalPages, 1);
  assert.equal(listingHref('/blog', { q: ' crm ', page: 2 }), '/blog?q=crm&page=2');
  assert.equal(listingHref('/blog', { page: 1 }), '/blog');
  assert.deepEqual(listingSeo('/blog', 'crm', undefined), { path: '/blog', noindex: true });
  assert.deepEqual(listingSeo('/blog', undefined, '3'), { path: '/blog?page=3', noindex: false });
});

test('markdown: CMS content can never inject markup, scripts or unsafe links', () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    assert.equal(b.type, 'p');
    // Raw HTML stays as text tokens (React escapes text), never a markup node.
    assert.ok(b.type === 'p' && b.inline.every((t) => t.type === 'text'));
  }
  for (const evil of ['[click](javascript:alert(1))', '[click](javascript:void(0))', '[c](JAVASCRIPT:x)', '[c](vbscript:x)']) {
    assert.ok(parseInline(evil).every((t) => t.type === 'text'), evil);
  }
  assert.deepEqual(parseInline('[x](//evil.example)'), [{ type: 'text', text: 'x' }]);
  assert.deepEqual(parseInline('[docs](https://nextjs.org)'), [{ type: 'link', text: 'docs', href: 'https://nextjs.org' }]);
  assert.equal(safeHref('/contact'), '/contact');
  assert.equal(safeHref('mailto:info@globalantic.com'), 'mailto:info@globalantic.com');
  assert.equal(safeHref('data:text/html,hi'), null);
});

test('markdown: headings, lists, quotes and inline styles', () => {
  const md = '## Why it matters\nIntro **bold** and *em* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> Editor note: review before publishing\n\n### Details';
  const blocks = parseMarkdown(md);
  assert.deepEqual(blocks.map((b) => b.type), ['h2', 'p', 'ul', 'ol', 'quote', 'h3']);
  assert.deepEqual(extractHeadings(md), [
    { id: 'why-it-matters', text: 'Why it matters', level: 2 },
    { id: 'details', text: 'Details', level: 3 },
  ]);
  const p = blocks[1];
  assert.ok(p.type === 'p' && p.inline.some((t) => t.type === 'strong') && p.inline.some((t) => t.type === 'em') && p.inline.some((t) => t.type === 'code'));
});

// ---------------------------------------------------------------- sitemap / robots

test('sitemap: published posts and used categories only; no previews, drafts or admin', async () => {
  const entries = await sitemap();
  const urls = entries.map((e) => e.url);
  assert.ok(!urls.some((u) => u.includes('/blog/preview') || u.includes('/admin') || u.includes('/blog/tag/')));
  const published = buildBlogPosts().filter((p) => p.published !== false);
  for (const u of urls.filter((x) => /\/blog\/(?!category\/)[^/]+$/.test(x))) {
    assert.ok(published.some((p) => u.endsWith(`/blog/${p.slug}`)), `${u} is a published post`);
  }
  const used = new Set(published.map((p) => p.category?.slug).filter(Boolean));
  for (const u of urls.filter((x) => x.includes('/blog/category/'))) {
    assert.ok(used.has(u.split('/blog/category/')[1]), `${u} has posts`);
  }
});

test('robots: draft previews are disallowed in production', () => {
  const before = process.env.ALLOW_INDEXING;
  process.env.ALLOW_INDEXING = 'true';
  try {
    const disallow = (robots().rules as { disallow: string[] }).disallow;
    assert.ok(disallow.includes('/blog/preview'));
  } finally {
    if (before === undefined) delete process.env.ALLOW_INDEXING;
    else process.env.ALLOW_INDEXING = before;
  }
});
