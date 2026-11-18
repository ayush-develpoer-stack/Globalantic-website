'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, CalendarCheck, CheckCircle2, Send } from 'lucide-react';
import { Field, Input, Textarea, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { getAttribution, trackClick } from '@/lib/attribution';
import { BUDGET_OPTIONS, SERVICE_OPTIONS, TIMELINE_OPTIONS, siteConfig } from '@/lib/config';
import { contactSchema as schema, type ContactInput } from '@/lib/validation/forms';
import { formsService } from '@/services/forms.service';
import styles from './ContactForm.module.css';

type FormValues = ContactInput;

const STEPS: { title: string; fields: (keyof FormValues)[] }[] = [
  { title: 'Your project', fields: ['service', 'budget', 'timeline'] },
  { title: 'Details', fields: ['message'] },
  { title: 'Contact', fields: ['name', 'email', 'phone', 'company', 'contactPreference', 'marketingConsent'] },
];
const FIELD_KEYS = STEPS.flatMap((s) => s.fields);

/** Prompts that help visitors describe what matters for each kind of project. */
function messageHint(service?: string): string {
  const s = (service ?? '').toLowerCase();
  if (/maintenance|support/.test(s)) return 'Your website or app address, how it is built (if known), and what needs regular care or fixing.';
  if (/api|integration/.test(s)) return 'Which systems should be connected, what data moves between them, and how often?';
  if (/aeo|geo|answer|generative/.test(s)) return 'Your website, the questions customers ask before buying, and how you want your business described.';
  if (/web|e-?commerce/.test(s)) return 'What should the website do? Pages, features (e.g. payments, booking, admin panel), and any sites you like.';
  if (/mobile|app/.test(s)) return 'What should the app do? Android, iOS or both, main features, and whether you need an admin panel.';
  if (/crm|erp|software/.test(s)) return 'Which processes should the system handle, who will use it, and what tools do you use today?';
  if (/\bai\b|automation/.test(s)) return 'Which task do you want to automate or improve with AI, and what data is involved?';
  if (/aeo|geo|answer|generative/.test(s)) return 'Your website, the questions customers ask before buying, and how you want your business described.';
  if (/seo|marketing/.test(s)) return 'Your website, target audience or locations, and the results you want to improve.';
  if (/ui|ux|design|brand/.test(s)) return 'What needs designing (screens, website, app, brand) and what exists today?';
  return 'Tell us what you want to build or improve, and any deadlines or constraints.';
}

interface ContactFormProps {
  /** Pre-selected service (service pages). */
  defaultService?: string;
  /** Which form sent it, e.g. contact_page, quote_page, service_page:<slug>. */
  source?: string;
}

/**
 * Multi-step project enquiry. Every valid submission becomes a CRM lead on the server
 * (with this page's attribution); the confirmation shows the enquiry reference.
 */
export function ContactForm({ defaultService, source = 'contact_page' }: ContactFormProps) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<{ reference: string | null; service?: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { service: defaultService ?? '', contactPreference: '', marketingConsent: false },
  });
  const service = watch('service');
  // A service page's own name is always selectable, even if it is not in the generic list.
  const serviceOptions: readonly string[] = defaultService && !(SERVICE_OPTIONS as readonly string[]).includes(defaultService) ? [defaultService, ...SERVICE_OPTIONS] : SERVICE_OPTIONS;

  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

  async function next() {
    if (await trigger(STEPS[step].fields)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const r = await formsService.submitContact(values, {
        source,
        ...getAttribution(),
        website: honeypot.current?.value ?? '',
        elapsedMs: Date.now() - shownAt.current,
      });
      setDone({ reference: r.reference ?? null, service: values.service || undefined });
      reset({ service: defaultService ?? '', contactPreference: '', marketingConsent: false });
      setStep(0);
    } catch (err) {
      // Entered values are kept so the visitor can correct and resubmit.
      const fieldErrors = isServiceError(err) ? err.fieldErrors : [];
      setServerError(fieldErrors.length ? 'Please check the highlighted fields.' : errorMessage(err));
      let firstStep = -1;
      fieldErrors.forEach((e) => {
        if ((FIELD_KEYS as string[]).includes(e.field)) {
          setError(e.field as keyof FormValues, { message: e.message });
          const idx = STEPS.findIndex((s) => (s.fields as string[]).includes(e.field));
          if (firstStep === -1 || idx < firstStep) firstStep = idx;
        }
      });
      if (firstStep >= 0) setStep(firstStep);
    }
  }

  if (done) {
    return (
      <div className={styles.success} role="status">
        <CheckCircle2 size={40} className={styles.successIcon} aria-hidden />
        <h3>Thank you — we have your enquiry</h3>
        {done.reference && (
          <p>
            Your reference: <strong>{done.reference}</strong>
          </p>
        )}
        <ol className={styles.nextSteps}>
          <li>We review your requirements.</li>
          <li>We contact you by email or phone to arrange a consultation.</li>
          <li>After the consultation you receive a proposal with scope, timeline and cost.</li>
        </ol>
        <p className={styles.muted}>A confirmation has been sent to your email. Want to talk sooner?</p>
        <div className={styles.successActions}>
          <WhatsAppButton service={done.service} reference={done.reference} label="enquiry_confirmation" />
          {siteConfig.bookingUrl && (
            <Button href={siteConfig.bookingUrl} external variant="outline">
              <CalendarCheck size={18} aria-hidden /> Book a consultation
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setDone(null)}>
          Send another enquiry
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <ol className={styles.steps} aria-label="Enquiry steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={[styles.stepItem, i === step ? styles.stepCurrent : '', i < step ? styles.stepDone : ''].join(' ')} aria-current={i === step ? 'step' : undefined}>
            <span className={styles.stepNum}>{i + 1}</span>
            <span className={styles.stepTitle}>{s.title}</span>
          </li>
        ))}
      </ol>
      <p ref={headingRef} tabIndex={-1} className={styles.stepHeading}>
        Step {step + 1} of {STEPS.length}: {STEPS[step].title}
      </p>

      {serverError && (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      )}

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div className={styles.hp} aria-hidden>
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" ref={honeypot} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div hidden={step !== 0} className={styles.stepBody}>
        <Field label="What do you need help with?" htmlFor="contact-service" error={errors.service?.message}>
          <Select id="contact-service" invalid={!!errors.service} {...register('service')}>
            <option value="">Select a service</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className={styles.row}>
          <Field label="Approximate budget" htmlFor="contact-budget" error={errors.budget?.message}>
            <Select id="contact-budget" invalid={!!errors.budget} {...register('budget')}>
              <option value="">Select a range</option>
              {BUDGET_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When do you want to start?" htmlFor="contact-timeline" error={errors.timeline?.message}>
            <Select id="contact-timeline" invalid={!!errors.timeline} {...register('timeline')}>
              <option value="">Select a timeline</option>
              {TIMELINE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div hidden={step !== 1} className={styles.stepBody}>
        <Field label="Describe your project" htmlFor="contact-message" required error={errors.message?.message}>
          <Textarea id="contact-message" rows={7} placeholder={messageHint(service)} invalid={!!errors.message} {...register('message')} />
        </Field>
      </div>

      <div hidden={step !== 2} className={styles.stepBody}>
        <div className={styles.row}>
          <Field label="Name" htmlFor="contact-name" required error={errors.name?.message}>
            <Input id="contact-name" autoComplete="name" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Email" htmlFor="contact-email" required error={errors.email?.message}>
            <Input id="contact-email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </Field>
        </div>
        <div className={styles.row}>
          <Field label="Phone / WhatsApp" htmlFor="contact-phone" error={errors.phone?.message}>
            <Input id="contact-phone" type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} />
          </Field>
          <Field label="Company" htmlFor="contact-company" error={errors.company?.message}>
            <Input id="contact-company" autoComplete="organization" invalid={!!errors.company} {...register('company')} />
          </Field>
        </div>
        <Field label="How should we contact you?" htmlFor="contact-pref" error={errors.contactPreference?.message}>
          <Select id="contact-pref" invalid={!!errors.contactPreference} {...register('contactPreference')}>
            <option value="">No preference</option>
            <option value="email">Email</option>
            <option value="phone">Phone call</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
        <label className={styles.consent}>
          <input type="checkbox" {...register('marketingConsent')} />
          <span>Send me occasional updates from Globalantic (optional — we reply to your enquiry either way).</span>
        </label>
        <p className={styles.privacy}>
          We use these details only to respond to your enquiry. See our <Link href="/privacy-policy">privacy policy</Link>.
        </p>
      </div>

      <div className={styles.navRow}>
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={18} aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="lg"
            onClick={() => {
              if (step === 0) trackClick('cta_click', 'enquiry_step_1', service);
              void next();
            }}
          >
            Continue <ArrowRight size={18} aria-hidden />
          </Button>
        ) : (
          <Button type="submit" size="lg" loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? (
              'Sending…'
            ) : (
              <>
                Send enquiry <Send size={18} aria-hidden />
              </>
            )}
          </Button>
        )}
      </div>
    </form>
  );
}
