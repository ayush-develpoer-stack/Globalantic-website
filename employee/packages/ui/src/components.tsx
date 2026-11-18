'use client';

import { forwardRef, useEffect, useId, useRef, useState, createContext, useCallback, useContext } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Loader2, X, XCircle } from 'lucide-react';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

import { buttonClass, type ButtonSize, type ButtonVariant } from './button-class';

export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, full = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx(buttonClass(variant, size, full), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 size={16} className={s.spin} aria-hidden />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
}

export function Field({ label, error, hint, required, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={id} className={s.label}>
        {label}
        {required && <span className={s.req} aria-hidden> *</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className={s.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Common = { label: string; error?: string; hint?: string; containerClassName?: string };

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Common>(function Input(
  { label, error, hint, containerClassName, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <input ref={ref} id={id} className={cx(s.control, className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} required={required} {...rest} />
      )}
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(function Textarea(
  { label, error, hint, containerClassName, className, required, rows = 4, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea ref={ref} id={id} rows={rows} className={cx(s.control, s.textarea, className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} required={required} {...rest} />
      )}
    </Field>
  );
});

export interface Option {
  value: string;
  label: string;
}

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & Common & { options: Option[]; placeholder?: string }>(function Select(
  { label, error, hint, containerClassName, className, options, placeholder, required, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <select ref={ref} id={id} className={cx(s.control, s.select, className)} aria-invalid={invalid || undefined} aria-describedby={describedBy} required={required} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
});

export function Checkbox({ label, error, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className={cx(s.checkWrap, className)}>
      <input id={id} type="checkbox" className={s.check} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
      <label htmlFor={id} className={s.checkLabel}>
        {label}
      </label>
      {error && (
        <p id={`${id}-err`} className={s.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces & feedback
// ---------------------------------------------------------------------------

export function Card({ title, actions, children, className, padded = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx(s.card, padded && s.cardPadded, className)}>
      {(title || actions) && (
        <header className={s.cardHeader}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {actions && <div className={s.cardActions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx(s.badge, s[`tone_${tone}`])}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  // positive
  PUBLISHED: 'success', OPEN: 'success', ACTIVE: 'success', APPROVED: 'success', ENROLLED: 'success', PAID: 'success',
  PRESENT: 'success', GRADED: 'success', ISSUED: 'success', COMPLETED: 'info', RESOLVED: 'success', CLEARED: 'success', VERIFIED: 'info',
  // in progress
  SUBMITTED: 'info', UNDER_REVIEW: 'warning', PENDING: 'warning', IN_PROGRESS: 'info', UPCOMING: 'primary', CREATED: 'neutral',
  REGISTERED: 'neutral', ADMITTED: 'info', LATE: 'warning', DRAFT: 'neutral', RETURNED: 'warning', EXCUSED: 'neutral',
  // negative / closed
  REJECTED: 'danger', FAILED: 'danger', CANCELLED: 'neutral', WITHDRAWN: 'neutral', ARCHIVED: 'neutral', FULL: 'warning',
  ABSENT: 'danger', SUSPENDED: 'danger', DROPPED: 'neutral', REFUNDED: 'warning', REVOKED: 'danger', CLOSED: 'neutral',
  DISQUALIFIED: 'danger', CONFIRMED: 'danger',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const text = status.replace(/_/g, ' ').toLowerCase();
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{text.charAt(0).toUpperCase() + text.slice(1)}</Badge>;
}

const ALERT_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

export function Alert({ tone = 'info', title, children, onDismiss }: { tone?: keyof typeof ALERT_ICON; title?: string; children?: React.ReactNode; onDismiss?: () => void }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div className={cx(s.alert, s[`tone_${tone}`])} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden className={s.alertIcon} />
      <div className={s.alertBody}>
        {title && <p className={s.alertTitle}>{title}</p>}
        {children && <div className={s.alertText}>{children}</div>}
      </div>
      {onDismiss && (
        <button type="button" className={s.iconBtn} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className={s.spinnerWrap} role="status">
      <Loader2 size={20} className={s.spin} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className={s.state} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className={s.skeletonStack} aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={cx('skeleton', s.skeletonRow)} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className={s.state}>
      <div className={s.stateIcon} aria-hidden>
        {icon ?? <Inbox size={28} />}
      </div>
      <p className={s.stateTitle}>{title}</p>
      {description && <p className={s.stateText}>{description}</p>}
      {action && <div className={s.stateAction}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = 'Something went wrong' }: { message?: string | null; onRetry?: () => void; title?: string }) {
  return (
    <div className={s.state} role="alert">
      <div className={cx(s.stateIcon, s.stateIconDanger)} aria-hidden>
        <AlertTriangle size={28} />
      </div>
      <p className={s.stateTitle}>{title}</p>
      {message && <p className={s.stateText}>{message}</p>}
      {onRetry && (
        <div className={s.stateAction}>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders loading / error / empty / content for an async query in one place. */
export function AsyncView<T>({
  state,
  empty,
  isEmpty,
  children,
  loadingRows,
}: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  empty?: { title: string; description?: string; action?: React.ReactNode };
  isEmpty?: (data: T) => boolean;
  children: (data: T) => React.ReactNode;
  loadingRows?: number;
}) {
  if (state.loading && state.data === null) return <LoadingState rows={loadingRows} />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <LoadingState rows={loadingRows} />;
  if (empty && isEmpty?.(state.data)) return <EmptyState {...empty} />;
  return <>{children(state.data)}</>;
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption?: string; onRowClick?: (row: T) => void }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(c.className, c.hideOnMobile && s.hideMobile)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? s.clickable : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={cx(c.className, c.hideOnMobile && s.hideMobile)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <Button variant="ghost" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={16} aria-hidden /> Prev
      </Button>
      <span className={s.pageInfo} aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
        Next <ChevronRight size={16} aria-hidden />
      </Button>
    </nav>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className={cx(s.stat, tone && s[`statTone_${tone}`])}>
      <p className={s.statLabel}>{label}</p>
      <p className={s.statValue}>{value}</p>
      {hint && <p className={s.statHint}>{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className={s.statGrid}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className={s.pageHeader}>
      <div>
        {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDesc}>{description}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
}

export function Tabs<V extends string>({ items, value, onChange, label }: { items: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void; label: string }) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={cx(s.tab, t.value === value && s.tabActive)} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className={s.dl}>
      {items.map((i) => (
        <div key={i.label} className={s.dlRow}>
          <dt>{i.label}</dt>
          <dd>{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={s.progress} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={s.progressFill} style={{ width: `${v}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute('disabled'));
    (focusables()[0] ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx(s.modal, size === 'lg' && s.modalLg)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={s.modalHeader}>
          <h2 id={titleId} className={s.modalTitle}>
            {title}
          </h2>
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close dialog">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className={s.modalBody}>{children}</div>
        {footer && <footer className={s.modalFooter}>{footer}</footer>}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog. With `requireReason`, the user must type a reason,
 * which is passed to onConfirm (audit trails on the server need it).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    if (requireReason && reason.trim().length < 3) {
      setError('Please enter a reason (at least 3 characters).');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={submit} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <div className={s.modalMessage}>{message}</div>}
      {requireReason && <Textarea label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />}
      {error && <Alert tone="danger">{error}</Alert>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type ToastItem = { id: number; tone: 'success' | 'danger' | 'info'; message: string };
const ToastContext = createContext<((message: string, tone?: ToastItem['tone']) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={s.toasts} aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={cx(s.toast, s[`tone_${t.tone}`])} role={t.tone === 'danger' ? 'alert' : 'status'}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
