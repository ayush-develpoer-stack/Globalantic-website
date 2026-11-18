import type { Metadata } from 'next';
import { LoginForm } from '@globalantic/ui';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <LoginForm title="Employee sign in" subtitle="Use the account invited by Globalantic HR." defaultNext="/" />;
}
