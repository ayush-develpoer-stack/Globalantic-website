import type { Metadata } from 'next';
import { Check, MapPin, Globe, Clock, GraduationCap } from 'lucide-react';
import { PageHero } from '@/components/layout/PageContainer';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TrainingForm } from '@/components/forms/TrainingForm';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import { siteConfig } from '@/lib/config';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Full Stack Development Paid Internship Program',
  description:
    'A 6-month Full Stack Development paid internship by Globalantic: hands-on projects, a portfolio and interview preparation. Offline in Bhopal or online.',
  path: '/training',
});

const eligibility = ['12th', 'Diploma', 'Undergraduate', 'Graduate', 'Freshers'];

const curriculum = [
  'HTML',
  'CSS',
  'JavaScript',
  'TypeScript',
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'PostgreSQL',
  'MongoDB',
  'REST APIs',
  'Git & GitHub',
  'Deployment',
  'Real-world projects',
  'Portfolio development',
  'Interview preparation',
];

const benefits = [
  'Practical, hands-on development',
  'Real-world project exposure',
  'GitHub portfolio you can showcase',
  'Experience certificate',
  'Internship certificate',
  'Interview preparation',
  'Job support',
];

const pricing = [
  {
    mode: 'Offline (Bhopal)',
    icon: 'offline' as const,
    regular: '₹50,000',
    final: '₹25,000',
  },
  {
    mode: 'Online (India)',
    icon: 'online' as const,
    regular: '₹30,000',
    final: '₹15,000',
  },
];

export default function TrainingPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Training', path: '/training' },
  ]);

  const courseSchema = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Full Stack Development Paid Internship Program',
    description:
      'A 6-month full stack development paid internship program covering modern web technologies, real-world projects, portfolio building and interview preparation.',
    provider: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(courseSchema) }}
      />

      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroInner}>
            <div className={styles.heroBadges}>
              <Badge variant="primary">Paid Internship</Badge>
              <Badge variant="warning">Limited Seats</Badge>
            </div>
            <h1 className={styles.heroTitle}>Full Stack Development Paid Internship Program</h1>
            <p className={styles.heroLead}>
              A structured, project-driven internship where you learn modern full stack development
              by building real applications — and finish with a portfolio you can be proud of.
            </p>

            <ul className={styles.heroMeta}>
              <li>
                <Clock size={18} /> 6 Months
              </li>
              <li>
                <MapPin size={18} /> Offline (Bhopal)
              </li>
              <li>
                <Globe size={18} /> Online (India)
              </li>
            </ul>

            <div className={styles.heroActions}>
              <Button href="#apply" size="lg">
                Apply Now
              </Button>
              <Button href="/contact" variant="outline" size="lg">
                Talk to a Career Counsellor
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="section-sm">
        <div className="container">
          <SectionHeading
            eyebrow="Who can apply"
            title="Eligibility"
            description="This program is open to students and freshers who are ready to commit and learn."
          />
          <div className={styles.eligibilityRow}>
            {eligibility.map((e) => (
              <span key={e} className={styles.eligibilityPill}>
                <GraduationCap size={18} /> {e}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Curriculum */}
      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading
            eyebrow="What you'll learn"
            title="Curriculum"
            description="A complete path from fundamentals to shipping full stack applications."
          />
          <div className={styles.curriculumGrid}>
            {curriculum.map((item) => (
              <Card key={item} as="div" className={styles.curriculumCard}>
                <Check size={18} className={styles.curriculumCheck} />
                <span>{item}</span>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="What you get"
            title="Program Benefits"
            description="More than lessons — everything you need to turn skills into opportunities."
          />
          <div className={styles.benefitsGrid}>
            {benefits.map((b) => (
              <div key={b} className={styles.benefitItem}>
                <span className={styles.benefitCheck}>
                  <Check size={16} />
                </span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading
            eyebrow="Investment"
            title="Program Fees"
            description="Launch offer — 50% off for a limited number of seats."
          />
          <div className={styles.pricingGrid}>
            {pricing.map((p) => (
              <Card key={p.mode} className={styles.pricingCard} hover={false}>
                <div className={styles.pricingHead}>
                  <span className={styles.pricingMode}>
                    {p.icon === 'offline' ? <MapPin size={18} /> : <Globe size={18} />}
                    {p.mode}
                  </span>
                  <Badge variant="warning">50% OFF</Badge>
                </div>

                <div className={styles.pricingPrices}>
                  <span className={styles.pricingRegular}>{p.regular}</span>
                  <span className={styles.pricingFinal}>{p.final}</span>
                </div>

                <p className={styles.pricingNote}>One-time program fee</p>

                <div className={styles.pricingSeats}>
                  <Badge variant="soft">Limited Seats</Badge>
                </div>

                <Button href="#apply" fullWidth>
                  Apply for this mode
                </Button>
              </Card>
            ))}
          </div>

          <div className={styles.jobNote}>
            <p>
              Top-performing interns may receive a job opportunity at Globalantic based on
              performance, evaluation and available positions.
            </p>
          </div>
        </div>
      </section>

      {/* Application form */}
      <section className="section" id="apply">
        <div className="container">
          <SectionHeading
            eyebrow="Take the next step"
            title="Apply for the Program"
            description="Fill in the form below and our team will reach out with the details and next steps."
          />
          <p className={styles.platformNote}>
            Looking for other courses, upcoming batches or the certificate program? See{' '}
            <a href={`${siteConfig.trainingUrl}/courses`}>all courses on Globalantic Training</a>.
          </p>
          <div className={styles.formWrap}>
            <TrainingForm />
          </div>
        </div>
      </section>
    </>
  );
}
