import { apiConfig, type MockScenario } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';

/**
 * MOCK MODE runtime helpers: simulated latency and predictable scenarios.
 *
 * Scenario comes from NEXT_PUBLIC_MOCK_SCENARIO, and in the browser can be
 * overridden per tab for manual QA with:
 *   localStorage.setItem('globalantic.mockScenario', 'error')   // or empty | slow | normal
 * Scenarios only affect *reads* of admin/list data ('empty' / 'error') and
 * latency ('slow'); writes keep their real validation behaviour.
 */

export const MOCK_SCENARIO_STORAGE_KEY = 'globalantic.mockScenario';

const LATENCY_MS: Record<MockScenario, number> = { normal: 350, empty: 350, error: 350, slow: 2000 };

export function currentScenario(): MockScenario {
  if (typeof window !== 'undefined') {
    try {
      const override = window.localStorage.getItem(MOCK_SCENARIO_STORAGE_KEY);
      if (override === 'normal' || override === 'empty' || override === 'error' || override === 'slow') {
        return override;
      }
    } catch {
      // storage blocked — fall through to the configured scenario
    }
  }
  return apiConfig.mockScenario;
}

/** Waits like a network round-trip would. No delay during server rendering. */
export function simulateLatency(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const ms = LATENCY_MS[currentScenario()];
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throws the same kind of error a failed API read would, in the 'error' scenario. */
export function failIfErrorScenario(): void {
  if (currentScenario() === 'error') {
    throw new ServiceError('Could not reach the server. Please try again.', 0);
  }
}

export function isEmptyScenario(): boolean {
  return currentScenario() === 'empty';
}

/** Deep copy so callers can never mutate the mock store through a returned object. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

let counter = 0;
/** Unique-enough id for records created in mock mode. */
export function mockId(prefix: string): string {
  counter += 1;
  return `${prefix}-new-${Date.now().toString(36)}-${counter}`;
}
