'use client';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** alert = single dismiss button (replaces window.alert) */
  mode?: 'confirm' | 'alert';
  variant?: 'default' | 'destructive';
  onClose: () => void;
  onConfirm?: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  mode = 'confirm',
  variant = 'default',
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ModalShell
      open={open}
      titleId="app-confirm-title"
      title={title}
      description={description}
      onClose={onClose}
    >
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {mode === 'confirm' ? (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant}
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
            >
              {confirmLabel}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={onClose}>
            Entendido
          </Button>
        )}
      </div>
    </ModalShell>
  );
}
