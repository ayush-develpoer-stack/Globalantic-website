'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { ErrorState, Skeleton } from '@/components/ui/StateView';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useServiceQuery } from '@/hooks/useServiceQuery';
import { errorMessage, isServiceError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { settingsSchema, validate, type SettingsInput } from '@/lib/validation/admin';
import { settingsService } from '@/services/admin/settings.service';
import type { AdminSettings } from '@/types';
import styles from '../../admin.module.css';

type SettingsKey = keyof SettingsInput;

interface FieldDef {
  name: SettingsKey;
  label: string;
  type?: 'text' | 'textarea' | 'email' | 'url' | 'tel';
  full?: boolean;
  required?: boolean;
  help?: string;
}

const GROUPS: { id: string; label: string; fields: FieldDef[] }[] = [
  {
    id: 'general',
    label: 'General',
    fields: [
      { name: 'companyName', label: 'Company name', required: true },
      { name: 'ctaText', label: 'Primary call-to-action text', required: true, help: 'Shown on the main “Get in touch” buttons.' },
      { name: 'logoUrl', label: 'Logo URL', type: 'url', full: true },
      { name: 'footerDescription', label: 'Footer description', type: 'textarea', full: true },
    ],
  },
  {
    id: 'contact',
    label: 'Contact & social',
    fields: [
      { name: 'email', label: 'Public email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'whatsapp', label: 'WhatsApp number', type: 'tel', help: 'Digits with country code, e.g. 9198…' },
      { name: 'address', label: 'Address' },
      { name: 'linkedinUrl', label: 'LinkedIn URL', type: 'url' },
      { name: 'instagramUrl', label: 'Instagram URL', type: 'url' },
      { name: 'facebookUrl', label: 'Facebook URL', type: 'url' },
      { name: 'twitterUrl', label: 'X / Twitter URL', type: 'url' },
      { name: 'youtubeUrl', label: 'YouTube URL', type: 'url' },
    ],
  },
  {
    id: 'location',
    label: 'Office location (map)',
    fields: [
      { name: 'mapUrl', label: 'Google Maps link', type: 'url', full: true, help: 'Open your verified office in Google Maps → Share → Copy link. Leave empty to show no map link.' },
      { name: 'mapEmbedUrl', label: 'Google Maps embed URL', type: 'url', full: true, help: 'Google Maps → Share → Embed a map → copy only the src="…" value (starts with https://www.google.com/maps/embed?pb=). No API key needed. Leave empty to show no map.' },
    ],
  },
  {
    id: 'seo',
    label: 'SEO',
    fields: [
      { name: 'defaultSeoTitle', label: 'Default SEO title', required: true, full: true, help: 'Used when a page has no title of its own (max 200 characters).' },
      { name: 'defaultSeoDesc', label: 'Default meta description', type: 'textarea', full: true, help: 'Max 400 characters.' },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

function toForm(settings: AdminSettings): Record<SettingsKey, string> {
  return Object.fromEntries(ALL_FIELDS.map((f) => [f.name, String(settings[f.name] ?? '')])) as Record<SettingsKey, string>;
}

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useServiceQuery(() => settingsService.get(), 'settings');
  const [values, setValues] = useState<Record<SettingsKey, string> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<SettingsKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(GROUPS[0].id);

  useEffect(() => {
    if (data) setValues(toForm(data));
  }, [data]);

  const initial = useMemo(() => (data ? toForm(data) : null), [data]);
  const dirty = Boolean(values && initial && JSON.stringify(values) !== JSON.stringify(initial));

  function setValue(name: SettingsKey, value: string) {
    setValues((v) => (v ? { ...v, [name]: value } : v));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!values || saving) return;
    setFormError(null);
    const result = validate(settingsSchema, values);
    if (!result.ok) {
      const next = Object.fromEntries(result.errors.map((er) => [er.field, er.message])) as Partial<Record<SettingsKey, string>>;
      setErrors(next);
      // Jump to the first tab that has an error so it is visible.
      const firstBad = GROUPS.find((g) => g.fields.some((f) => next[f.name]));
      if (firstBad) setTab(firstBad.id);
      setFormError('Some settings need attention. Fields with errors are marked below.');
      return;
    }
    setSaving(true);
    try {
      const saved = await settingsService.update(result.data);
      setData(() => saved);
      setErrors({});
      toast.success('Settings saved', 'Changes apply to the website on its next refresh.');
    } catch (err) {
      if (isServiceError(err) && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((er) => [er.field, er.message])));
      }
      setFormError(errorMessage(err, 'Could not save settings.'));
    } finally {
      setSaving(false);
    }
  }

  const tabs: TabDef[] = GROUPS.map((g) => {
    const count = g.fields.filter((f) => errors[f.name]).length;
    return {
      id: g.id,
      label: g.label,
      badge: count ? (
        <span className={styles.tabError}>
          ({count}<span className="sr-only"> {count === 1 ? 'error' : 'errors'}</span>)
        </span>
      ) : undefined,
    };
  });
  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0];

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          data ? `Company details, contact channels and default SEO. Last updated ${formatDateTime(data.updatedAt)}.` : 'Company details, contact channels and default SEO.'
        }
      />

      {error ? (
        <div className={styles.panel}>
          <ErrorState title="Could not load settings" message={error} onRetry={reload} />
        </div>
      ) : loading || !values ? (
        <div className={styles.settingsCard} aria-busy="true">
          <div style={{ display: 'grid', gap: 18, paddingTop: 24 }}>
            <Skeleton width={260} height={20} />
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={96} />
          </div>
        </div>
      ) : (
        <form className={styles.settingsCard} onSubmit={onSubmit} noValidate>
          <Tabs tabs={tabs} active={tab} onChange={setTab} label="Settings sections">
            {formError && (
              <p className={styles.formError} role="alert">
                <AlertCircle size={18} aria-hidden /> {formError}
              </p>
            )}
            <div className={styles.formGrid}>
              {group.fields.map((f) => {
                const id = `settings-${f.name}`;
                const helpId = f.help ? `${id}-help` : undefined;
                const props = {
                  id,
                  value: values[f.name],
                  invalid: Boolean(errors[f.name]),
                  'aria-describedby': helpId,
                  'aria-required': f.required || undefined,
                };
                return (
                  <div key={f.name} className={f.full || f.type === 'textarea' ? styles.fullRow : undefined}>
                    <Field label={f.label} htmlFor={id} required={f.required} error={errors[f.name]}>
                      {f.type === 'textarea' ? (
                        <Textarea {...props} rows={4} onChange={(e) => setValue(f.name, e.target.value)} />
                      ) : (
                        <Input
                          {...props}
                          type={f.type ?? 'text'}
                          autoComplete="off"
                          onChange={(e) => setValue(f.name, e.target.value)}
                        />
                      )}
                      {f.help && (
                        <span id={helpId} className={styles.help}>
                          {f.help}
                        </span>
                      )}
                    </Field>
                  </div>
                );
              })}
            </div>
          </Tabs>

          <div className={styles.formActions}>
            {dirty && !saving && <span className={styles.dirtyNote}>Unsaved changes</span>}
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => {
                if (initial) setValues(initial);
                setErrors({});
                setFormError(null);
              }}
            >
              Discard changes
            </Button>
            <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
