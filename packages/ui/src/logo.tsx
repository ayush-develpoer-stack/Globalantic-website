import logo from './assets/logo.svg';

/**
 * The real Globalantic logo mark (packages/ui/src/assets/logo.svg — a byte-identical copy of
 * frontend/public/logo.svg; frontend/tests/logo.test.ts fails if they ever differ).
 * The mark is square and purple on a transparent background, so it reads on light and dark themes.
 * Decorative by default: pass `alt` when the logo is not next to the visible "Globalantic" name.
 */
export const logoSrc: string = typeof logo === 'string' ? logo : (logo as { src: string }).src;

export function Logo({ size = 36, alt = '', className }: { size?: number; alt?: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
    <img src={logoSrc} width={size} height={size} alt={alt} aria-hidden={alt ? undefined : true} className={className} style={{ display: 'block', flex: 'none', objectFit: 'contain' }} decoding="async" />
  );
}
