'use client';

import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** While true the dialog cannot be dismissed and the confirm button spins. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation step for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      dismissible={!busy}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy} data-autofocus>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
