import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { PageHeader } from '@globalantic/ui';
import { Faq } from '@/components/Faq';
import { ButtonLink } from '@/components/ButtonLink';
import { FAQS } from '@/lib/content';
import s from '@/styles/site.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = pageMeta({
  title: 'FAQ',
  description: 'Answers to common questions about Globalantic courses, admissions, fees and certificates.',
  path: '/faq',
});

export default function FaqPage() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <PageHeader eyebrow="Help" title="Frequently asked questions" />
      <Faq />
      <div className={s.row} style={{ marginTop: 24 }}>
        <p>Still have a question?</p>
        <ButtonLink href="/contact" variant="outline" size="sm">
          Contact us
        </ButtonLink>
      </div>
    </div>
  );
}
