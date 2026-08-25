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
  openCashSessionId?: string | null;
  canPostCashEgreso?: boolean;
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
  openCashSessionId = null,
  canPostCashEgreso = false,
  onClose,
  onComplete,
}: SettlementsBulkPayDialogProps) {
  const [method, setMethod] = useState<string>('transferencia');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceAttachmentUrl, setInvoiceAttachmentUrl] = useState('');
  const [useCustomAmounts, setUseCustomAmounts] = useState(false);
  const [postCashEgreso, setPostCashEgreso] = useState(false);
  const [amountsById, setAmountsById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failedRows, setFailedRows] = useState<Array<{ id: string; error: string }>>([]);
  const [warnings, setWarnings] = useState<Array<{ id: string; message: string }>>([]);
  const [pending, run] = usePendingAction();

  useEffect(() => {
    if (!open) return;
    setUseCustomAmounts(false);
    setAmountsById(
      Object.fromEntries(selectedSettlements.map((row) => [row.id, String(row.balance_due)]))
    );
    setMessage(null);
    setFailedRows([]);
    setWarnings([]);
    setInvoiceNumber('');
    setInvoiceDate('');
    setInvoiceAmount('');
    setInvoiceAttachmentUrl('');
    setNotes('');
    setPaidAt(new Date().toISOString().slice(0, 16));
    setPostCashEgreso(false);
  }, [open, selectedSettlements]);

  if (!open) return null;

  const requiresInvoice = selectedSettlements.some((settlement) => {
    const professional = professionals.find((row) => row.id === settlement.professional_id);
    return Boolean(professional?.invoice_required);
  });

  const totalDue = selectedSettlements.reduce((sum, row) => {
    if (useCustomAmounts) {
      const custom = Number(amountsById[row.id] ?? 0);
      return sum + (Number.isFinite(custom) ? custom : 0);
    }
    return sum + row.balance_due;
  }, 0);

  const showCashOption = canPostCashEgreso && Boolean(openCashSessionId) && method === 'efectivo';

  const handlePay = () => {
    setMessage(null);
    setFailedRows([]);
    setWarnings([]);
    void run(async () => {
      const paidAtIso = paidAt ? new Date(paidAt).toISOString() : undefined;
      const common = {
        method,
        paidAt: paidAtIso,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        invoiceAmount: invoiceAmount ? Number(invoiceAmount) : null,
        invoiceAttachmentUrl: invoiceAttachmentUrl.trim() || null,
        postCashEgreso: showCashOption && postCashEgreso,
        cashSessionId: showCashOption && postCashEgreso ? openCashSessionId : null,
      };

      if (useCustomAmounts) {
        const payments = selectedSettlements.map((row) => ({
          settlementId: row.id,
          amount: Number(amountsById[row.id] ?? 0),
        }));
        const result = await bulkRegisterProfessionalPayments({
          mode: 'custom',
          payments,
          ...common,
        });
        if (!result?.success || !result.data) {
          throw new Error(result?.error ?? 'No se pudieron registrar los pagos');
        }
        return result.data;
      }

      const result = await bulkRegisterProfessionalPayments({
        mode: 'full',
        settlementIds: selectedSettlements.map((row) => row.id),
        ...common,
      });
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudieron registrar los pagos');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      const fail = data.failed.length;
      setFailedRows(data.failed);
      setWarnings(data.warnings ?? []);
      setMessage(
        fail > 0
          ? `${data.succeeded.length} pagadas · ${fail} con error`
          : `${data.succeeded.length} liquidacion${data.succeeded.length !== 1 ? 'es' : ''} pagada${data.succeeded.length !== 1 ? 's' : ''}`
      );
      if (fail === 0 && !(data.warnings && data.warnings.length > 0)) {
        onComplete();
        onClose();
      } else if (fail === 0) {
        onComplete();
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
              onChange={(e) => {
                setMethod(e.target.value);
                if (e.target.value !== 'efectivo') setPostCashEgreso(false);
              }}
            >
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>
                  {PAYMENT_METHOD_LABELS[item]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-pay-paid-at">Fecha de pago</Label>
            <Input
              id="bulk-pay-paid-at"
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
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
          <div className="space-y-2">
            <Label htmlFor="bulk-pay-notes">Notas (opcional)</Label>
            <Input
              id="bulk-pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observación del lote"
              maxLength={500}
            />
          </div>
          {showCashOption ? (
            <label className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={postCashEgreso}
                onChange={(e) => setPostCashEgreso(e.target.checked)}
              />
              <span>
                Registrar egreso en la caja abierta por cada pago. No revierte automáticamente si
                anulás el pago después.
              </span>
            </label>
          ) : canPostCashEgreso && method === 'efectivo' && !openCashSessionId ? (
            <p className="text-xs text-muted-foreground">
              No hay caja abierta en esta sucursal para registrar egreso.
            </p>
          ) : null}
          {requiresInvoice ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Algunos profesionales requieren factura — los datos se aplican a todos los pagos
                del lote.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bulk-pay-invoice-number">Nº factura</Label>
                  <Input
                    id="bulk-pay-invoice-number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="0001-00001234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-pay-invoice-date">Fecha factura</Label>
                  <Input
                    id="bulk-pay-invoice-date"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-pay-invoice-amount">Importe factura</Label>
                <Input
                  id="bulk-pay-invoice-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-pay-invoice-url">URL adjunto factura</Label>
                <Input
                  id="bulk-pay-invoice-url"
                  type="url"
                  value={invoiceAttachmentUrl}
                  onChange={(e) => setInvoiceAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                  maxLength={500}
                />
              </div>
            </div>
          ) : null}
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
        {warnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {warnings.map((row) => (
              <li key={`${row.id}-${row.message}`}>{row.message}</li>
            ))}
          </ul>
        ) : null}
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
