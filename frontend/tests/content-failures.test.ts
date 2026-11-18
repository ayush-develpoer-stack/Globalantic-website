import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceError } from '@/lib/api/errors';

/**
 * Detail pages call notFound() on `null`, so an API outage must not look like a missing item
 * (it would be cached as a 404). API mode, against a stubbed fetch (no network).
 */
process.env.NEXT_PUBLIC_DATA_SOURCE = 'api';
process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test/api';
const { contentService } = await import('@/services/content.service');

const realFetch = globalThis.fetch;
const realError = console.error;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

function stubStatus(status: number) {
  console.error = () => {};
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(status < 400 ? { success: true, data: [] } : { success: false, message: status === 404 ? 'Not found' : 'Service temporarily unavailable. Please try again shortly.' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

test('a genuine 404 resolves to null (page shows not-found)', async () => {
  stubStatus(404);
  assert.equal(await contentService.getService('missing'), null);
  assert.equal(await contentService.getSolution('missing'), null);
});

test('an outage (503) is rethrown for detail lookups instead of becoming a 404', async () => {
  stubStatus(503);
  for (const load of [
    () => contentService.getService('seo'),
    () => contentService.getSolution('crm'),
    () => contentService.getIndustry('education'),
    () => contentService.getPortfolioProject('x'),
    () => contentService.getBlogPost('x'),
    () => contentService.getLandingPage('x'),
  ]) {
    await assert.rejects(load(), (err: unknown) => err instanceof ServiceError && err.status === 503);
  }
});

test('list lookups still degrade to null during an outage', async () => {
  stubStatus(503);
  assert.equal(await contentService.getServices(), null);
  assert.equal(await contentService.getSolutions(), null);
});
