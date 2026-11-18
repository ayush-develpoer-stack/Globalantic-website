/**
 * Data-source configuration. Only NEXT_PUBLIC_* values are read here — this
 * module ships to the browser, so it must never reference server secrets.
 *
 *   NEXT_PUBLIC_DATA_SOURCE   'mock' | 'api'
 *   NEXT_PUBLIC_API_URL       e.g. https://api.globalantic.com/api (no trailing slash)
 *   NEXT_PUBLIC_MOCK_SCENARIO 'normal' | 'empty' | 'error' | 'slow' (mock mode only)
 *
 * Default: 'api' everywhere. Mock data is used ONLY when NEXT_PUBLIC_DATA_SOURCE=mock
 * is set explicitly (local demo / UI work without a backend), and never in a
 * production build unless someone deliberately sets it.
 */
export type DataSource = 'mock' | 'api';
export type MockScenario = 'normal' | 'empty' | 'error' | 'slow';

const SCENARIOS: readonly MockScenario[] = ['normal', 'empty', 'error', 'slow'];

function resolveDataSource(): DataSource {
  const raw = process.env.NEXT_PUBLIC_DATA_SOURCE;
  if (raw === 'mock' || raw === 'api') return raw;
  return 'api';
}

export const apiConfig = {
  dataSource: resolveDataSource(),
  // Production never falls back to localhost: unset => '' and requests fail with a configuration error.
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000/api')).replace(/\/+$/, ''),
  mockScenario: (SCENARIOS as readonly string[]).includes(process.env.NEXT_PUBLIC_MOCK_SCENARIO ?? '')
    ? (process.env.NEXT_PUBLIC_MOCK_SCENARIO as MockScenario)
    : 'normal',
} as const;

export const isMockMode = apiConfig.dataSource === 'mock';
