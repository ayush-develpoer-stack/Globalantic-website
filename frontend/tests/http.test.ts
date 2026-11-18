import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '@/lib/api/http';
import { ServiceError } from '@/lib/api/errors';

/** Retry/timeout rules of the API client, against a stubbed fetch (no network). */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(responses: (number | 'network')[]) {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(String(init.method));
    const next = responses.shift() ?? 200;
    if (next === 'network') throw new TypeError('fetch failed');
    const ok = next < 400;
    return new Response(JSON.stringify(ok ? { success: true, data: { n: 1 } } : { success: false, message: 'Service temporarily unavailable. Please try again shortly.' }), {
      status: next,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

test('GET retries once after a transient 503 and succeeds', async () => {
  const calls = stubFetch([503, 200]);
  assert.deepEqual(await apiRequest('GET', '/services'), { n: 1 });
  assert.deepEqual(calls, ['GET', 'GET']);
});

test('GET retries once after a network failure, then reports the server message', async () => {
  const calls = stubFetch(['network', 503, 503]);
  await assert.rejects(apiRequest('GET', '/services'), (err: unknown) => err instanceof ServiceError && err.status === 503);
  assert.equal(calls.length, 2, 'at most one retry');
});

test('writes (POST/PUT/PATCH/DELETE) are never retried', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    const calls = stubFetch([503, 200]);
    await assert.rejects(apiRequest(method, '/contact', { body: {} }), (err: unknown) => err instanceof ServiceError && err.status === 503);
    assert.equal(calls.length, 1, `${method} must not be retried`);
  }
  const calls = stubFetch(['network', 200]);
  await assert.rejects(apiRequest('POST', '/contact', { body: {} }), (err: unknown) => err instanceof ServiceError && err.status === 0);
  assert.equal(calls.length, 1);
});

test('a failed request while online says the server is unreachable, not the visitor connection', async () => {
  stubFetch(['network']);
  const log = console.error;
  console.error = () => {};
  try {
    await assert.rejects(apiRequest('POST', '/contact', { body: {} }), (err: unknown) =>
      err instanceof ServiceError && err.status === 0 && /could not reach our server/.test(err.message),
    );
  } finally {
    console.error = log;
  }
});

test('a failed request while offline tells the visitor they are offline', async () => {
  stubFetch(['network']);
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    await assert.rejects(apiRequest('POST', '/contact', { body: {} }), (err: unknown) =>
      err instanceof ServiceError && err.status === 0 && /offline/.test(err.message),
    );
  } finally {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
  }
});
