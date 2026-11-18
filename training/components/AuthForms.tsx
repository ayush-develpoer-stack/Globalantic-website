'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { AuthUser } from '@globalantic/types';
import { Alert, Button, Input, LoadingState } from '@globalantic/ui';
import { ButtonLink } from './ButtonLink';
import { safeInternalPath, siteUrls } from '@/lib/config';
import s from '@/styles/site.module.css';

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';
const strongEnough = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/** Where a user lands after signing in on the training site. */
export function destinationFor(user: AuthUser, next: string | null): string {
  const internal = safeInternalPath(next);
  if (internal) return internal;
  if (user.role === 'STUDENT') return `${siteUrls.internPortal}/`;
  if (user.role === 'TRAINER') return `${siteUrls.trainer}/`;
  return `${siteUrls.admin}/`;
}

export function LoginPanel() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = params.get('next');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!email.trim()) local.email = 'Enter your email';
    if (!password) local.password = 'Enter your password';
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const { user } = await api().auth.login(email.trim(), password);
      window.location.assign(destinationFor(user, next));
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
      setPending(false);
    }
  };

  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Sign in">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      <Input label="Password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
      <Button type="submit" full loading={pending}>
        Sign in
      </Button>
      <p className={s.formFoot}>
        <Link href="/forgot-password">Forgot password?</Link> · New here? <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>Create an account</Link>
      </p>
    </form>
  );
}

export function VerifyEmailPanel() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? '' : 'This verification link is incomplete. Open the link from your email again.');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React strict-mode double effects.
    if (!token || started.current) return;
    started.current = true;
    api()
      .auth.verifyEmail(token)
      .then((r) => {
        setState('ok');
        setMessage(r.message);
      })
      .catch((err) => {
        setState('error');
        setMessage(errorMessage(err));
      });
  }, [token]);

  if (state === 'loading') return <LoadingState label="Verifying your email…" rows={1} />;
  return (
    <div className={s.formCard}>
      <Alert tone={state === 'ok' ? 'success' : 'danger'} title={state === 'ok' ? 'Email verified' : 'Verification failed'}>
        {message}
      </Alert>
      {state === 'ok' ? (
        <ButtonLink href="/login" full>
          Sign in
        </ButtonLink>
      ) : (
        <p className={s.formFoot}>
          Sign in to request a new verification link, or <Link href="/contact">contact us</Link>.
        </p>
      )}
    </div>
  );
}

export function ForgotPasswordPanel() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldError('Enter a valid email address');
      return;
    }
    setFieldError(undefined);
    setPending(true);
    setError(null);
    try {
      const r = await api().auth.forgotPassword(email.trim());
      setDone(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className={s.formCard}>
        <Alert tone="success" title="Check your inbox">
          {done}
        </Alert>
        <p className={s.formFoot}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }
  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Reset password request">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
      <Button type="submit" full loading={pending}>
        Send reset link
      </Button>
      <p className={s.formFoot}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordPanel() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className={s.formCard}>
        <Alert tone="danger" title="Invalid link">
          This reset link is incomplete. Request a new one.
        </Alert>
        <ButtonLink href="/forgot-password" full>
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!strongEnough(password)) local.password = PASSWORD_HINT;
    if (confirm !== password) local.confirm = 'Passwords do not match';
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const r = await api().auth.resetPassword(token, password);
      setDone(r.message);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className={s.formCard}>
        <Alert tone="success" title="Password updated">
          {done}
        </Alert>
        <ButtonLink href="/login" full>
          Sign in
        </ButtonLink>
      </div>
    );
  }
  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Choose a new password">
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="New password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={PASSWORD_HINT} />
      <Input label="Confirm new password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <Button type="submit" full loading={pending}>
        Save password
      </Button>
    </form>
  );
}
