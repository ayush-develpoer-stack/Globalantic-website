import type { Metadata } from 'next';
import Image from 'next/image';
import { absoluteImage, imageProps } from '@/lib/images';
import { liveLinks, projectCover, relatedProjects } from '@/lib/portfolio';
import { ProjectPlaceholder } from '@/components/portfolio/ProjectPlaceholder';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ExternalLink } from 'lucide-react';
import { getPortfolio, getPortfolioProject, getServices } from '@/lib/api';
import { TechStack } from '@/components/tech/TechStack';
import { buildMetadata, breadcrumbSchema, creativeWorkSchema } from '@/lib/seo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { PortfolioProject } from '@/types';
import styles from './page.module.css';
import { jsonLd } from '@/lib/json-ld';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const projects = (await getPortfolio()) ?? [];
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const project = await getPortfolioProject(params.slug);
  if (!project) {
    return buildMetadata({ title: 'Project not found', path: `/portfolio/${params.slug}`, noindex: true });
  }
  return buildMetadata({
    title: project.seoTitle ?? project.title,
    description: project.seoDescription ?? project.shortDescription,
    path: `/portfolio/${project.slug}`,
    image: absoluteImage(project.ogImage) ?? absoluteImage(projectCover(project)?.src),
  });
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export default async function PortfolioProjectPage(props: PageProps) {
  const params = await props.params;
  const project: PortfolioProject | null = await getPortfolioProject(params.slug);
  if (!project) notFound();

  const cover = projectCover(project);
  const gallery = project.gallery ?? [];
  const features = project.features ?? [];
  const technologies = project.technologies ?? [];
  const [allServices, allProjects] = await Promise.all([getServices().then((r) => r ?? []), getPortfolio().then((r) => r ?? [])]);
  const related = relatedProjects(allProjects, project);
  const delivered = (project.services ?? []).map((slug) => allServices.find((s) => s.slug === slug)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const links = liveLinks(project);

  const breadcrumb = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Portfolio', path: '/portfolio' },
    { name: project.title, path: `/portfolio/${project.slug}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(creativeWorkSchema({ title: project.title, description: project.shortDescription, path: `/portfolio/${project.slug}`, image: absoluteImage(cover?.src), technologies, datePublished: project.publishedAt })) }}
      />

      <article>
        <header className={styles.hero}>
          <div className="container">
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden>/</span>
              <Link href="/portfolio">Portfolio</Link>
              <span aria-hidden>/</span>
              <span className={styles.current}>{project.title}</span>
            </nav>

            <div className={styles.heroMeta}>
              {project.category && <Badge variant="primary">{project.category}</Badge>}
              {project.industry && <span className={styles.metaItem}>{project.industry}</span>}
              {project.client && <span className={styles.metaItem}>Client: {project.client}</span>}
            </div>

            <h1 className={styles.title}>{project.title}</h1>
            {project.shortDescription && <p className={styles.lede}>{project.shortDescription}</p>}
            {links.length > 0 && (
              <div className={styles.heroActions}>
                {links.map((l, i) => (
                  <Button key={l.url} href={l.url} variant={i === 0 ? 'primary' : 'outline'} size="lg" external>
                    {i === 0 && links.length === 1 ? 'Visit live site' : l.label} <ExternalLink size={16} aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="container">
          <div className={styles.cover}>
            {cover ? (
              <Image {...imageProps(cover.src)} alt={cover.alt} fill sizes="(max-width: 1280px) 100vw, 1280px" className={styles.coverImage} priority />
            ) : (
              <ProjectPlaceholder category={project.category} industry={project.industry} title={project.title} size="hero" />
            )}
          </div>
        </div>

        <div className="container">
          <div className={styles.body}>
            {project.description && (
              <Section title="Overview">
                <p className={styles.paragraph}>{project.description}</p>
              </Section>
            )}

            {project.challenge && (
              <Section title="The challenge">
                <p className={styles.paragraph}>{project.challenge}</p>
              </Section>
            )}

            {project.requirement && (
              <Section title="Requirements">
                <p className={styles.paragraph}>{project.requirement}</p>
              </Section>
            )}

            {project.approach && (
              <Section title="Our approach">
                <p className={styles.paragraph}>{project.approach}</p>
              </Section>
            )}

            {project.solution && (
              <Section title="The solution">
                <p className={styles.paragraph}>{project.solution}</p>
              </Section>
            )}

            {features.length > 0 && (
              <Section title="Key features">
                <ul className={styles.checklist}>
                  {features.map((feature) => (
                    <li key={feature} className={styles.checkItem}>
                      <Check size={18} className={styles.checkIcon} aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {technologies.length > 0 && (
              <Section title="Technologies">
                <TechStack items={technologies} compact />
              </Section>
            )}

            {gallery.length > 0 && (
              <Section title="Gallery">
                <div className={styles.gallery}>
                  {gallery.map((src, index) => (
                    <div key={src} className={styles.galleryItem}>
                      <Image
                        {...imageProps(src)}
                        alt={`${project.title} — image ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className={styles.galleryImage}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {delivered.length > 0 && (
              <Section title="Services delivered">
                <ul className={styles.chips}>
                  {delivered.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/services/${s.slug}`} className={styles.chip}>
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {links.length > 0 && (
              <Section title="Live site">
                <ul className={styles.chips}>
                  {links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.chip}>
                        {l.label}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {project.outcome && (
              <Section title="Outcome">
                <p className={styles.paragraph}>{project.outcome}</p>
              </Section>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className={styles.related} aria-labelledby="related-projects">
            <div className="container">
              <h2 id="related-projects" className={styles.sectionTitle}>
                Related projects
              </h2>
              <div className={styles.relatedGrid}>
                {related.map((p) => (
                  <PortfolioCard key={p.slug} project={p} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={styles.ctaBand}>
          <div className="container">
            <div className={styles.ctaInner}>
              <h2 className={styles.ctaTitle}>Have a project like this in mind?</h2>
              <p className={styles.ctaText}>
                Tell us what you&rsquo;re building and we&rsquo;ll help you plan the right approach.
              </p>
              <Button href="/get-a-quote" variant="primary" size="lg">
                Discuss Your Project
              </Button>
            </div>
          </div>
        </section>
      </article>
    </>
  );
}
