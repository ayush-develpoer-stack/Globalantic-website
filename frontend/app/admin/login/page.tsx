'use client';

import Image from 'next/image';
import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { safeAdminRedirect } from '@/lib/auth/redirect';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { isMockMode } from '@/lib/api/config';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { MOCK_DEMO_ACCOUNT } from '@/lib/mock/fixtures/users';
import { validate } from '@/lib/validation/admin';
import { loginSchema } from '@/lib/validation/forms';
import { authService } from '@/services/auth.service';
import styles from '../admin.module.css';

type Errors = Partial<Record<'email' | 'password', string>>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const checked = validate(loginSchema, { email, password });
    if (!checked.ok) {
      setErrors(Object.fromEntries(checked.errors.map((er) => [er.field, er.message])) as Errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await authService.login(checked.data);
      router.replace(safeAdminRedirect(params.get('next')));
    } catch (err) {
      if (isServiceError(err) && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((er) => [er.field, er.message])) as Errors);
      }
      setFormError(errorMessage(err, 'Sign-in failed. Please try again.'));
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.authForm} onSubmit={handleSubmit} noValidate>
      {formError && (
        <p className={styles.formError} role="alert">
          <AlertCircle size={18} aria-hidden /> {formError}
        </p>
      )}

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          invalid={Boolean(errors.email)}
          onChange={(e) => setEmail(e.target.value)}
          aria-required
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={errors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          invalid={Boolean(errors.password)}
          onChange={(e) => setPassword(e.target.value)}
          aria-required
        />
      </Field>

      <Button type="submit" fullWidth loading={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className={styles.authWrap}>
      <div className={styles.authTheme}>
        <ThemeToggle />
      </div>
      <div className={styles.authCard}>
        <div className={styles.authHead}>
          <Image src="/logo.svg" alt="Globalantic" width={52} height={52} unoptimized />
          <h1 className={styles.authTitle}>Admin sign in</h1>
          <p className={styles.authSub}>Manage Globalantic website content and enquiries.</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {/* MOCK MODE only: the demo account unlocks the in-browser mock data. */}
        {isMockMode && (
          <p className={styles.demoHint}>
            Demo mode — sign in with <code>{MOCK_DEMO_ACCOUNT.email}</code> / <code>{MOCK_DEMO_ACCOUNT.password}</code>.
            Changes are kept in this browser tab only.
          </p>
        )}

        <Link href="/" className={styles.authBack}>
          ← Back to website
        </Link>
      </div>
    </main>
  );
}
