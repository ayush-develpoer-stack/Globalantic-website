'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Input, PageHeader, Textarea, useAsync, useSession, useToast } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

const FIELDS = ['companyName', 'email', 'secondaryEmail', 'phone', 'whatsapp', 'address', 'footerDescription', 'ctaText', 'defaultSeoTitle', 'defaultSeoDesc', 'linkedinUrl', 'instagramUrl', 'facebookUrl', 'twitterUrl', 'youtubeUrl', 'mapUrl', 'mapEmbedUrl'] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string>;

const SOCIAL: { key: Field; label: string }[] = [
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'instagramUrl', label: 'Instagram' },
  { key: 'facebookUrl', label: 'Facebook' },
  { key: 'twitterUrl', label: 'X / Twitter' },
  { key: 'youtubeUrl', label: 'YouTube' },
];

const fromRow = (r: Row): Form => Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? ''])) as Form;

/** Client-side checks mirroring the server rules (the server validates again). */
function localErrors(v: Form): Record<string, string> {
  const e: Record<string, string> = {};
  for (const { key, label } of SOCIAL) if (v[key] && !/^https:\/\//.test(v[key].trim())) e[key] = `${label}: use the full https:// profile URL`;
  if (v.mapEmbedUrl && !/^https:\/\/www\.google\.com\/maps\/embed\?pb=/.test(v.mapEmbedUrl.trim())) e.mapEmbedUrl = 'Paste only the src URL from the embed code (it starts with https://www.google.com/maps/embed?pb=)';
  return e;
}

export default function SiteSettingsPage() {
  const { user } = useSession();
  const toast = useToast();
  const state = useAsync(() => api().cms.settings(), 'site-settings');
  const [v, setV] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.data) setV(fromRow(state.data));
  }, [state.data]);

  if (user && user.role !== 'ADMIN') return <Alert tone="warning">Only administrators can change site settings.</Alert>;

  const set = (p: Partial<Form>) => setV((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!v) return;
    const local = localErrors(v);
    setErrors(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const body: Row = Object.fromEntries(FIELDS.map((f) => [f, v[f].trim()]));
      // The API requires a valid email when one is sent; an empty value keeps the current one.
      if (!body.email) delete body.email;
      if (!body.companyName) delete body.companyName;
      await api().cms.saveSettings(body);
      toast('Site settings saved', 'success');
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Site settings"
        description="Contact details, social profiles and the office map shown on the public website. Only enter verified information — empty fields are simply not shown."
        actions={<Button size="sm" onClick={save} loading={pending} disabled={!v}>Save settings</Button>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <AsyncView state={state}>
        {() =>
          v && (
            <div className={s.grid}>
              <div className={s.stackSm}>
                <Card title="Contact details">
                  <div className={s.stackSm}>
                    <Input label="Company name" value={v.companyName} error={errors.companyName} onChange={(e) => set({ companyName: e.target.value })} />
                    <Input label="Primary email" type="email" value={v.email} error={errors.email} hint="Main public contact address, e.g. info@globalantic.com" onChange={(e) => set({ email: e.target.value })} />
                    <Input label="Secondary email" type="email" value={v.secondaryEmail} error={errors.secondaryEmail} hint="Optional second address shown next to the primary one. Leave empty to hide it." onChange={(e) => set({ secondaryEmail: e.target.value })} />
                    <Input label="Phone" value={v.phone} error={errors.phone} hint="Shown with a click-to-call link, e.g. +91 76978 45157" onChange={(e) => set({ phone: e.target.value })} />
                    <Input label="WhatsApp number" value={v.whatsapp} error={errors.whatsapp} hint="International format, e.g. +91 76978 45157" onChange={(e) => set({ whatsapp: e.target.value })} />
                    <Textarea label="Office address" rows={3} value={v.address} error={errors.address} hint="Only the verified office address." onChange={(e) => set({ address: e.target.value })} />
                  </div>
                </Card>
                <Card title="Google Maps">
                  <div className={s.stackSm}>
                    <Alert tone="info">Leave both fields empty until the office address is verified — no map is shown on the website without them.</Alert>
                    <Input
                      label="Google Maps link"
                      type="url"
                      value={v.mapUrl}
                      error={errors.mapUrl}
                      hint="Google Maps → your verified business location → Share → Copy link (https://maps.app.goo.gl/…)."
                      onChange={(e) => set({ mapUrl: e.target.value })}
                    />
                    <Textarea
                      label="Map embed URL"
                      rows={3}
                      value={v.mapEmbedUrl}
                      error={errors.mapEmbedUrl}
                      hint="Google Maps → Share → Embed a map → Copy HTML, then paste only the src URL (https://www.google.com/maps/embed?pb=…). No API key is needed."
                      onChange={(e) => set({ mapEmbedUrl: e.target.value })}
                    />
                  </div>
                </Card>
              </div>
              <div className={s.stackSm}>
                <Card title="Social profiles">
                  <div className={s.stackSm}>
                    <p className={s.small}>Only real profiles. Empty fields are hidden on the website.</p>
                    {SOCIAL.map(({ key, label }) => (
                      <Input key={key} label={label} type="url" placeholder="https://…" value={v[key]} error={errors[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Form>)} />
                    ))}
                  </div>
                </Card>
                <Card title="Website text">
                  <div className={s.stackSm}>
                    <Textarea label="Footer description" rows={3} value={v.footerDescription} error={errors.footerDescription} onChange={(e) => set({ footerDescription: e.target.value })} />
                    <Input label="Main call-to-action text" value={v.ctaText} error={errors.ctaText} onChange={(e) => set({ ctaText: e.target.value })} />
                    <Input label="Default SEO title" value={v.defaultSeoTitle} error={errors.defaultSeoTitle} onChange={(e) => set({ defaultSeoTitle: e.target.value })} />
                    <Textarea label="Default SEO description" rows={2} value={v.defaultSeoDesc} error={errors.defaultSeoDesc} onChange={(e) => set({ defaultSeoDesc: e.target.value })} />
                  </div>
                </Card>
              </div>
            </div>
          )
        }
      </AsyncView>
    </>
  );
}
