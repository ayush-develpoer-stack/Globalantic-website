import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getServices } from '@/lib/api';
import { serviceLinks } from '@/lib/config';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ContentCard } from '@/components/ui/ContentCard';
import styles from './CoreServices.module.css';

/** Core services grid, sourced from the API with a static fallback. */
export async function CoreServices() {
  const services = (await getServices()) ?? [];

  const cards = services.length
    ? services.slice(0, 9).map((service) => ({
        href: `/services/${service.slug}`,
        title: service.title,
        description: service.shortDesc,
        icon: service.icon ?? null,
      }))
    : serviceLinks.slice(0, 9).map((link) => ({
        href: link.href,
        title: link.label,
        description: `Explore our ${link.label.toLowerCase()} services and how they help your business grow.`,
        icon: link.icon,
      }));

  return (
    <section className={`section ${styles.wrap}`}>
      <div className="container">
        <SectionHeading
          eyebrow="Our services"
          title="Services built around your goals"
          description="A full range of design, engineering and growth services — delivered by one team that stays with you from idea to launch and beyond."
        />

        <div className={styles.grid}>
          {cards.map((card) => (
            <ContentCard
              key={card.href}
              href={card.href}
              title={card.title}
              description={card.description}
              icon={card.icon}
            />
          ))}
        </div>

        <div className={styles.footer}>
          <Link href="/services" className={styles.viewAll}>
            View all services <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
