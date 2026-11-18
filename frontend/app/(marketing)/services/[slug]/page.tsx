import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Lightbulb, ShieldAlert, Users } from 'lucide-react';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Icon } from '@/components/ui/Icon';
import { PremiumHero } from '@/components/hero/PremiumHero';
import { ProcessSteps } from '@/components/detail/ProcessSteps';
import { Accordion } from '@/components/detail/Accordion';
import { TechStack } from '@/components/tech/TechStack';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { ServiceEnquiry } from '@/components/marketing/ServiceEnquiry';
import { accentFor, resolveVariant } from '@/components/visuals/HeroVisual';
import { getIndustries, getPortfolio, getService, getServices } from '@/lib/api';
import { buildMetadata, breadcrumbSchema, faqSchema, serviceSchema } from '@/lib/seo';
import { serviceGroup, type ServiceGroup } from '@/lib/service-groups';
import type { Service } from '@/types';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const services = (await getServices()) ?? [];
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const service = await getService(params.slug);
  if (!service) return buildMetadata({ title: 'Service', path: `/services/${params.slug}`, noindex: true });
  return buildMetadata({
    title: service.seoTitle ?? service.title,
    description: service.seoDescription ?? service.shortDesc,
    path: `/services/${params.slug}`,
    image: service.ogImage,
  });
}

/** Factual hero points per family (no results or guarantees). */
const POINTS: Record<ServiceGroup, string[]> = {
  build: ['Free consultation', 'Clear scope before work starts', 'Built in iterations with regular demos'],
  visibility: ['Free consultation', 'Clear priorities and honest reporting', 'No guaranteed-ranking promises'],
  design: ['Free consultation', 'Clear scope before work starts', 'Designs reviewed with you at each step'],
};

const PROCESS_TITLE: Record<ServiceGroup, string> = {
  build: 'How we deliver',
  visibility: 'How the work runs',
  design: 'Our design process',
};

export default async function ServiceDetailPage(props: PageProps) {
  const params = await props.params;
  const service = await getService(params.slug);
  if (!service) notFound();

  const [allServices, industries, projects] = await Promise.all([getServices(), getIndustries(), getPortfolio(service.slug)]);
  const group = serviceGroup(service.slug);
  const variant = resolveVariant(service.heroVariant, service.slug);
  const accent = accentFor(variant);
  const audience = service.audience ?? [];
  const industryLinks = (service.industries ?? [])
    .map((slug) => industries?.find((i) => i.slug === slug))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const related = (allServices ?? [])
    .filter((s) => s.slug !== service.slug)
    .sort((a, b) => Number(serviceGroup(b.slug) === group) - Number(serviceGroup(a.slug) === group) || a.order - b.order)
    .slice(0, 3);

  const breadcrumb = [
    { name: 'Home', path: '/' },
    { name: 'Services', path: '/services' },
    { name: service.title, path: `/services/${service.slug}` },
  ];
  const quoteHref = `/get-a-quote?service=${encodeURIComponent(service.title)}`;

  // ---- Sections (rendered in a group-specific order) ------------------------------------------
  const problemSolution = (service.problem || service.solution) && (
    <section className="section" key="ps">
      <div className="container">
        <div className={styles.ps}>
          {service.problem && (
            <div className={`${styles.psCard} ${styles.problem}`}>
              <span className={styles.psIcon}>
                <ShieldAlert size={20} aria-hidden />
              </span>
              <h2 className={styles.psTitle}>The challenge</h2>
              <p>{service.problem}</p>
            </div>
          )}
          {service.solution && (
            <div className={`${styles.psCard} ${styles.solution}`}>
              <span className={styles.psIcon}>
                <Lightbulb size={20} aria-hidden />
              </span>
              <h2 className={styles.psTitle}>How we solve it</h2>
              <p>{service.solution}</p>
            </div>
          )}
        </div>
        {service.overview && <p className={styles.overview}>{service.overview}</p>}
      </div>
    </section>
  );

  const features = service.features.length > 0 && (
    <section className={`section ${styles.alt}`} key="features">
      <div className="container">
        <SectionHeading eyebrow="What's included" title={group === 'visibility' ? 'What we work on' : 'Features & capabilities'} align={group === 'design' ? 'center' : 'left'} className={styles.headWrap} />
        <ul className={group === 'visibility' ? styles.numbered : styles.featureGrid}>
          {service.features.map((f, i) => (
            <li key={f} className={styles.feature}>
              <span className={styles.featureMark} aria-hidden>
                {group === 'visibility' ? String(i + 1).padStart(2, '0') : <Check size={16} strokeWidth={3} />}
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );

  const deliverAndAudience = (service.deliverables.length > 0 || audience.length > 0) && (
    <section className="section" key="deliver">
      <div className="container">
        <div className={styles.split}>
          {service.deliverables.length > 0 && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>What you receive</h2>
              <ul className={styles.checkList}>
                {service.deliverables.map((d) => (
                  <li key={d}>
                    <Check size={16} strokeWidth={3} aria-hidden /> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {audience.length > 0 && (
            <div className={`${styles.panel} ${styles.panelAccent}`}>
              <h2 className={styles.panelTitle}>
                <Users size={18} aria-hidden /> Who it&apos;s for
              </h2>
              <ul className={styles.checkList}>
                {audience.map((a) => (
                  <li key={a}>
                    <ArrowRight size={15} aria-hidden /> {a}
                  </li>
                ))}
              </ul>
              {service.benefits.length > 0 && (
                <>
                  <h3 className={styles.subTitle}>Why it helps</h3>
                  <ul className={styles.benefits}>
                    {service.benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const tech = service.technologies.length > 0 && (
    <section className={`section ${styles.alt}`} key="tech">
      <div className="container">
        <SectionHeading eyebrow="Technology" title="Tools and technologies we use" description="Chosen per project for reliability, performance and long-term maintainability." align="center" className={styles.headWrap} />
        <TechStack items={service.technologies} />
      </div>
    </section>
  );

  const process = service.process.length > 0 && (
    <section className="section" key="process">
      <div className="container">
        <SectionHeading eyebrow="Process" title={PROCESS_TITLE[group]} align="center" className={styles.headWrap} />
        <ProcessSteps steps={service.process} />
        {group === 'visibility' && (
          <p className={styles.honest}>
            Search engines and AI assistants decide what they show. We improve what is in our control — your site, content and data — and report results honestly. No ranking, placement or citation is guaranteed.
          </p>
        )}
      </div>
    </section>
  );

  const useCases = (service.useCases.length > 0 || industryLinks.length > 0) && (
    <section className={`section ${styles.alt}`} key="uses">
      <div className="container">
        <div className={styles.split}>
          {service.useCases.length > 0 && (
            <div>
              <SectionHeading eyebrow="Use cases" title="Where it fits" className={styles.headWrapSmall} />
              <ul className={styles.useCases}>
                {service.useCases.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          {industryLinks.length > 0 && (
            <div>
              <SectionHeading eyebrow="Industries" title="Industries we serve" className={styles.headWrapSmall} />
              <ul className={styles.industries}>
                {industryLinks.map((i) => (
                  <li key={i.slug}>
                    <Link href={`/industries/${i.slug}`} className={styles.industry}>
                      <Icon name={i.icon} size={18} />
                      <span>{i.title}</span>
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const work = projects && projects.length > 0 && (
    <section className="section" key="work">
      <div className="container">
        <SectionHeading eyebrow="Our work" title={`${service.title} projects`} align="center" className={styles.headWrap} />
        <div className={styles.projects}>
          {projects.slice(0, 3).map((p) => (
            <PortfolioCard key={p.slug} project={p} />
          ))}
        </div>
      </div>
    </section>
  );

  const faqs = service.faqs.length > 0 && (
    <section className={`section ${group === 'build' ? '' : styles.alt}`} key="faq">
      <div className="container">
        <SectionHeading eyebrow="FAQ" title={`${service.title}: common questions`} align="center" className={styles.headWrap} />
        <Accordion items={service.faqs} />
      </div>
    </section>
  );

  const ORDER: Record<ServiceGroup, (React.ReactNode | false | undefined | '')[]> = {
    build: [problemSolution, features, deliverAndAudience, tech, process, useCases, work, faqs],
    visibility: [problemSolution, process, features, deliverAndAudience, useCases, work, faqs],
    design: [problemSolution, deliverAndAudience, process, features, work, useCases, tech, faqs],
  };

  return (
    <div style={{ ['--va' as string]: accent } as React.CSSProperties}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(serviceSchema(service.title, service.seoDescription ?? service.shortDesc, `/services/${service.slug}`, { audience })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(breadcrumb)) }} />
      {service.faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema(service.faqs)) }} />}

      <PremiumHero
        eyebrow={group === 'visibility' ? 'Growth & visibility' : group === 'design' ? 'Design' : 'Development service'}
        title={service.title}
        tagline={service.tagline}
        description={service.shortDesc}
        breadcrumb={breadcrumb}
        visual={variant}
        ctas={{ href: '#enquiry', label: 'Get a Free Consultation', service: service.title, trackLabel: `service_hero:${service.slug}`, secondary: { href: quoteHref, label: 'Request a Quote' } }}
        points={POINTS[group]}
      />

      {ORDER[group].filter(Boolean).map((section) => section)}

      <ServiceEnquiry service={service.title} source={`service_page:${service.slug}`} title={`Discuss your ${service.title} project`} />

      {related.length > 0 && <RelatedServices items={related} />}
    </div>
  );
}

function RelatedServices({ items }: { items: Service[] }) {
  return (
    <section className="section">
      <div className="container">
        <SectionHeading eyebrow="Related" title="Related services" align="center" className={styles.headWrap} />
        <ul className={styles.related}>
          {items.map((s) => (
            <li key={s.slug}>
              <Link href={`/services/${s.slug}`} className={styles.relatedCard}>
                <span className={styles.relatedIcon}>
                  <Icon name={s.icon} size={20} />
                </span>
                <strong>{s.title}</strong>
                <span>{s.shortDesc}</span>
                <span className={styles.relatedMore}>
                  Learn about {s.title} <ArrowRight size={14} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
