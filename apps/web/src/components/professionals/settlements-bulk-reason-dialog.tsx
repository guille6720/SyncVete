'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SettlementsModalShell } from '@/components/professionals/settlements-modal-shell';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export type SettlementsBulkReasonMode = 'return' | 'cancel';

interface SettlementsBulkReasonDialogProps {
  open: boolean;
  mode: SettlementsBulkReasonMode;
  count: number;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

const COPY: Record<
  SettlementsBulkReasonMode,
  { title: string; description: string; confirmLabel: string; pendingLabel: string }
> = {
  return: {
    title: 'Devolver a borrador',
    description: 'El motivo se guarda en las notas de cada liquidación seleccionada.',
    confirmLabel: 'Devolver a borrador',
    pendingLabel: 'Devolviendo...',
  },
  cancel: {
    title: 'Cancelar liquidaciones',
    description: 'Quedarán fuera del flujo. El motivo es obligatorio.',
    confirmLabel: 'Cancelar liquidaciones',
    pendingLabel: 'Cancelando...',
  },
};

export function SettlementsBulkReasonDialog({
  open,
  mode,
  count,
  onClose,
  onConfirm,
}: SettlementsBulkReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = usePendingAction();
  const copy = COPY[mode];

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
  }, [open, mode]);

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError('El motivo debe tener al menos 3 caracteres');
      return;
    }
    setError(null);
    void run(async () => {
      await onConfirm(trimmed);
      return true;
    })
      .then((ok) => {
        if (ok) onClose();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo completar la acción');
      });
  };

  return (
    <SettlementsModalShell
      open={open}
      titleId="settlements-bulk-reason-title"
      title={copy.title}
      description={`${count} liquidación${count !== 1 ? 'es' : ''}. ${copy.description}`}
      onClose={pending ? () => undefined : onClose}
    >
      <div className="mt-4 space-y-2">
        <Label htmlFor="bulk-reason">Motivo</Label>
        <Textarea
          id="bulk-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Explicá el motivo (mín. 3 caracteres)"
          autoFocus
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Cerrar
        </Button>
        <Button
          type="button"
          variant={mode === 'cancel' ? 'destructive' : 'default'}
          disabled={pending}
          onClick={handleSubmit}
        >
          {pending ? copy.pendingLabel : copy.confirmLabel}
        </Button>
      </div>
    </SettlementsModalShell>
  );
}
