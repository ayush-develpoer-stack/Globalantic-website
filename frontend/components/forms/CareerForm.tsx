'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Send } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { careerSchema as schema, type CareerInput } from '@/lib/validation/forms';
import { formsService } from '@/services/forms.service';
import styles from './CareerForm.module.css';

// Shared with the service layer so client and server rules cannot drift.
type FormValues = CareerInput;

const FIELD_KEYS: (keyof FormValues)[] = [
  'name',
  'email',
  'phone',
  'position',
  'resumeUrl',
  'portfolioUrl',
  'message',
];

interface CareerFormProps {
  defaultPosition?: string;
}

export function CareerForm({ defaultPosition }: CareerFormProps) {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { position: defaultPosition ?? '' },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await formsService.submitCareer(values);
      setDone(true);
      reset({ position: defaultPosition ?? '' });
    } catch (err) {
      // Entered values are kept so the visitor can correct and resubmit.
      const fieldErrors = isServiceError(err) ? err.fieldErrors : [];
      setServerError(fieldErrors.length ? 'Please check the highlighted fields.' : errorMessage(err));
      fieldErrors.forEach((e) => {
        if ((FIELD_KEYS as string[]).includes(e.field)) {
          setError(e.field as keyof FormValues, { message: e.message });
        }
      });
    }
  }


  if (done) {
    return (
      <div className={styles.success} role="status">
        <CheckCircle2 size={40} className={styles.successIcon} />
        <h3>Application submitted</h3>
        <p>Thanks for your interest in joining Globalantic. We&apos;ll be in touch if there&apos;s a fit.</p>
        <Button variant="outline" size="sm" onClick={() => setDone(false)}>
          Submit another application
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {serverError && (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      )}

      <div className={styles.row}>
        <Field label="Name" htmlFor="ca-name" required error={errors.name?.message}>
          <Input id="ca-name" autoComplete="name" invalid={!!errors.name} {...register('name')} />
        </Field>

        <Field label="Email" htmlFor="ca-email" required error={errors.email?.message}>
          <Input id="ca-email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Phone" htmlFor="ca-phone" error={errors.phone?.message}>
          <Input id="ca-phone" type="tel" autoComplete="tel" invalid={!!errors.phone} {...register('phone')} />
        </Field>

        <Field label="Position" htmlFor="ca-position" required error={errors.position?.message}>
          <Input
            id="ca-position"
            placeholder="e.g. Full Stack Developer"
            invalid={!!errors.position}
            {...register('position')}
          />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Resume URL" htmlFor="ca-resume" error={errors.resumeUrl?.message}>
          <Input
            id="ca-resume"
            type="url"
            placeholder="https://…"
            invalid={!!errors.resumeUrl}
            {...register('resumeUrl')}
          />
        </Field>

        <Field label="Portfolio URL" htmlFor="ca-portfolio" error={errors.portfolioUrl?.message}>
          <Input
            id="ca-portfolio"
            type="url"
            placeholder="https://…"
            invalid={!!errors.portfolioUrl}
            {...register('portfolioUrl')}
          />
        </Field>
      </div>

      <Field label="Message" htmlFor="ca-message" error={errors.message?.message}>
        <Textarea
          id="ca-message"
          placeholder="Tell us a little about yourself and why you'd like to join…"
          invalid={!!errors.message}
          {...register('message')}
        />
      </Field>

      <p className={styles.privacy}>
        We use these details only to process your application. See our <Link href="/privacy-policy">privacy policy</Link>.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        {isSubmitting ? 'Submitting…' : (
          <>
            Submit application <Send size={18} aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
