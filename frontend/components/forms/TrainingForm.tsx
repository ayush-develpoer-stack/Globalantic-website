'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Send } from 'lucide-react';
import { Field, Input, Textarea, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { trainingSchema as schema, type TrainingInput } from '@/lib/validation/forms';
import { formsService } from '@/services/forms.service';
import styles from './TrainingForm.module.css';

const QUALIFICATION_OPTIONS = [
  '12th',
  'Diploma',
  'Undergraduate',
  'Graduate',
  'Fresher',
  'Other',
] as const;

const EXPERIENCE_OPTIONS = ['None', 'Beginner', 'Intermediate', 'Advanced'] as const;

// Shared with the service layer so client and server rules cannot drift.
type FormValues = TrainingInput;

const FIELD_KEYS: (keyof FormValues)[] = [
  'fullName',
  'phone',
  'whatsapp',
  'email',
  'age',
  'qualification',
  'college',
  'city',
  'mode',
  'codingExperience',
  'whyJoin',
  'preferredContactTime',
];

export function TrainingForm() {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await formsService.submitTraining(values);
      setDone(true);
      reset();
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
        <h3>Application received</h3>
        <p>
          Thank you for applying to the Full Stack Development Internship Program. Our team will
          review your application and reach out to you soon.
        </p>
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
        <Field label="Full name" htmlFor="tr-fullName" required error={errors.fullName?.message}>
          <Input id="tr-fullName" autoComplete="name" invalid={!!errors.fullName} {...register('fullName')} />
        </Field>

        <Field label="Email" htmlFor="tr-email" required error={errors.email?.message}>
          <Input id="tr-email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Phone" htmlFor="tr-phone" required error={errors.phone?.message}>
          <Input id="tr-phone" type="tel" autoComplete="tel" invalid={!!errors.phone} {...register('phone')} />
        </Field>

        <Field label="WhatsApp number" htmlFor="tr-whatsapp" error={errors.whatsapp?.message}>
          <Input id="tr-whatsapp" type="tel" invalid={!!errors.whatsapp} {...register('whatsapp')} />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Age" htmlFor="tr-age" error={errors.age?.message}>
          <Input id="tr-age" type="number" min={10} max={100} invalid={!!errors.age} {...register('age')} />
        </Field>

        <Field label="Qualification" htmlFor="tr-qualification" required error={errors.qualification?.message}>
          <Select id="tr-qualification" defaultValue="" invalid={!!errors.qualification} {...register('qualification')}>
            <option value="" disabled>
              Select your qualification
            </option>
            {QUALIFICATION_OPTIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="College / Institute" htmlFor="tr-college" error={errors.college?.message}>
          <Input id="tr-college" invalid={!!errors.college} {...register('college')} />
        </Field>

        <Field label="City" htmlFor="tr-city" error={errors.city?.message}>
          <Input id="tr-city" autoComplete="address-level2" invalid={!!errors.city} {...register('city')} />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Preferred mode" htmlFor="tr-mode" required error={errors.mode?.message}>
          <Select id="tr-mode" defaultValue="" invalid={!!errors.mode} {...register('mode')}>
            <option value="" disabled>
              Select a mode
            </option>
            <option value="OFFLINE">Offline (Bhopal)</option>
            <option value="ONLINE">Online (India)</option>
          </Select>
        </Field>

        <Field label="Coding experience" htmlFor="tr-experience" error={errors.codingExperience?.message}>
          <Select id="tr-experience" defaultValue="" invalid={!!errors.codingExperience} {...register('codingExperience')}>
            <option value="" disabled>
              Select your experience level
            </option>
            {EXPERIENCE_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Preferred contact time" htmlFor="tr-contactTime" error={errors.preferredContactTime?.message}>
        <Input
          id="tr-contactTime"
          placeholder="e.g. Weekdays after 5 PM"
          invalid={!!errors.preferredContactTime}
          {...register('preferredContactTime')}
        />
      </Field>

      <Field label="Why do you want to join?" htmlFor="tr-whyJoin" error={errors.whyJoin?.message}>
        <Textarea
          id="tr-whyJoin"
          placeholder="Tell us about your goals and what you hope to learn…"
          invalid={!!errors.whyJoin}
          {...register('whyJoin')}
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
