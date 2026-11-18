import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { Suspense } from 'react';
import { LoadingState, PageHeader } from '@globalantic/ui';
import { VerifyCertificate } from './VerifyCertificate';
import s from '@/styles/site.module.css';

export async function generateMetadata(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const sp = await props.searchParams;
  // A looked-up result names the certificate holder: never index those URLs.
  return pageMeta({
    title: 'Verify a certificate',
    description: 'Check that a Globalantic Training certificate is genuine using the verification code printed on it.',
    path: '/certificates/verify',
    noindex: Object.keys(sp).length > 0,
  });
}

export default function VerifyCertificatePage() {
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader eyebrow="Certificates" title="Verify a certificate" description="Enter the verification code printed on the certificate." />
      <Suspense fallback={<LoadingState rows={1} />}>
        <VerifyCertificate />
      </Suspense>
    </div>
  );
}
