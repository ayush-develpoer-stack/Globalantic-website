'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Checkbox, Input } from '@globalantic/ui';
import { recallRef, rememberRef } from '@/lib/config';
import s from '@/styles/site.module.css';

const CODE = /^[A-Za-z0-9]{4,20}$/;

export function RegisterForm() {
  const params = useSearchParams();
  const refParam = (params.get('ref') ?? '').trim();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', city: '', dateOfBirth: '', referralCode: '' });
  const [consent, setConsent] = useState(false);
  const [refState, setRefState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const tracked = useRef(false);

  // Record the referral-link visit once and prefill the code.
  useEffect(() => {
    const code = refParam || recallRef();
    if (!code) return;
    setForm((f) => ({ ...f, referralCode: code.toUpperCase() }));
    if (!refParam || tracked.current || !CODE.test(refParam)) {
      if (refParam && !CODE.test(refParam)) setRefState('invalid');
      return;
    }
    tracked.current = true;
    api()
      .catalog.trackReferralClick(refParam)
      .then((r) => {
        setRefState(r.valid ? 'valid' : 'invalid');
        if (r.valid) rememberRef(refParam.toUpperCase());
      })
      .catch(() => setRefState('idle'));
  }, [refParam]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Enter a valid 10-digit mobile number';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Use at least 8 characters with a letter and a number';
    if (form.referralCode && !CODE.test(form.referralCode.trim())) e.referralCode = 'Referral codes contain only letters and numbers';
    if (!consent) e.consent = 'You must accept the terms and privacy policy';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const r = await api().auth.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        city: form.city.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        referralCode: form.referralCode.trim() || undefined,
        consent,
      });
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
        <Alert tone="success" title="Check your email">
          {done}
        </Alert>
        <p className={s.formFoot}>
          Already verified? <Link href="/login">Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Student registration">
      {refState === 'valid' && <Alert tone="success">Referral code {form.referralCode} applied.</Alert>}
      {refState === 'invalid' && <Alert tone="warning">This referral link is not valid. You can still register without it.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Full name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} maxLength={120} containerClassName={s.full} />
        <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} maxLength={254} />
        <Input label="Mobile number" type="tel" required autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} hint="Used only for admission updates." />
        <Input
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          maxLength={128}
          hint="At least 8 characters, including a letter and a number."
        />
        <Input label="City" autoComplete="address-level2" value={form.city} onChange={set('city')} error={errors.city} maxLength={120} />
        <Input label="Date of birth (optional)" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={errors.dateOfBirth} />
        <Input label="Referral code (optional)" value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value.toUpperCase() })} error={errors.referralCode} maxLength={20} autoComplete="off" />
        <div className={s.full}>
          <Checkbox
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            error={errors.consent}
            label={
              <>
                I agree to the{' '}
                <Link href="/terms" className={s.inlineLink} target="_blank">
                  terms of use
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className={s.inlineLink} target="_blank">
                  privacy policy
                </Link>
                .
              </>
            }
          />
        </div>
      </div>
      <Button type="submit" full loading={pending}>
        Create account
      </Button>
      <p className={s.formFoot}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
