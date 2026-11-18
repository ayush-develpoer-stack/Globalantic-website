import type { Metadata } from 'next';
import { pageMeta, privateMeta } from '@/lib/seo';
import { PageHeader } from '@globalantic/ui';
import { ContactForm } from './ContactForm';
import s from '@/styles/site.module.css';

export const metadata: Metadata = pageMeta({
  title: 'Contact & enquiries',
  description: 'Ask the Globalantic Training admissions team about courses, batches and fees.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <div className={`container ${s.page} ${s.pageNarrow}`}>
      <PageHeader eyebrow="Contact" title="Ask us anything" description="Questions about a course, batch, eligibility or fees? Send an enquiry and the admissions team will reply by email." />
      <ContactForm />
    </div>
  );
}
