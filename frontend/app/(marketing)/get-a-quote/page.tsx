import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageContainer';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/detail/Accordion';
import { ServiceEnquiry } from '@/components/marketing/ServiceEnquiry';
import { WhatsAppButton } from '@/components/marketing/WhatsApp';
import { SERVICE_OPTIONS, siteConfig } from '@/lib/config';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Request a Quote — Website, App or Software Project',
  description:
    'Tell Globalantic about your website, software, mobile app, AI, e-commerce or digital marketing project and get a free consultation and a written proposal.',
  path: '/get-a-quote',
});

// Only statements the business already makes elsewhere on the site, or that are plainly true.
const FAQS = [
  { question: 'Is the consultation free?', answer: 'Yes. The first consultation is free and there is no obligation to go ahead.' },
  {
    question: 'What happens after I send the form?',
    answer: 'You receive a confirmation email with your enquiry reference. Our team reviews your requirements and contacts you by email or phone to arrange a consultation, then sends a written proposal with scope, timeline and cost.',
  },
  { question: 'How quickly will you reply?', answer: 'We usually reply within one business day.' },
  {
    question: 'I do not know my budget yet. Can I still ask?',
    answer: 'Yes. Choose "Not sure yet". The consultation is the place to discuss options that fit your goals.',
  },
  {
    question: 'Can I just message you instead?',
    answer: `Yes. Use the WhatsApp button to start a chat, or email ${siteConfig.email}. The form is the quickest way to share your requirements in one place.`,
  },
];

export default async function GetAQuotePage(props: { searchParams: Promise<{ service?: string }> }) {
  const searchParams = await props.searchParams;
  const requested = typeof searchParams.service === 'string' ? searchParams.service.slice(0, 120) : undefined;
  // Pre-select only known services, or the page the visitor came from (passed by our own links).
  const service = requested && ((SERVICE_OPTIONS as readonly string[]).includes(requested) || /^[\w &/+.,()-]{2,120}$/.test(requested)) ? requested : undefined;
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Request a Quote', path: '/get-a-quote' },
  ]);
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <PageHero
        eyebrow="Request a quote"
        title="Tell us about your project"
        description="Websites, custom software, CRM and ERP, mobile apps, AI and automation, e-commerce, UI/UX, SEO and digital marketing. Share your goals and get a free consultation and a written proposal."
        visual="crm"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Request a Quote', path: '/get-a-quote' }]}
        points={['Free consultation', 'Written proposal with scope, timeline and cost']}
      >
        <WhatsAppButton service={service} label="quote_hero" size="lg" />
      </PageHero>
      <ServiceEnquiry service={service} source="quote_page" title="Start with a few questions" />
      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="FAQ" title="Before you send your enquiry" align="center" />
          <Accordion items={FAQS} />
        </div>
      </section>
    </>
  );
}
