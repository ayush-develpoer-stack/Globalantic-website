import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { Check } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, formatINR } from '@globalantic/ui';
import { ButtonLink } from '@/components/ButtonLink';
import { siteUrls } from '@/lib/config';
import { load } from '@/lib/server';
import s from '@/styles/site.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: 'Certificate program',
  description: 'A self-paced Globalantic certificate program: complete the lessons, pass the final assessment and receive a certificate with a public verification code.',
  path: '/programs/certificate',
});

type Row = Record<string, any>;

const DISCLAIMER = 'The certificate confirms completion of a Globalantic program. It is not an academic degree or a government or university accreditation.';

/** FAQ built only from the program's real rules (no invented claims). */
function faqFor(p: Row) {
  const required = (p.lessons as Row[]).filter((l) => l.required).length;
  return [
    { q: 'When do I get the certificate?', a: `Only after you complete all ${required} required lesson(s) and pass the final assessment with at least ${p.passPercent}%. Paying the fee unlocks the program but does not by itself earn the certificate.` },
    { q: 'How many attempts do I get at the final assessment?', a: `${p.maxAttempts} attempt(s), each with a ${p.timeLimitMinutes}-minute time limit. Contact us if you need another attempt.` },
    { q: 'How is my payment confirmed?', a: 'Payments are made online through Razorpay and confirmed by our server with the payment provider. You receive an email confirmation with a PDF receipt.' },
    { q: 'How can someone check my certificate?', a: 'Every certificate has a unique number and verification code. Anyone can confirm it on the "Verify a certificate" page.' },
    { q: 'Is the certificate an accreditation?', a: DISCLAIMER },
  ];
}

export default async function CertificateProgramPage() {
  const result = await load((a) => a.programs.list());
  const programs = (result.data ?? []) as Row[];
  return (
    <div className={`container ${s.page}`}>
      <PageHeader
        eyebrow="Programmes"
        title="Certificate program"
        description="Learn at your own pace: complete the lessons, pass the final assessment and receive a certificate with a public verification code."
      />
      {!result.data ? (
        <ErrorState title="The program could not be loaded" message={result.error} />
      ) : programs.length === 0 ? (
        <EmptyState title="No certificate program is open for registration right now" description="Please check back later or contact us." />
      ) : (
        <div className={s.stack}>
          {programs.map((p) => {
            const required = (p.lessons as Row[]).filter((l) => l.required).length;
            return (
              <article key={p.id} className={s.stack} aria-labelledby={`program-${p.id}`}>
                <Card>
                  <div className={s.stack}>
                    <div className={s.row} style={{ justifyContent: 'space-between' }}>
                      <h2 id={`program-${p.id}`} style={{ margin: 0 }}>
                        {p.title}
                      </h2>
                      <span className={s.price}>{formatINR(p.feePaise)}</span>
                    </div>
                    <p className={s.muted}>{p.summary}</p>
                    <div className={s.prose}>
                      {String(p.description)
                        .split(/\n{2,}/)
                        .map((para: string, i: number) => (
                          <p key={i} style={{ whiteSpace: 'pre-line' }}>
                            {para}
                          </p>
                        ))}
                    </div>
                    <div className={s.row}>
                      <ButtonLink href="/register">Register</ButtonLink>
                      <ButtonLink href={`${siteUrls.internPortal}/program`} variant="outline" external>
                        Already have an account? Open the student portal
                      </ButtonLink>
                    </div>
                  </div>
                </Card>
                <div className={s.grid2}>
                  <Card title="Lessons">
                    <ol style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
                      {(p.lessons as Row[]).map((l) => (
                        <li key={l.id}>
                          {l.title} <span className={s.muted}>({l.required ? 'required' : 'optional'})</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                  <Card title="How you earn the certificate">
                    <ul className={s.list}>
                      <li><Check size={16} aria-hidden /> Pay the program fee of {formatINR(p.feePaise)} to unlock the lessons</li>
                      <li><Check size={16} aria-hidden /> Complete all {required} required lesson(s)</li>
                      <li><Check size={16} aria-hidden /> Pass the final assessment with at least {p.passPercent}% ({p.maxAttempts} attempt(s), {p.timeLimitMinutes} minutes each)</li>
                      <li><Check size={16} aria-hidden /> Receive a PDF {p.certificateTitle.toLowerCase()} with a public verification code</li>
                    </ul>
                    <p className={s.muted} style={{ marginTop: 12 }}>{DISCLAIMER}</p>
                  </Card>
                </div>
                <Card title="Frequently asked questions">
                  <div className={s.faq}>
                    {faqFor(p).map((f) => (
                      <details key={f.q}>
                        <summary>{f.q}</summary>
                        <p>{f.a}</p>
                      </details>
                    ))}
                  </div>
                </Card>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
