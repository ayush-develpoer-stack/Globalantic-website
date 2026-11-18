'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'md' | 'lg';
  /** Disables closing via Escape / backdrop / close button (e.g. while saving). */
  dismissible?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: labelled by its title, traps Tab focus inside, closes on
 * Escape/backdrop, and returns focus to the element that opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  dismissible = true,
  children,
  footer,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Focus the first form control (or the dialog itself) once mounted.
    const first =
      dialog?.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog?.querySelector<HTMLElement>('input, select, textarea') ??
      dialog;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={[styles.modal, size === 'lg' ? styles.lg : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headText}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description && (
              <p id={descId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close dialog"
            disabled={!dismissible}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children ? <div className={styles.body}>{children}</div> : null}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
