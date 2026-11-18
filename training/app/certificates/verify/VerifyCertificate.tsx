'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import type { CertificateVerification } from '@globalantic/types';
import { Alert, Button, Card, DescriptionList, Input, formatDate } from '@globalantic/ui';
import s from '@/styles/site.module.css';

const CODE = /^[A-Za-z0-9]{4,20}$/;

export function VerifyCertificate() {
  const router = useRouter();
  const initial = (useSearchParams().get('code') ?? '').toUpperCase();
  const [code, setCode] = useState(initial);
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const check = async (value: string) => {
    if (!CODE.test(value)) {
      setFieldError('Enter the verification code printed on the certificate');
      return;
    }
    setFieldError(undefined);
    setPending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api().catalog.verifyCertificate(value));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (initial) void check(initial);
    // run once for a code supplied in the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={s.stack}>
      <form
        className={s.formCard}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/certificates/verify?code=${encodeURIComponent(code.trim())}`);
          void check(code.trim());
        }}
        aria-label="Verify a certificate"
      >
        <Input label="Verification code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={fieldError} maxLength={20} className={s.codeBox} autoComplete="off" />
        <Button type="submit" loading={pending}>
          Verify
        </Button>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      {result && !result.valid && result.status !== 'REVOKED' && (
        <Alert tone="danger" title="No certificate found">
          We could not find a certificate with this code. Check the code and try again.
        </Alert>
      )}
      {result?.status === 'REVOKED' && (
        <Alert tone="danger" title="Certificate revoked">
          Certificate {result.certificateNumber} has been revoked and is no longer valid.
        </Alert>
      )}
      {result?.valid && result.type === 'program' && (
        <Card title="Valid certificate">
          <Alert tone="success">This certificate was issued by Globalantic.</Alert>
          <div style={{ marginTop: 12 }}>
            <DescriptionList
              items={[
                { label: 'Certificate', value: result.certificateTitle ?? 'Certificate of Completion' },
                { label: 'Certificate no.', value: result.certificateNumber },
                { label: 'Awarded to', value: result.studentName },
                { label: 'Program', value: result.program },
                { label: 'Issued on', value: formatDate(result.issuedAt) },
                { label: 'Status', value: 'Valid' },
              ]}
            />
          </div>
        </Card>
      )}
      {result?.valid && result.type !== 'program' && (
        <Card title="Valid certificate">
          <Alert tone="success">This certificate was issued by Globalantic Training.</Alert>
          <div style={{ marginTop: 12 }}>
            <DescriptionList
              items={[
                { label: 'Certificate no.', value: result.certificateNumber },
                { label: 'Awarded to', value: result.studentName },
                { label: 'Course', value: result.course },
                { label: 'Batch', value: result.batch },
                { label: 'Period', value: result.period ? `${formatDate(result.period.start)} – ${formatDate(result.period.end)}` : '—' },
                { label: 'Issued on', value: formatDate(result.issuedAt) },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
