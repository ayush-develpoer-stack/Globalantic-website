import Link from 'next/link';
import Image from 'next/image';
import { imageProps } from '@/lib/images';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { projectCover } from '@/lib/portfolio';
import { ProjectPlaceholder } from './ProjectPlaceholder';
import type { PortfolioProject } from '@/types';
import styles from './PortfolioCard.module.css';

interface PortfolioCardProps {
  project: PortfolioProject;
}

/** Grid card for a single portfolio project, linking to its detail page. */
export function PortfolioCard({ project }: PortfolioCardProps) {
  const cover = projectCover(project);
  const technologies = project.technologies?.slice(0, 3) ?? [];

  return (
    <Link href={`/portfolio/${project.slug}`} className={styles.card}>
      <div className={styles.media}>
        {cover ? (
          <Image
            {...imageProps(cover.src)}
            alt={cover.alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className={styles.image}
          />
        ) : (
          <ProjectPlaceholder category={project.category} industry={project.industry} title={project.title} />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.topRow}>
          {project.category && <Badge variant="soft">{project.category}</Badge>}
          {project.industry && <span className={styles.industry}>{project.industry}</span>}
        </div>

        <h3 className={styles.title}>{project.title}</h3>
        {project.shortDescription && <p className={styles.desc}>{project.shortDescription}</p>}

        {technologies.length > 0 && (
          <ul className={styles.chips} aria-label="Technologies">
            {technologies.map((tech) => (
              <li key={tech} className={styles.chip}>
                {tech}
              </li>
            ))}
          </ul>
        )}

        <span className={styles.cta}>
          View project <ArrowRight size={16} />
        </span>
      </div>
    </Link>
  );
}
