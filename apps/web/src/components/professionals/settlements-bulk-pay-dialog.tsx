'use client';

import { useEffect, useState } from 'react';
import { bulkRegisterProfessionalPayments } from '@/actions/professional-settlements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatMoney,
  type Professional,
  type ProfessionalSettlement,
} from '@sincvete/shared';

interface SettlementsBulkPayDialogProps {
  open: boolean;
  selectedSettlements: ProfessionalSettlement[];
  professionals: Professional[];
  currency?: string;
  onClose: () => void;
  onComplete: () => void;
}

function settlementLabel(
  settlement: ProfessionalSettlement,
  professionals: Professional[]
): string {
  const professional = professionals.find((row) => row.id === settlement.professional_id);
  const name = professional ? `${professional.last_name}, ${professional.first_name}` : 'Profesional';
  return `${name} · ${settlement.period_start} → ${settlement.period_end}`;
}

export function SettlementsBulkPayDialog({
  open,
  selectedSettlements,
  professionals,
  currency = 'ARS',
  onClose,
  onComplete,
}: SettlementsBulkPayDialogProps) {
  const [method, setMethod] = useState<string>('transferencia');
  const [reference, setReference] = useState('');
  const [useCustomAmounts, setUseCustomAmounts] = useState(false);
  const [amountsById, setAmountsById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failedRows, setFailedRows] = useState<Array<{ id: string; error: string }>>([]);
  const [pending, run] = usePendingAction();

  useEffect(() => {
    if (!open) return;
    setUseCustomAmounts(false);
    setAmountsById(
      Object.fromEntries(
        selectedSettlements.map((row) => [row.id, String(row.balance_due)])
      )
    );
    setMessage(null);
    setFailedRows([]);
  }, [open, selectedSettlements]);

  if (!open) return null;

  const totalDue = selectedSettlements.reduce((sum, row) => {
    if (useCustomAmounts) {
      const custom = Number(amountsById[row.id] ?? 0);
      return sum + (Number.isFinite(custom) ? custom : 0);
    }
    return sum + row.balance_due;
  }, 0);

  const handlePay = () => {
    setMessage(null);
    setFailedRows([]);
    void run(async () => {
      if (useCustomAmounts) {
        const payments = selectedSettlements.map((row) => ({
          settlementId: row.id,
          amount: Number(amountsById[row.id] ?? 0),
        }));
        const result = await bulkRegisterProfessionalPayments({
          mode: 'custom',
          payments,
          method,
          reference: reference.trim() || null,
        });
        if (!result?.success || !result.data) {
          throw new Error(result?.error ?? 'No se pudieron registrar los pagos');
        }
        return result.data;
      }

      const result = await bulkRegisterProfessionalPayments({
        mode: 'full',
        settlementIds: selectedSettlements.map((row) => row.id),
        method,
        reference: reference.trim() || null,
      });
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudieron registrar los pagos');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      const fail = data.failed.length;
      setFailedRows(data.failed);
      setMessage(
        fail > 0
          ? `${data.succeeded.length} pagadas · ${fail} con error`
          : `${data.succeeded.length} liquidacion${data.succeeded.length !== 1 ? 'es' : ''} pagada${data.succeeded.length !== 1 ? 's' : ''}`
      );
      if (fail === 0) {
        onComplete();
        onClose();
      }
    });
  };

  const hasInvalidCustomAmount = useCustomAmounts
    ? selectedSettlements.some((row) => {
        const amount = Number(amountsById[row.id] ?? 0);
        return !Number.isFinite(amount) || amount <= 0 || amount > row.balance_due;
      })
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
        <h3 className="text-lg font-semibold">Pagar liquidaciones seleccionadas</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedSettlements.length} liquidacion{selectedSettlements.length !== 1 ? 'es' : ''} · total a
          registrar {formatMoney(totalDue, currency)}
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustomAmounts}
              onChange={(e) => setUseCustomAmounts(e.target.checked)}
            />
            Monto personalizado por liquidación
          </label>

          {useCustomAmounts ? (
            <div className="space-y-2 rounded-md border p-3">
              {selectedSettlements.map((row) => (
                <div key={row.id} className="grid gap-1 sm:grid-cols-[1fr_120px] sm:items-end">
                  <div>
                    <p className="text-sm font-medium">{settlementLabel(row, professionals)}</p>
                    <p className="text-xs text-muted-foreground">
                      Saldo {formatMoney(row.balance_due, currency)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`bulk-pay-${row.id}`} className="text-xs">
                      Monto
                    </Label>
                    <Input
                      id={`bulk-pay-${row.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={row.balance_due}
                      value={amountsById[row.id] ?? ''}
                      onChange={(e) =>
                        setAmountsById((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="bulk-pay-method">Método</Label>
            <Select
              id="bulk-pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {PAYMENT_METHOD_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-pay-reference">Referencia (opcional)</Label>
            <Input
              id="bulk-pay-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="CBU, lote, comprobante..."
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={pending || totalDue <= 0 || hasInvalidCustomAmount}
            onClick={handlePay}
          >
            {pending ? 'Registrando...' : 'Registrar pagos'}
          </Button>
        </div>
        {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
        {failedRows.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-destructive">
            {failedRows.map((row) => {
              const settlement = selectedSettlements.find((item) => item.id === row.id);
              return (
                <li key={row.id}>
                  {settlement ? settlementLabel(settlement, professionals) : row.id.slice(0, 8)}:{' '}
                  {row.error}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
