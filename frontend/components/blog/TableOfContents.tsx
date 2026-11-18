'use client';

import { useCallback } from 'react';
import type { TocHeading } from './ArticleContent';
import styles from './TableOfContents.module.css';

interface TableOfContentsProps {
  headings: TocHeading[];
}

/** Sticky in-article table of contents built from the article headings. */
export function TableOfContents({ headings }: TableOfContentsProps) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      const target = document.getElementById(id);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${id}`);
      }
    },
    []
  );

  if (!headings.length) return null;

  return (
    <nav className={styles.toc} aria-label="Table of contents">
      <p className={styles.heading}>On this page</p>
      <ul className={styles.list}>
        {headings.map((h) => (
          <li
            key={h.id}
            className={[styles.item, h.level === 3 ? styles.nested : ''].filter(Boolean).join(' ')}
          >
            <a href={`#${h.id}`} className={styles.link} onClick={(e) => handleClick(e, h.id)}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
