'use client';

import { Button } from '@/components/ui/button';
import { SettlementsModalShell } from '@/components/professionals/settlements-modal-shell';

interface SettlementsConfirmDialogProps {
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

export function SettlementsConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  mode = 'confirm',
  variant = 'default',
  onClose,
  onConfirm,
}: SettlementsConfirmDialogProps) {
  return (
    <SettlementsModalShell
      open={open}
      titleId="settlements-confirm-title"
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
    </SettlementsModalShell>
  );
}
