'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import type { StudentProfile } from '@globalantic/types';
import { Alert, AsyncView, Button, Card, DescriptionList, Input, PageHeader, formatDate, toDateInput, useAsync, useToast } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

function ProfileForm({ profile, onSaved }: { profile: StudentProfile; onSaved: (p: StudentProfile) => void }) {
  const toast = useToast();
  const p = profile.studentProfile;
  const [form, setForm] = useState({
    name: profile.name,
    city: p?.city ?? '',
    dateOfBirth: toDateInput(p?.dateOfBirth),
    qualification: p?.qualification ?? '',
    institution: p?.institution ?? '',
    graduationYear: p?.graduationYear ? String(p.graduationYear) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setError(null);
    try {
      const updated = await api().student.updateProfile({
        name: form.name,
        city: form.city,
        dateOfBirth: form.dateOfBirth,
        qualification: form.qualification,
        institution: form.institution,
        ...(form.graduationYear ? { graduationYear: Number(form.graduationYear) } : {}),
      });
      onSaved(updated);
      toast('Profile updated');
    } catch (err) {
      setErrors(fieldErrorMap(err));
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Input label="City" value={form.city} onChange={set('city')} error={errors.city} autoComplete="address-level2" />
        <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={errors.dateOfBirth} />
        <Input label="Highest qualification" value={form.qualification} onChange={set('qualification')} error={errors.qualification} />
        <Input label="College / institution" value={form.institution} onChange={set('institution')} error={errors.institution} />
        <Input label="Graduation year" type="number" inputMode="numeric" min={1970} max={2040} value={form.graduationYear} onChange={set('graduationYear')} error={errors.graduationYear} />
      </div>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (next !== confirm) {
      setErrors({ confirm: 'Passwords do not match' });
      return;
    }
    setPending(true);
    try {
      const r = await api().auth.changePassword(current, next);
      toast(r.message || 'Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setErrors(fieldErrorMap(err));
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword} />
      <Input label="New password" type="password" autoComplete="new-password" required hint="At least 8 characters, with a letter and a number." value={next} onChange={(e) => setNext(e.target.value)} error={errors.newPassword} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <div className={s.actions}>
        <Button type="submit" variant="secondary" loading={pending}>
          Change password
        </Button>
      </div>
      <p className={s.small}>Changing your password signs you out on all other devices.</p>
    </form>
  );
}

export default function ProfilePage() {
  usePageTitle('Profile');
  const state = useAsync(() => api().student.profile(), 'profile');
  const [saved, setSaved] = useState<StudentProfile | null>(null);
  useEffect(() => setSaved(null), [state.data]);

  return (
    <div className={s.stack}>
      <PageHeader title="My profile" description="Keep your details up to date. Email and phone changes are handled by our support team." />
      <AsyncView state={state}>
        {(loaded) => {
          const profile = saved ?? loaded;
          return (
            <div className={s.grid2}>
              <div className={s.stack}>
                <Card title="Account">
                  <DescriptionList
                    items={[
                      { label: 'Email', value: profile.email },
                      { label: 'Email verified', value: profile.emailVerifiedAt ? `Yes (${formatDate(profile.emailVerifiedAt)})` : 'Not yet' },
                      { label: 'Phone', value: profile.phone ? `+${profile.phone}` : '—' },
                      { label: 'Member since', value: formatDate(profile.createdAt) },
                    ]}
                  />
                  <p className={s.small} style={{ marginTop: 12 }}>
                    To change your email or phone number, raise a request from Help &amp; support.
                  </p>
                </Card>
                <Card title="Change password">
                  <PasswordForm />
                </Card>
              </div>
              <Card title="Personal & education details">
                <ProfileForm key={profile.name + (profile.studentProfile?.city ?? '')} profile={profile} onSaved={setSaved} />
              </Card>
            </div>
          );
        }}
      </AsyncView>
    </div>
  );
}
