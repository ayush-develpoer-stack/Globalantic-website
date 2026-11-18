'use client';

import { useState } from 'react';
import { Send, Check } from 'lucide-react';
import { errorMessage } from '@/lib/api/errors';
import { newsletterSchema } from '@/lib/validation/forms';
import { formsService } from '@/services/forms.service';
import styles from './NewsletterForm.module.css';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    const checked = newsletterSchema.safeParse({ email });
    if (!checked.success) {
      setStatus('error');
      setMessage(checked.error.errors[0]?.message ?? 'Please enter a valid email address');
      return;
    }
    setStatus('loading');
    try {
      const res = await formsService.subscribeNewsletter(checked.data);
      setStatus('done');
      setMessage(res.message);
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(errorMessage(err, 'Something went wrong. Please try again.'));
    }
  }

  if (status === 'done') {
    return (
      <p className={styles.done} role="status">
        <Check size={18} /> {message}
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="Your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={styles.input}
        aria-invalid={status === 'error' || undefined}
        aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
      />
      <button type="submit" className={styles.button} disabled={status === 'loading'} aria-label="Subscribe" aria-busy={status === 'loading' || undefined}>
        {status === 'loading' ? '...' : <Send size={18} />}
      </button>
      {status === 'error' && (
        <span id="newsletter-error" className={styles.error} role="alert">
          {message}
        </span>
      )}
    </form>
  );
}
