import { ImageOff } from 'lucide-react';
import { placeholderTheme, type PlaceholderTheme } from '@/lib/portfolio';
import styles from './ProjectPlaceholder.module.css';

/**
 * Designed stand-in shown until a real screenshot is uploaded in the admin. Each category
 * family has its own abstract motif (no fake screenshots, no stock photos). It fills its
 * container, so the parent's aspect ratio keeps the layout stable.
 */
export function ProjectPlaceholder({ category, industry, title, size = 'card' }: { category?: string | null; industry?: string | null; title: string; size?: 'card' | 'hero' }) {
  const theme = placeholderTheme(category, industry);
  return (
    <div className={`${styles.wrap} ${styles[theme]} ${size === 'hero' ? styles.hero : ''}`} role="img" aria-label={`${title}: project image coming soon`}>
      <svg className={styles.motif} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
        <Motif theme={theme} />
      </svg>
      <span className={styles.label}>
        <ImageOff size={14} aria-hidden /> Project image coming soon
      </span>
    </div>
  );
}

/** Abstract line-art per family, drawn with currentColor so it follows the theme tokens. */
function Motif({ theme }: { theme: PlaceholderTheme }) {
  switch (theme) {
    case 'travel':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20 160 C 90 90, 150 190, 230 110 S 300 70, 310 60" strokeDasharray="6 8" opacity="0.7" />
          <circle cx="20" cy="160" r="6" />
          <path d="M300 48 c0 -10 -16 -10 -16 0 c0 9 8 16 8 16 s8 -7 8 -16z" />
          <rect x="120" y="120" width="70" height="26" rx="10" opacity="0.8" />
          <circle cx="136" cy="150" r="7" />
          <circle cx="174" cy="150" r="7" />
        </g>
      );
    case 'healthcare':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 110 H95 L110 80 L128 145 L146 60 L162 110 H310" opacity="0.8" />
          <rect x="226" y="30" width="56" height="56" rx="14" opacity="0.6" />
          <path d="M254 44 V72 M240 58 H268" />
          <path d="M60 150 h22 v26 a11 11 0 0 1 -22 0z" opacity="0.6" />
        </g>
      );
    case 'media':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="40" y="34" width="240" height="132" rx="12" opacity="0.6" />
          <rect x="58" y="52" width="96" height="62" rx="6" />
          <path d="M172 58 H262 M172 76 H250 M172 94 H258 M58 132 H262 M58 148 H220" opacity="0.8" />
        </g>
      );
    case 'commerce':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M70 70 H96 L116 140 H214 L236 88 H106" />
          <circle cx="128" cy="158" r="8" />
          <circle cx="202" cy="158" r="8" />
          <rect x="240" y="36" width="44" height="54" rx="8" opacity="0.6" />
          <rect x="36" y="110" width="38" height="46" rx="8" opacity="0.5" />
        </g>
      );
    case 'finance':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M30 170 H296 M30 170 V30" opacity="0.5" />
          <path d="M44 150 L100 118 L144 132 L196 84 L240 96 L292 46" />
          <path d="M276 46 H292 V62" />
          <rect x="60" y="140" width="16" height="30" opacity="0.5" />
          <rect x="120" y="128" width="16" height="42" opacity="0.5" />
          <rect x="180" y="110" width="16" height="60" opacity="0.5" />
        </g>
      );
    case 'software':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="34" y="30" width="252" height="140" rx="12" opacity="0.6" />
          <path d="M34 56 H286" opacity="0.6" />
          <rect x="50" y="72" width="60" height="82" rx="6" />
          <rect x="124" y="72" width="146" height="36" rx="6" opacity="0.8" />
          <path d="M124 128 H270 M124 144 H230" opacity="0.8" />
        </g>
      );
    default:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="40" y="32" width="240" height="136" rx="12" opacity="0.6" />
          <circle cx="58" cy="48" r="4" />
          <circle cx="72" cy="48" r="4" />
          <rect x="60" y="72" width="200" height="40" rx="8" />
          <path d="M60 132 H200 M60 148 H160" opacity="0.8" />
        </g>
      );
  }
}
