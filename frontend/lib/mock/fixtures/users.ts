import type { AdminUser } from '@/types';

/**
 * MOCK MODE demo account. It only unlocks the in-browser mock store — it is not
 * a real credential and is never sent anywhere. In API mode the real backend
 * authenticates and this file is unused.
 */
export const MOCK_DEMO_ACCOUNT = {
  email: 'demo.admin@example.com',
  password: 'demo-password',
} as const;

export const MOCK_DEMO_USER: AdminUser = {
  id: 'user-0001',
  email: MOCK_DEMO_ACCOUNT.email,
  name: 'Demo Admin',
  role: 'ADMIN',
};
