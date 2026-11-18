'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Input, Textarea } from '@globalantic/ui';
import s from '@/styles/site.module.css';

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.name.trim().length < 2) local.name = 'Please enter your name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) local.email = 'Enter a valid email address';
    if (form.message.trim().length < 10) local.message = 'Please add a few more details (at least 10 characters)';
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const r = await api().catalog.enquiry({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, message: form.message.trim() });
      setDone(r.message || 'Thanks — we have received your enquiry.');
      setForm({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={s.formCard} onSubmit={submit} noValidate aria-label="Enquiry form">
      {done && <Alert tone="success" title="Enquiry sent">{done}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Your name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} maxLength={120} />
        <Input label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} maxLength={254} />
        <Input label="Phone (optional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={30} containerClassName={s.full} />
        <Textarea label="Your question" required value={form.message} onChange={set('message')} error={errors.message} maxLength={4000} rows={5} containerClassName={s.full} />
      </div>
      <Button type="submit" loading={pending}>
        Send enquiry
      </Button>
    </form>
  );
}
