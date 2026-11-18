import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMockStore, getMockStore } from '@/lib/mock/store';
import { ServiceError } from '@/lib/api/errors';
import { cmsService } from '@/services/admin/cms.service';
import { leadsService } from '@/services/admin/leads.service';
import { dashboardService } from '@/services/admin/dashboard.service';
import { settingsService } from '@/services/admin/settings.service';
import { formsService } from '@/services/forms.service';
import { authService } from '@/services/auth.service';
import { contentService } from '@/services/content.service';
import { MOCK_DEMO_ACCOUNT } from '@/lib/mock/fixtures/users';

beforeEach(() => resetMockStore());

async function rejectsWith(promise: Promise<unknown>, status: number): Promise<ServiceError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ServiceError, 'expected a ServiceError');
    assert.equal(err.status, status);
    return err;
  }
  assert.fail(`expected rejection with status ${status}`);
}

const newService = { slug: 'test-service', title: 'Test Service', shortDesc: 'Short', overview: 'Overview' };

test('public content comes from the seed fixtures', async () => {
  const services = await contentService.getServices();
  assert.equal(services?.length, 19);
  assert.equal((await contentService.getService('web-development'))?.title, 'Web Development');
  assert.equal(await contentService.getService('does-not-exist'), null);
  assert.equal((await contentService.getPortfolio())?.length, 0);
});

test('CMS list paginates and filters by visibility', async () => {
  const page = await cmsService.list('services', { pageSize: 10 });
  assert.equal(page.meta.total, 19);
  assert.equal(page.items.length, 10);
  assert.equal(page.meta.totalPages, 2);
  assert.equal((await cmsService.list('blog', { status: 'DRAFT' })).meta.total, 0);
});

test('CMS create validates input (422 with field errors)', async () => {
  const err = await rejectsWith(cmsService.create('services', { ...newService, slug: 'Bad Slug' }), 422);
  assert.ok(err.fieldErrors.some((e) => e.field === 'slug'));
});

test('CMS create rejects a duplicate slug (409, like the API)', async () => {
  const err = await rejectsWith(cmsService.create('services', { ...newService, slug: 'web-development' }), 409);
  assert.equal(err.fieldErrors[0]?.field, 'slug');
});

test('CMS create → update → publish toggle → delete', async () => {
  const created = await cmsService.create('services', newService);
  assert.equal(created.published, true);
  const updated = await cmsService.update('services', created.id, { title: 'Renamed' });
  assert.equal(updated.title, 'Renamed');
  const hidden = await cmsService.setPublished('services', created.id, false);
  assert.equal(hidden.published, false);
  await cmsService.remove('services', created.id);
  await rejectsWith(cmsService.get('services', created.id), 404);
});

test('blog posts start as drafts and get publishedAt when published', async () => {
  const post = await cmsService.create('blog', { slug: 'draft-post', title: 'Draft', excerpt: 'E', content: 'C' });
  assert.equal(post.published, false);
  const live = await cmsService.setPublished('blog', post.id, true);
  assert.ok(typeof live.publishedAt === 'string');
  const unpublished = await cmsService.setPublished('blog', post.id, false);
  assert.equal(unpublished.publishedAt, null);
});

test('returned records are copies — callers cannot mutate the store', async () => {
  const page = await cmsService.list('services', {});
  page.items[0].title = 'Mutated';
  assert.notEqual(getMockStore().cms.services[0].title, 'Mutated');
});

test('lead status update validates the status and persists it', async () => {
  const [first] = (await leadsService.list('contacts', {})).items;
  await rejectsWith(leadsService.updateStatus('contacts', first.id, 'HIRED'), 422);
  const updated = await leadsService.updateStatus('contacts', first.id, 'CONVERTED');
  assert.equal(updated.status, 'CONVERTED');
  await rejectsWith(leadsService.updateStatus('contacts', 'missing-id', 'NEW'), 404);
});

test('lead delete removes the record and missing ids are 404', async () => {
  const before = await leadsService.list('careers', {});
  await leadsService.remove('careers', before.items[0].id);
  assert.equal((await leadsService.list('careers', {})).meta.total, before.meta.total - 1);
  await rejectsWith(leadsService.remove('careers', before.items[0].id), 404);
});

test('a contact form submission appears in the admin inbox and dashboard', async () => {
  const before = (await dashboardService.get()).stats.totalLeads;
  const res = await formsService.submitContact({ name: 'New Person', email: 'new@example.com', message: 'Hello there, a new project.' });
  assert.match(res.message, /sent/);
  const dash = await dashboardService.get();
  assert.equal(dash.stats.totalLeads, before + 1);
  assert.equal(dash.recentLeads[0].email, 'new@example.com');
});

test('invalid form submissions are rejected before anything is stored', async () => {
  const before = getMockStore().contacts.length;
  await rejectsWith(formsService.submitContact({ name: 'X', email: 'bad', message: 'short' }), 422);
  assert.equal(getMockStore().contacts.length, before);
});

test('newsletter: duplicate subscription is reported, not duplicated', async () => {
  await formsService.subscribeNewsletter({ email: 'Repeat@Example.com' });
  const again = await formsService.subscribeNewsletter({ email: 'repeat@example.com' });
  assert.equal(again.message, 'You are already subscribed.');
  assert.equal(getMockStore().newsletter.filter((s) => s.email === 'repeat@example.com').length, 1);
});

test('settings update validates and persists', async () => {
  const current = await settingsService.get();
  const input = {
    companyName: current.companyName,
    email: current.email,
    defaultSeoTitle: current.defaultSeoTitle,
    ctaText: 'Talk to us',
    linkedinUrl: 'https://www.linkedin.com/company/example',
  };
  await rejectsWith(settingsService.update({ ...input, email: 'nope' }), 422);
  const saved = await settingsService.update(input);
  assert.equal(saved.ctaText, 'Talk to us');
  assert.equal((await settingsService.get()).linkedinUrl, 'https://www.linkedin.com/company/example');
});

test('mock login: wrong password gets the generic 401; demo account succeeds', async () => {
  const err = await rejectsWith(authService.login({ email: MOCK_DEMO_ACCOUNT.email, password: 'wrong' }), 401);
  assert.equal(err.message, 'Invalid email or password');
  await rejectsWith(authService.login({ email: 'someone@example.com', password: MOCK_DEMO_ACCOUNT.password }), 401);
  const user = await authService.login({ ...MOCK_DEMO_ACCOUNT });
  assert.equal(user.role, 'ADMIN');
});
