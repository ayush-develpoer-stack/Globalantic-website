import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero } from '@/components/layout/PageContainer';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Accordion } from '@/components/detail/Accordion';
import { buildMetadata, breadcrumbSchema, faqSchema, founderSchema } from '@/lib/seo';
import { serviceLinks, siteConfig, telHref, whatsappUrl } from '@/lib/config';
import { getSettings } from '@/lib/api';
import { contactDetails } from '@/lib/contact';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'About Globalantic — IT & Digital Solutions Company, Bhopal',
  description:
    'Globalantic is an IT and digital solutions company that designs, builds and grows websites, software, mobile apps, AI solutions and business systems.',
  path: '/about',
});

const values = [
  {
    icon: 'Sparkles',
    title: 'Quality',
    description:
      'We care about the details — clean code, thoughtful design and products that are built to last and easy to maintain.',
  },
  {
    icon: 'Search',
    title: 'Transparency',
    description:
      'Clear scope, honest timelines and straightforward communication. You always know where your project stands.',
  },
  {
    icon: 'Target',
    title: 'Ownership',
    description:
      'We treat every project as our own, taking responsibility for outcomes rather than just tasks.',
  },
  {
    icon: 'Users',
    title: 'Partnership',
    description:
      'We work alongside you as a long-term technology partner, invested in your growth well beyond launch.',
  },
];

export default async function AboutPage() {
  const settings = await getSettings();
  const { email, secondaryEmail, phone } = contactDetails(settings);
  const facts = companyFacts(email, phone, secondaryEmail);
  const faqs = aboutFaqs(email, phone);
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(founderSchema()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(faqs)) }} />

      <PageHero
        eyebrow="About us"
        title="About Globalantic"
        description="An IT and digital solutions company helping businesses design, build and grow their digital products and systems."
        visual="workflow"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]}
        ctas={{ trackLabel: 'about_hero', secondary: { href: '/services', label: 'Explore services' } }}
      />

      <section className="section">
        <div className="container">
          <div className={styles.story}>
            <div>
              <SectionHeading
                as="h2"
                align="left"
                eyebrow="Our approach"
                title="Technology that moves businesses forward"
              />
              <p>
                Globalantic builds websites, software, mobile apps, AI solutions and business
                systems. We help companies of every size turn ideas into practical, well-engineered
                products — and then keep improving them.
              </p>
              <p>
                Our focus is simple: understand the problem properly, design a clear solution, and
                build it well. We combine modern engineering with careful design so the things we
                ship are reliable, usable and ready to grow with your business.
              </p>
            </div>
            <Card className={styles.storyCard} hover={false}>
              <h3 className={styles.storyCardTitle}>What drives us</h3>
              <p>
                We believe good technology should remove friction, not add it. Whether it&apos;s a
                marketing site, an internal tool or a full platform, we aim to deliver work that is
                genuinely useful and that you can rely on.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="facts-title">
        <div className="container">
          <div className={styles.factsWrap}>
            <div>
              <SectionHeading as="h2" align="left" eyebrow="At a glance" title="Globalantic in brief" id="facts-title" />
              <dl className={styles.facts}>
                {facts.map((f) => (
                  <div key={f.label} className={styles.fact}>
                    <dt>{f.label}</dt>
                    <dd>{f.href ? <a href={f.href}>{f.value}</a> : f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Card as="article" className={styles.founder} hover={false} id="founder">
              <p className="eyebrow">Leadership</p>
              <h2 className={styles.founderName}>{siteConfig.founder.name}</h2>
              <p className={styles.founderTitle}>
                {siteConfig.founder.title}, {siteConfig.name}
              </p>
              <p>
                {siteConfig.founder.name} founded {siteConfig.name}, an IT and digital solutions company based in {siteConfig.location}.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading
            eyebrow="What we do"
            title="A full range of digital services"
            description="From first concept to launch and beyond, we cover the capabilities most businesses need under one roof."
          />
          <div className={styles.serviceGrid}>
            {serviceLinks.map((link) => (
              <Link key={link.href} href={link.href} className={styles.serviceItem}>
                <Icon name={link.icon} size={22} className={styles.serviceIcon} />
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
          <div className={styles.centerCta}>
            <Button href="/services" variant="outline">
              Explore all services
            </Button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="How we work"
            title="The values behind our work"
            description="These principles guide how we build and how we partner with the businesses we work with."
          />
          <div className={styles.valueGrid}>
            {values.map((v) => (
              <Card key={v.title} as="article" className={styles.valueCard}>
                <span className={styles.valueIcon}>
                  <Icon name={v.icon} size={24} />
                </span>
                <h3 className={styles.valueTitle}>{v.title}</h3>
                <p>{v.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <div className={styles.tech}>
            <SectionHeading
              as="h2"
              align="left"
              eyebrow="Technology approach"
              title="Modern, proven, and chosen to fit"
            />
            <p>
              We work with a modern, well-supported technology stack across web, mobile, cloud and
              data. Rather than forcing every project into the same tools, we choose technologies
              that fit the problem — balancing performance, maintainability and long-term cost so
              your product stays healthy as it evolves.
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading eyebrow="FAQ" title="Questions about Globalantic" />
          <Accordion items={faqs} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className={styles.ctaBand}>
            <h2>Have a project in mind?</h2>
            <p>Tell us what you&apos;re building and we&apos;ll help you figure out the best way forward.</p>
            <div className={styles.ctaActions}>
              <Button href="/get-a-quote" size="lg">
                Discuss Your Project
              </Button>
              <Button href="/services" variant="outline" size="lg">
                View services
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

interface Fact {
  label: string;
  value: string;
  href?: string;
}

/** Entity facts shown on the page (and mirrored in the Organization/Person schema). Approved facts only. */
function companyFacts(email: string, phone: string, secondaryEmail: string | null): Fact[] {
  const wa = whatsappUrl();
  const tel = telHref(phone);
  return [
    { label: 'Company', value: `${siteConfig.name} — IT & digital solutions` },
    { label: 'Founder', value: `${siteConfig.founder.name}, ${siteConfig.founder.title}`, href: '#founder' },
    { label: 'Based in', value: siteConfig.location },
    { label: 'What we do', value: 'Websites, web applications, custom software, mobile apps, CRM/ERP systems, AI automation, e-commerce, UI/UX design, SEO/AEO/GEO and digital marketing' },
    { label: 'Who we work with', value: 'Startups, small and medium businesses, agencies and established companies' },
    { label: 'Email', value: email, href: `mailto:${email}` },
    ...(secondaryEmail ? [{ label: 'Also email', value: secondaryEmail, href: `mailto:${secondaryEmail}` }] : []),
    ...(phone ? [{ label: 'Phone', value: phone, ...(tel ? { href: tel } : {}) }] : []),
    ...(wa ? [{ label: 'WhatsApp', value: phone || 'Chat on WhatsApp', href: wa }] : []),
    { label: 'Training', value: 'Training programmes and internships', href: '/training' },
  ];
}

/** Short, factual answers to the questions people ask about the company. Visible on the page. */
function aboutFaqs(email: string, phone: string) {
  const { name, founder, location } = siteConfig;
  return [
    {
      question: `What does ${name} do?`,
      answer: `${name} is an IT and digital solutions company. It designs and builds websites, web applications, custom software, mobile apps, CRM and ERP systems, AI automation and e-commerce stores, and provides UI/UX design, SEO, AEO, GEO and digital marketing services.`,
    },
    { question: `Who founded ${name}?`, answer: `${name} was founded by ${founder.name}, who leads the company as its ${founder.title.toLowerCase()}.` },
    { question: `Where is ${name} based?`, answer: `${name} is based in ${location}.` },
    {
      question: `How do I start a project with ${name}?`,
      answer: 'Send an enquiry through the quote form or contact page, or message us on WhatsApp. We discuss your goals in a free consultation, agree a clear scope, and share a proposal before any work starts.',
    },
    { question: `How can I contact ${name}?`, answer: `Email ${email}${phone ? `, call or WhatsApp ${phone}` : ''}, or use the enquiry form on the contact page.` },
    {
      question: `Does ${name} offer training or internships?`,
      answer: 'Yes. Training is a separate, secondary offering: training programmes and internships are described on the Training page, with full course details on the Globalantic Training site.',
    },
  ];
}
