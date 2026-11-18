import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { themeScript } from '@/app/theme-script';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { safeAdminRedirect } from '@/lib/auth/redirect';
import { apiRequest } from '@/lib/api/http';
import { ServiceError } from '@/lib/api/errors';

/** Runs the inline <head> theme script against a fake browser and returns the applied theme. */
function runThemeScript(opts: { stored?: string | null; prefersDark?: boolean; storageThrows?: boolean }): string {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const window = {
    localStorage: {
      getItem(key: string) {
        if (opts.storageThrows) throw new Error('SecurityError');
        return key === THEME_STORAGE_KEY ? (opts.stored ?? null) : null;
      },
    },
    matchMedia: (q: string) => ({ matches: Boolean(opts.prefersDark) && q.includes('dark') }),
  };
  runInNewContext(themeScript, { window, document: { documentElement: root } });
  assert.equal(root.style.colorScheme, root.dataset.theme);
  return root.dataset.theme;
}

test('theme script: stored choice wins over the OS setting', () => {
  assert.equal(runThemeScript({ stored: 'light', prefersDark: true }), 'light');
  assert.equal(runThemeScript({ stored: 'dark', prefersDark: false }), 'dark');
});

test('theme script: first visit follows the OS setting', () => {
  assert.equal(runThemeScript({ stored: null, prefersDark: true }), 'dark');
  assert.equal(runThemeScript({ stored: null, prefersDark: false }), 'light');
  assert.equal(runThemeScript({ stored: 'garbage', prefersDark: false }), 'light');
});

test('theme script: blocked storage never throws and falls back to light', () => {
  assert.equal(runThemeScript({ storageThrows: true }), 'light');
});

test('post-login redirect only allows same-app admin paths', () => {
  assert.equal(safeAdminRedirect('/admin/dashboard/contacts?status=NEW'), '/admin/dashboard/contacts?status=NEW');
  for (const bad of ['https://evil.example', '//evil.example', '/admin/../x://y', '/admin/\\evil', '/blog', null, undefined, '']) {
    assert.equal(safeAdminRedirect(bad), '/admin/dashboard', `rejects ${String(bad)}`);
  }
});

// --- HTTP client (API mode adapter) ------------------------------------------
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
}

test('http: unwraps the success envelope', async () => {
  mockFetch(200, { success: true, message: 'ok', data: { id: '1' } });
  assert.deepEqual(await apiRequest('GET', '/x'), { id: '1' });
});

test('http: maps API validation errors to ServiceError.fieldErrors', async () => {
  mockFetch(422, {
    success: false,
    message: 'Validation failed',
    errors: [{ field: 'email', message: 'A valid email is required' }],
  });
  await assert.rejects(
    apiRequest('POST', '/contact', { body: {} }),
    (err: unknown) => err instanceof ServiceError && err.status === 422 && err.fieldErrors[0]?.field === 'email',
  );
});

test('http: network failure becomes status 0', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await assert.rejects(apiRequest('GET', '/x'), (err: unknown) => err instanceof ServiceError && err.status === 0);
});

test('http: non-JSON response is reported, not swallowed', async () => {
  globalThis.fetch = (async () => new Response('<html>502</html>', { status: 502 })) as typeof fetch;
  await assert.rejects(apiRequest('GET', '/x'), (err: unknown) => err instanceof ServiceError && err.status === 502);
});
