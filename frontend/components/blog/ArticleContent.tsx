import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { parseMarkdown, type Inline } from '@/lib/markdown';
import styles from './ArticleContent.module.css';

export { extractHeadings, slugify } from '@/lib/markdown';

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/** Inline tokens -> React children (text is escaped by React; links are pre-validated). */
function renderInline(tokens: Inline[]): ReactNode {
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'strong':
        return <strong key={i}>{t.text}</strong>;
      case 'em':
        return <em key={i}>{t.text}</em>;
      case 'code':
        return (
          <code key={i} className={styles.code}>
            {t.text}
          </code>
        );
      case 'link':
        return t.href.startsWith('/') || t.href.startsWith('#') ? (
          <Link key={i} href={t.href} className={styles.a}>
            {t.text}
          </Link>
        ) : (
          <a key={i} href={t.href} className={styles.a} {...(t.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {t.text}
            {t.href.startsWith('https://') && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        );
      default:
        return <Fragment key={i}>{t.text}</Fragment>;
    }
  });
}

/**
 * Safe markdown article renderer (see lib/markdown.ts for the supported syntax).
 * No dangerouslySetInnerHTML: CMS content can never inject markup or scripts.
 */
export function ArticleContent({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  if (!blocks.length) return null;
  return (
    <div className={styles.content}>
      {blocks.map((b, key) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2 key={key} id={b.id} className={styles.h2}>
                {renderInline(b.inline)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} id={b.id} className={styles.h3}>
                {renderInline(b.inline)}
              </h3>
            );
          case 'quote':
            return (
              <blockquote key={key} className={styles.quote}>
                {renderInline(b.inline)}
              </blockquote>
            );
          case 'ul':
          case 'ol': {
            const Tag = b.type;
            return (
              <Tag key={key} className={b.type === 'ul' ? styles.ul : styles.ol}>
                {b.items.map((item, i) => (
                  <li key={i} className={styles.li}>
                    {renderInline(item)}
                  </li>
                ))}
              </Tag>
            );
          }
          default:
            return (
              <p key={key} className={styles.p}>
                {renderInline(b.inline)}
              </p>
            );
        }
      })}
    </div>
  );
}
