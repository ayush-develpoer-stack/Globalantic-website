import {
  siCloudinary,
  siCss,
  siExpress,
  siGooglegemini,
  siHtml5,
  siJavascript,
  siLaravel,
  siMongodb,
  siMysql,
  siNextdotjs,
  siNodedotjs,
  siOpenrouter,
  siPhp,
  siPostgresql,
  siReact,
  siRender,
  siStrapi,
  siSupabase,
  siTypescript,
  siVercel,
  siWordpress,
  type SimpleIcon,
} from 'simple-icons';
import styles from './TechStack.module.css';

/**
 * Technology stack with recognisable logos (Simple Icons, CC0 SVG paths).
 * Names are always shown as text; logos identify tools we use and imply no partnership.
 * Unknown names (or brands without a published icon) render as a text badge.
 */
const ICONS: Record<string, SimpleIcon> = {
  react: siReact,
  'react native': siReact,
  'next.js': siNextdotjs,
  typescript: siTypescript,
  javascript: siJavascript,
  html: siHtml5,
  css: siCss,
  'node.js': siNodedotjs,
  'express.js': siExpress,
  php: siPhp,
  laravel: siLaravel,
  postgresql: siPostgresql,
  mysql: siMysql,
  mongodb: siMongodb,
  wordpress: siWordpress,
  strapi: siStrapi,
  vercel: siVercel,
  render: siRender,
  supabase: siSupabase,
  cloudinary: siCloudinary,
  gemini: siGooglegemini,
  openrouter: siOpenrouter,
};

/** Very dark brand colours (Next.js, Vercel…) follow the text colour so they stay visible in dark mode. */
function fillFor(hex: string): string {
  const n = Number.parseInt(hex, 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum < 60 ? 'currentColor' : `#${hex}`;
}

export function TechStack({ items, compact = false }: { items: string[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={`${styles.grid} ${compact ? styles.compact : ''}`} aria-label="Technologies">
      {items.map((name) => {
        const icon = ICONS[name.trim().toLowerCase()];
        return (
          <li key={name} className={styles.item}>
            {icon ? (
              <svg viewBox="0 0 24 24" className={styles.logo} aria-hidden focusable="false">
                <path d={icon.path} fill={fillFor(icon.hex)} />
              </svg>
            ) : (
              <span className={styles.badge} aria-hidden>
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className={styles.name}>{name}</span>
          </li>
        );
      })}
    </ul>
  );
}
