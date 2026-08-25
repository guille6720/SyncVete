'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { exportSettlementDetailCsv, recalculateSettlementById } from '@/actions/professional-settlements';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  PAYMENT_METHOD_LABELS,
  SETTLEMENT_ADJUSTMENT_TYPE_LABELS,
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  formatMoney,
  type Professional,
  type ProfessionalSettlementDetail,
} from '@sincvete/shared';

interface SettlementDetailActionsProps {
  settlement: ProfessionalSettlementDetail;
  professional: Professional | null;
  organizationName: string;
  canSubmitForReview: boolean;
  canRecalculate: boolean;
  submitAction: (formData: FormData) => void;
  submitPending: boolean;
  exportOnly?: boolean;
  auditHref?: string | null;
  paymentsAuditHref?: string | null;
}

export function SettlementDetailActions({
  settlement,
  professional,
  organizationName,
  canSubmitForReview,
  canRecalculate,
  submitAction,
  submitPending,
  exportOnly = false,
  auditHref = null,
  paymentsAuditHref = null,
}: SettlementDetailActionsProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [exportPending, runExport] = usePendingAction();
  const [recalcPending, runRecalc] = usePendingAction();

  async function downloadCsv() {
    setExportMessage(null);
    const result = await runExport(() => exportSettlementDetailCsv(settlement.id));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setExportMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportMessage('CSV descargado');
  }

  async function handleRecalculate() {
    const confirmed = window.confirm(
      '¿Recalcular esta liquidación? Se regeneran ítems desde las reglas activas; los ajustes manuales se conservan.'
    );
    if (!confirmed) return;
    setRecalcMessage(null);
    const result = await runRecalc(() => recalculateSettlementById(settlement.id));
    if (!result) return;
    if (!result.success) {
      setRecalcMessage(result.error ?? 'No se pudo recalcular');
      return;
    }
    setRecalcMessage('Liquidación recalculada');
    router.refresh();
  }

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Comprobante liquidación</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 1.25rem; margin: 0 0 4px; }
        p { margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; }
        .muted { color: #666; font-size: 12px; }
      </style></head><body>${content.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }

  const currency = settlement.currency ?? 'ARS';
  const professionalName = professional
    ? `${professional.last_name}, ${professional.first_name}`
    : 'Profesional';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {!exportOnly && canSubmitForReview ? (
          <form action={submitAction}>
            <input type="hidden" name="settlementId" value={settlement.id} />
            <Button type="submit" variant="secondary" disabled={submitPending}>
              {submitPending ? 'Enviando...' : 'Enviar a revisión'}
            </Button>
          </form>
        ) : null}
        {!exportOnly && canRecalculate ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={recalcPending}
            onClick={() => void handleRecalculate()}
          >
            {recalcPending ? 'Recalculando...' : 'Recalcular'}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" disabled={exportPending} onClick={() => void downloadCsv()}>
          {exportPending ? 'Exportando...' : 'Exportar CSV'}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          Imprimir comprobante
        </Button>
        {auditHref ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={auditHref}>Ver en auditoría</Link>
          </Button>
        ) : null}
        {paymentsAuditHref ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={paymentsAuditHref}>Auditoría de pagos</Link>
          </Button>
        ) : null}
        {exportMessage ? <span className="text-xs text-muted-foreground">{exportMessage}</span> : null}
        {recalcMessage ? <span className="text-xs text-muted-foreground">{recalcMessage}</span> : null}
      </div>

      <div ref={printRef} className="hidden" aria-hidden>
        <h1>{organizationName}</h1>
        <p className="muted">Comprobante de liquidación · {new Date().toLocaleDateString('es-AR')}</p>
        <p>
          <strong>{professionalName}</strong>
        </p>
        <p>
          Período: {settlement.period_start} → {settlement.period_end}
        </p>
        <p>Estado: {SETTLEMENT_STATUS_LABELS[settlement.status]}</p>
        <table>
          <tbody>
            <tr>
              <th>Bruto</th>
              <td>{formatMoney(settlement.gross_amount, currency)}</td>
            </tr>
            <tr>
              <th>Ajustes</th>
              <td>{formatMoney(settlement.adjustments_amount, currency)}</td>
            </tr>
            <tr>
              <th>Deducciones</th>
              <td>{formatMoney(settlement.deductions_amount, currency)}</td>
            </tr>
            <tr>
              <th>Total</th>
              <td>{formatMoney(settlement.total_amount, currency)}</td>
            </tr>
            <tr>
              <th>Pagado</th>
              <td>{formatMoney(settlement.total_paid, currency)}</td>
            </tr>
            <tr>
              <th>Saldo</th>
              <td>{formatMoney(settlement.balance_due, currency)}</td>
            </tr>
          </tbody>
        </table>
        {settlement.items.length > 0 ? (
          <>
            <p style={{ marginTop: '16px' }}>
              <strong>Detalle calculado</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {settlement.items.map((item) => (
                  <tr key={item.id}>
                    <td>{SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[item.source_type]}</td>
                    <td>{item.description}</td>
                    <td>{formatMoney(item.calculated_amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        {settlement.payments.length > 0 ? (
          <>
            <p style={{ marginTop: '16px' }}>
              <strong>Pagos registrados</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Importe</th>
                  <th>Estado</th>
                  <th>Anulado</th>
                </tr>
              </thead>
              <tbody>
                {settlement.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paid_at.slice(0, 10)}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method]}</td>
                    <td>{formatMoney(payment.amount, payment.currency)}</td>
                    <td>{payment.deleted_at ? 'Anulado' : 'Activo'}</td>
                    <td>{payment.deleted_at ? payment.deleted_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        {settlement.adjustments.length > 0 ? (
          <>
            <p style={{ marginTop: '16px' }}>
              <strong>Ajustes manuales</strong>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {settlement.adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td>{SETTLEMENT_ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]}</td>
                    <td>{adjustment.reason}</td>
                    <td>{formatMoney(adjustment.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        <p className="muted" style={{ marginTop: '24px' }}>
          Documento operativo interno. No constituye recibo legal ni comprobante fiscal.
        </p>
      </div>
    </>
  );
}
