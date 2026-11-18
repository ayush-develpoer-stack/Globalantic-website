import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { MOCK_DEMO_ACCOUNT, MOCK_DEMO_USER } from '@/lib/mock/fixtures/users';
import { simulateLatency } from '@/lib/mock/runtime';
import { validate } from '@/lib/validation/admin';
import { loginSchema, type LoginInput } from '@/lib/validation/forms';
import type { AdminUser } from '@/types';

/**
 * Admin authentication. In API mode the backend sets an httpOnly cookie; the
 * browser never sees the token. The server remains the authority — this
 * client state only decides what UI to show.
 */

const MOCK_SESSION_KEY = 'globalantic.mock.session';

function readMockSession(): boolean {
  try {
    return window.sessionStorage.getItem(MOCK_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMockSession(active: boolean): void {
  try {
    if (active) window.sessionStorage.setItem(MOCK_SESSION_KEY, '1');
    else window.sessionStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    // storage blocked: the session simply will not survive a reload
  }
}

// MOCK MODE: one fictional demo account; the session lasts for the tab.
const mock = {
  async login(input: LoginInput): Promise<AdminUser> {
    const result = validate(loginSchema, input);
    if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
    await simulateLatency();
    const matches =
      result.data.email.toLowerCase() === MOCK_DEMO_ACCOUNT.email && result.data.password === MOCK_DEMO_ACCOUNT.password;
    // Same generic message as the backend: never reveal which field was wrong.
    if (!matches) throw new ServiceError('Invalid email or password', 401);
    writeMockSession(true);
    return MOCK_DEMO_USER;
  },
  async logout(): Promise<void> {
    await simulateLatency();
    writeMockSession(false);
  },
  async me(): Promise<AdminUser | null> {
    await simulateLatency();
    return readMockSession() ? MOCK_DEMO_USER : null;
  },
};

const api: typeof mock = {
  async login(input) {
    const { user } = await http.post<{ user: AdminUser }>('/auth/login', input);
    return user;
  },
  async logout() {
    await http.post<null>('/auth/logout');
  },
  async me() {
    try {
      const { user } = await http.get<{ user: AdminUser }>('/auth/me');
      return user;
    } catch (err) {
      // 401 simply means "not signed in"; anything else is a real failure.
      if (err instanceof ServiceError && err.status === 401) return null;
      throw err;
    }
  },
};

export const authService = isMockMode ? mock : api;
