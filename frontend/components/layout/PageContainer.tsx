import { PremiumHero, type PremiumHeroProps } from '@/components/hero/PremiumHero';

type PageHeroProps = Omit<PremiumHeroProps, 'title'> & { title: string };

/**
 * Standard page header for inner marketing pages (premium hero). Pass `visual` for a
 * two-column hero with an illustration, `ctas` for the consultation + WhatsApp row.
 */
export function PageHero(props: PageHeroProps) {
  return <PremiumHero {...props} />;
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="container">{children}</div>;
}
