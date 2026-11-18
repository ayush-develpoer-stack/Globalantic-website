import { PremiumHero, type Crumb } from '@/components/hero/PremiumHero';
import type { HeroVariant } from '@/components/visuals/HeroVisual';

interface DetailHeroProps {
  eyebrow?: string;
  title: string;
  tagline?: string;
  description: string;
  icon?: string | null;
  breadcrumb: Crumb[];
  /** Illustration style for the detail page */
  visual?: HeroVariant;
  /** Topic for the WhatsApp greeting and quote link (solution / industry name) */
  topic?: string;
  trackLabel?: string;
}

/** Hero for solution / industry detail pages. */
export function DetailHero({ eyebrow, title, tagline, description, breadcrumb, visual = 'dashboard', topic, trackLabel = 'detail_hero' }: DetailHeroProps) {
  return (
    <PremiumHero
      eyebrow={eyebrow}
      title={title}
      tagline={tagline}
      description={description}
      breadcrumb={breadcrumb}
      visual={visual}
      ctas={{ href: `/get-a-quote${topic ? `?service=${encodeURIComponent(topic)}` : ''}`, service: topic ?? title, trackLabel }}
    />
  );
}
