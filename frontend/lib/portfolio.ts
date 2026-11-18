import type { PortfolioProject } from '@/types';

/** The project's cover: the dedicated cover image, else the first gallery image. */
export function projectCover(p: Pick<PortfolioProject, 'title' | 'coverImage' | 'coverImageAlt' | 'images'>): { src: string; alt: string } | null {
  const src = (p.coverImage && p.coverImage.trim()) || p.images?.[0];
  if (!src) return null;
  return { src, alt: (p.coverImageAlt && p.coverImageAlt.trim()) || `${p.title} — project cover` };
}

/**
 * Visual family for the "image coming soon" placeholder. Each family has its own motif so
 * eight projects never look like one recycled stock image.
 */
export type PlaceholderTheme = 'travel' | 'healthcare' | 'media' | 'commerce' | 'finance' | 'software' | 'web';

const THEME_RULES: [PlaceholderTheme, RegExp][] = [
  ['travel', /travel|touris|tour|taxi|cab|car rental|rental|transport|hospitality/i],
  ['healthcare', /health|medical|patholog|clinic|hospital|diagnos|lab\b|pharma/i],
  ['media', /news|media|publish|magazine|blog|content/i],
  ['finance', /financ|invest|mutual|insurance|bank|fintech|wealth|accounting/i],
  ['commerce', /e-?commerce|shop|store|retail|beauty|salon|hair|fashion|product/i],
  ['software', /crm|erp|software|saas|application|dashboard|it\b|it &|digital solutions|technolog/i],
];

/** Picks the placeholder family from the category first, then the industry. */
export function placeholderTheme(category?: string | null, industry?: string | null): PlaceholderTheme {
  for (const text of [category ?? '', industry ?? '']) {
    for (const [theme, rule] of THEME_RULES) if (rule.test(text)) return theme;
  }
  return 'web';
}

/**
 * Related projects: others in the same industry first (e.g. the two projects for one
 * organisation), then the same category, never the project itself.
 */
export function relatedProjects(all: PortfolioProject[], current: PortfolioProject, limit = 3): PortfolioProject[] {
  const others = all.filter((p) => p.slug !== current.slug);
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();
  const sameIndustry = norm(current.industry) ? others.filter((p) => norm(p.industry) === norm(current.industry)) : [];
  const sameCategory = others.filter((p) => !sameIndustry.includes(p) && norm(p.category) === norm(current.category));
  return [...sameIndustry, ...sameCategory].slice(0, limit);
}

/** Client-side filter for the portfolio index: category chip + free-text search. */
export function filterProjects(projects: PortfolioProject[], opts: { category?: string | null; query?: string }): PortfolioProject[] {
  const q = (opts.query ?? '').trim().toLowerCase();
  return projects.filter((p) => {
    if (opts.category && p.category !== opts.category) return false;
    if (!q) return true;
    const hay = [p.title, p.shortDescription, p.category, p.industry ?? '', ...(p.technologies ?? [])].join(' ').toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

/** https links only, labelled for "Visit live site". */
export function liveLinks(p: Pick<PortfolioProject, 'links'>): { label: string; url: string }[] {
  return (p.links ?? []).filter((l) => typeof l?.url === 'string' && l.url.startsWith('https://'));
}
