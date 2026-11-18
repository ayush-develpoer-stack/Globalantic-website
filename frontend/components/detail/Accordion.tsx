'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './Accordion.module.css';

interface AccordionItem {
  question: string;
  answer: string;
}

interface AccordionProps {
  items: AccordionItem[];
}

/** Accessible FAQ accordion. */
export function Accordion({ items }: AccordionProps) {
  const [open, setOpen] = useState<number | null>(0);
  // Unique per accordion: a page can hold more than one FAQ list.
  const uid = useId();

  if (!items || items.length === 0) return null;

  return (
    <div className={styles.wrap}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${uid}-panel-${i}`;
        const buttonId = `${uid}-button-${i}`;
        return (
          <div key={i} className={styles.item}>
            <h3 className={styles.heading}>
              <button
                type="button"
                id={buttonId}
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className={styles.question}>{item.question}</span>
                <ChevronDown
                  size={20}
                  className={[styles.chevron, isOpen ? styles.chevronOpen : ''].filter(Boolean).join(' ')}
                  aria-hidden
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className={styles.panel}
            >
              <p className={styles.answer}>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
