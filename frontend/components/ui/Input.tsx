import { cloneElement, forwardRef, isValidElement } from 'react';
import styles from './Input.module.css';

interface FieldWrapProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  /** Short help text shown under the control */
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, required, hint, children }: FieldWrapProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  // Link hint + error to the control so screen readers announce them with the field.
  const control = isValidElement<{ 'aria-describedby'?: string; 'aria-required'?: boolean }>(children) && describedBy
    ? cloneElement(children, { 'aria-describedby': describedBy, ...(required ? { 'aria-required': true } : {}) })
    : children;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && <span className={styles.req} aria-hidden> *</span>}
      </label>
      {control}
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[styles.input, invalid ? styles.invalid : '', className ?? ''].filter(Boolean).join(' ')}
      aria-invalid={invalid}
      {...rest}
    />
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={[styles.input, styles.textarea, invalid ? styles.invalid : '', className ?? ''].filter(Boolean).join(' ')}
      aria-invalid={invalid}
      {...rest}
    />
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={[styles.input, styles.select, invalid ? styles.invalid : '', className ?? ''].filter(Boolean).join(' ')}
      aria-invalid={invalid}
      {...rest}
    >
      {children}
    </select>
  );
});
