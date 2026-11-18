import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceError } from '@/lib/api/errors';
import { MOCK_SCENARIO_STORAGE_KEY } from '@/lib/mock/runtime';
import { leadsService } from '@/services/admin/leads.service';
import { dashboardService } from '@/services/admin/dashboard.service';

// Simulates the per-tab override a tester sets in the browser console.
let scenario = 'normal';
(globalThis as { window?: unknown }).window = {
  localStorage: { getItem: (key: string) => (key === MOCK_SCENARIO_STORAGE_KEY ? scenario : null) },
};
after(() => {
  delete (globalThis as { window?: unknown }).window;
});

test('empty scenario returns no rows', async () => {
  scenario = 'empty';
  assert.equal((await leadsService.list('contacts', {})).meta.total, 0);
  assert.equal((await dashboardService.get()).stats.totalLeads, 0);
});

test('error scenario rejects reads like a network failure', async () => {
  scenario = 'error';
  await assert.rejects(leadsService.list('contacts', {}), (err: unknown) => err instanceof ServiceError && err.status === 0);
});

test('normal scenario returns the fixtures', async () => {
  scenario = 'normal';
  assert.equal((await leadsService.list('contacts', {})).meta.total, 14);
});
