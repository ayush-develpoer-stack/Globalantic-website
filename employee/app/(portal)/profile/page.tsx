'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, Card, DescriptionList, Input, PageHeader, formatDate, useAsync, useToast } from '@globalantic/ui';
import type { Profile } from '@/lib/types';
import s from '@/lib/page.module.css';

function EmergencyForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const toast = useToast();
  const [name, setName] = useState(profile.employeeProfile.emergencyContactName ?? '');
  const [phone, setPhone] = useState(profile.employeeProfile.emergencyContactPhone ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    setName(profile.employeeProfile.emergencyContactName ?? '');
    setPhone(profile.employeeProfile.emergencyContactPhone ?? '');
  }, [profile]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      const updated = (await api().employee.updateProfile({ emergencyContactName: name.trim(), emergencyContactPhone: phone.trim() })) as Profile;
      onSaved(updated);
      toast('Emergency contact saved.', 'success');
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Contact name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} error={fields.emergencyContactName} autoComplete="off" />
        <Input label="Contact phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} error={fields.emergencyContactPhone} autoComplete="off" hint="Leave both empty to remove." />
      </div>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Save contact
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setFields({});
    if (next !== confirm) {
      setFields({ confirm: 'The new passwords do not match' });
      return;
    }
    setPending(true);
    try {
      const { message } = await api().auth.changePassword(current, next);
      toast(message || 'Password changed.', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} />
        <Input label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} error={fields.newPassword} hint="At least 8 characters with a letter and a number." />
        <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fields.confirm} />
      </div>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const state = useAsync(() => api().employee.profile() as Promise<Profile>, 'profile');
  return (
    <div className={s.stack}>
      <PageHeader title="My profile" description="Job details are maintained by HR. Contact HR through an HR request if anything is wrong." />
      <AsyncView state={state}>
        {(p) => {
          const e = p.employeeProfile;
          return (
            <div className={s.grid2}>
              <Card title="Job details">
                <DescriptionList
                  items={[
                    { label: 'Name', value: p.name },
                    { label: 'Email', value: p.email },
                    { label: 'Employee code', value: e.employeeCode },
                    { label: 'Department', value: e.department },
                    { label: 'Designation', value: e.designation },
                    { label: 'Employment type', value: enumLabel(e.employmentType) },
                    { label: 'Joining date', value: formatDate(e.joiningDate) },
                    { label: 'Manager', value: e.manager?.name ?? '—' },
                    { label: 'Work location', value: e.workLocation ?? '—' },
                  ]}
                />
              </Card>
              <div className={s.stack}>
                <Card title="Emergency contact">
                  <EmergencyForm profile={p} onSaved={(u) => state.setData(() => u)} />
                </Card>
                <Card title="Change password">
                  <PasswordForm />
                </Card>
              </div>
            </div>
          );
        }}
      </AsyncView>
    </div>
  );
}
