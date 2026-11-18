/**
 * Service families drive the page layout so pages are not identical:
 * build = software/web delivery, visibility = search & marketing, design = UI/UX & brand.
 */
export type ServiceGroup = 'build' | 'visibility' | 'design';

const VISIBILITY = new Set(['seo', 'aeo', 'geo', 'digital-marketing', 'social-media-marketing', 'google-meta-ads']);
const DESIGN = new Set(['ui-ux-design', 'branding']);

export function serviceGroup(slug: string): ServiceGroup {
  if (VISIBILITY.has(slug)) return 'visibility';
  if (DESIGN.has(slug)) return 'design';
  return 'build';
}
