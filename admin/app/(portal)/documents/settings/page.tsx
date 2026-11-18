'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Checkbox, Input, PageHeader, Textarea, useAsync, useSession, useToast } from '@globalantic/ui';
import { DOC_TYPE_LABEL } from '@/lib/docs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

const TEXT_FIELDS: [string, string, Row?][] = [
  ['legalName', 'Legal name', { hint: 'Exactly as registered' }],
  ['tradeName', 'Trading name (shown next to the logo)'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['stateCode', 'GST state code', { hint: '2 digits, e.g. 23 for Madhya Pradesh', maxLength: 2 }],
  ['postalCode', 'PIN code'],
  ['country', 'Country'],
  ['email', 'Accounts email', { type: 'email' }],
  ['phone', 'Phone'],
  ['website', 'Website'],
  ['pan', 'PAN', { maxLength: 10 }],
  ['registrationNo', 'Company registration (CIN / LLPIN / Udyam)'],
  ['upiId', 'UPI id for payments'],
  ['signatoryName', 'Authorised signatory name'],
  ['signatoryTitle', 'Authorised signatory title'],
  ['footerNote', 'Footer note (optional)'],
];

function example(rule: Row) {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const period = rule.financialYear ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : String(now.getFullYear());
  return `${rule.prefix || '?'}/${period}/${'1'.padStart(Number(rule.padding) || 4, '0')}`;
}

function ProfileForm({ p, onSaved }: { p: Row; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Row>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setV({ ...p, gstRate: String(p.defaultGstRateBp / 100), bankDetails: p.bankDetails ?? '', numbering: JSON.parse(JSON.stringify(p.numbering)) }), [p]);
  if (!v.numbering) return null;
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  const setRule = (type: string, patch: Row) => setV({ ...v, numbering: { ...v.numbering, [type]: { ...v.numbering[type], ...patch } } });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Math.round(Number(v.gstRate) * 100);
    if (!Number.isFinite(rate) || rate < 0 || rate > 2800) return setError('The default GST rate must be between 0 and 28%.');
    setPending(true);
    setError(null);
    setErrors({});
    const body: Row = { gstRegistered: Boolean(v.gstRegistered), gstin: String(v.gstin ?? '').trim().toUpperCase(), defaultGstRateBp: rate, bankDetails: String(v.bankDetails ?? '').trim() };
    for (const [k] of TEXT_FIELDS) body[k] = String(v[k] ?? '').trim();
    body.pan = body.pan.toUpperCase();
    body.numbering = Object.fromEntries(Object.entries(v.numbering as Row).map(([t, r]) => [t, { prefix: String(r.prefix).trim().toUpperCase(), financialYear: Boolean(r.financialYear), padding: Number(r.padding) }]));
    try {
      await api().documents.saveProfile(body);
      toast('Company details saved', 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card title="Company details">
        <div className={s.formGrid}>
          {TEXT_FIELDS.map(([k, label, extra]) => (
            <Input key={k} label={label} value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} error={errors[k]} {...(extra ?? {})} />
          ))}
          <div className={s.span2}>
            <Textarea label="Bank details for invoices (account name, number, IFSC, bank)" rows={3} maxLength={1000} value={v.bankDetails ?? ''} onChange={(e) => set('bankDetails', e.target.value)} error={errors.bankDetails} />
          </div>
        </div>
      </Card>
      <Card title="GST">
        <div className={s.formGrid}>
          <div className={s.span2}>
            <Checkbox label="The company is GST-registered" checked={Boolean(v.gstRegistered)} onChange={(e) => set('gstRegistered', e.target.checked)} />
            <p className={s.small}>Switch this on only if the business holds a GST registration. Invoices are labelled “Tax invoice” and charge GST only when this is on and a valid GSTIN is saved.</p>
          </div>
          <Input label="GSTIN" maxLength={15} value={v.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} error={errors.gstin} />
          <Input label="Default GST rate (%)" inputMode="decimal" value={v.gstRate} onChange={(e) => set('gstRate', e.target.value)} error={errors.defaultGstRateBp} />
        </div>
      </Card>
      <Card title="Document numbering">
        <p className={s.muted}>Numbers are assigned when a document is issued and are never reused. Changing a prefix starts a new series.</p>
        <div className={s.spacer} />
        <div className={s.stackSm}>
          {Object.keys(DOC_TYPE_LABEL).map((t) => {
            const r = v.numbering[t] ?? { prefix: '', financialYear: true, padding: 4 };
            return (
              <div key={t} className={s.moduleCard}>
                <div className={s.rowBetween}>
                  <span className={s.strong}>{DOC_TYPE_LABEL[t]}</span>
                  <span className={s.mono}>Next looks like {example(r)}</span>
                </div>
                <div className={s.formGrid}>
                  <Input label="Prefix" maxLength={10} value={r.prefix} onChange={(e) => setRule(t, { prefix: e.target.value.toUpperCase() })} error={errors[`numbering.${t}.prefix`]} />
                  <Input label="Digits" inputMode="numeric" value={String(r.padding)} onChange={(e) => setRule(t, { padding: e.target.value })} error={errors[`numbering.${t}.padding`]} />
                  <div className={s.span2}>
                    <Checkbox label="Include the financial year (April–March)" checked={Boolean(r.financialYear)} onChange={(e) => setRule(t, { financialYear: e.target.checked })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>Save company details</Button>
      </div>
    </form>
  );
}

export default function DocumentSettingsPage() {
  const { can } = useSession();
  const state = useAsync(() => api().documents.profile(), 'doc-profile');
  if (!can('documents.settings')) return <Alert tone="warning">Only administrators can change company details.</Alert>;
  return (
    <>
      <PageHeader eyebrow={<Link href="/documents" className={s.link}>← Documents</Link>} title="Company details" description="Printed on every quotation, agreement, invoice, receipt and certificate. Nothing here is pre-filled: enter only real, registered details. Issued documents keep the details they were issued with." />
      <AsyncView state={state}>
        {(p) => (
          <div className={s.stack}>
            {p.gaps?.length > 0 ? (
              <Alert tone="warning" title="Documents will omit these until you fill them in">
                <ul style={{ paddingLeft: 18 }}>
                  {(p.gaps as string[]).map((g) => <li key={g}>{g}</li>)}
                </ul>
              </Alert>
            ) : (
              <Alert tone="success">Company details are complete.</Alert>
            )}
            <ProfileForm p={p} onSaved={state.reload} />
          </div>
        )}
      </AsyncView>
    </>
  );
}
