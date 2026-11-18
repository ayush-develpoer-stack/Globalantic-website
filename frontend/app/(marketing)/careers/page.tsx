import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import { PageHero } from '@/components/layout/PageContainer';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { CareerForm } from '@/components/forms/CareerForm';
import { buildMetadata, breadcrumbSchema } from '@/lib/seo';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

export const metadata: Metadata = buildMetadata({
  title: 'Careers',
  description:
    'Build your career at Globalantic. Explore the kinds of roles we hire for and apply to join our team.',
  path: '/careers',
});

const culture = [
  {
    icon: 'Sparkles',
    title: 'Do meaningful work',
    description: 'Work on real products for real clients, where the things you build actually ship.',
  },
  {
    icon: 'Users',
    title: 'Learn continuously',
    description: 'Grow alongside a team that values curiosity, feedback and sharing what we know.',
  },
  {
    icon: 'Target',
    title: 'Own your outcomes',
    description: 'Take responsibility for your work end to end, with the trust and support to do it well.',
  },
];

const roles = [
  {
    icon: 'Code2',
    title: 'Full Stack Developer',
    description: 'Build web applications end to end across frontend and backend.',
  },
  {
    icon: 'Globe',
    title: 'Frontend Developer',
    description: 'Craft fast, accessible and polished user interfaces.',
  },
  {
    icon: 'Palette',
    title: 'UI/UX Designer',
    description: 'Design clear, usable experiences from wireframe to final UI.',
  },
  {
    icon: 'TrendingUp',
    title: 'Digital Marketing Executive',
    description: 'Plan and run campaigns that help our clients grow.',
  },
];

const skills = [
  'Clear communication',
  'Problem-solving',
  'Attention to detail',
  'Ownership & reliability',
  'Willingness to learn',
  'Team collaboration',
];

export default function CareersPage() {
  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Careers', path: '/careers' },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />

      <PageHero
        eyebrow="Careers"
        title="Grow Your Career with Globalantic"
        description="We're a team that cares about building good products and helping each other get better. If that sounds like you, we'd love to hear from you."
        visual="webapp"
        breadcrumb={[{ name: 'Home', path: '/' }, { name: 'Careers', path: '/careers' }]}
      />

      {/* Why work with us */}
      <section className="section">
        <div className="container">
          <SectionHeading
            eyebrow="Why Globalantic"
            title="Why Work With Globalantic"
            description="A place to do solid work, keep learning and take real ownership of what you build."
          />
          <div className={styles.cultureGrid}>
            {culture.map((c) => (
              <Card key={c.title} as="article" className={styles.cultureCard}>
                <span className={styles.cultureIcon}>
                  <Icon name={c.icon} size={24} />
                </span>
                <h3 className={styles.cardTitle}>{c.title}</h3>
                <p>{c.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Open positions */}
      <section className="section" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading
            eyebrow="Open roles"
            title="Open Positions"
            description="These are the areas we typically hire for. Don't see an exact match? Apply anyway and tell us where you fit."
          />
          <div className={styles.roleGrid}>
            {roles.map((r) => (
              <Card key={r.title} as="article" className={styles.roleCard}>
                <span className={styles.roleIcon}>
                  <Icon name={r.icon} size={22} />
                </span>
                <h3 className={styles.cardTitle}>{r.title}</h3>
                <p>{r.description}</p>
                <a href="#apply" className={styles.roleApply}>
                  Apply <ArrowRight size={16} />
                </a>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Skills we value */}
      <section className="section">
        <div className="container">
          <div className={styles.skillsWrap}>
            <SectionHeading
              as="h2"
              align="left"
              eyebrow="What we look for"
              title="Skills We Value"
              description="Beyond technical ability, these are the qualities that help people thrive on our team."
            />
            <ul className={styles.skillsList}>
              {skills.map((s) => (
                <li key={s} className={styles.skillItem}>
                  <span className={styles.skillCheck}>
                    <Check size={15} />
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Application form */}
      <section className="section" id="apply" style={{ background: 'var(--background-soft)' }}>
        <div className="container">
          <SectionHeading
            eyebrow="Join us"
            title="Apply to Globalantic"
            description="Send us your details and a link to your resume or portfolio. We'll be in touch if there's a fit."
          />
          <div className={styles.formWrap}>
            <CareerForm />
          </div>
        </div>
      </section>
    </>
  );
}
