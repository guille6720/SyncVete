'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  bulkApproveSettlements,
  bulkSubmitSettlementsForReview,
} from '@/actions/professional-settlements';
import { SettlementsBulkPayDialog } from '@/components/professionals/settlements-bulk-pay-dialog';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import type { BulkSettlementActionResult, Professional, ProfessionalSettlement } from '@sincvete/shared';

interface SettlementsBulkToolbarProps {
  selectedIds: string[];
  selectedSettlements: ProfessionalSettlement[];
  professionals: Professional[];
  canApprove: boolean;
  canSubmitForReview: boolean;
  canPay: boolean;
  currency?: string;
  openCashSessionId?: string | null;
  canPostCashEgreso?: boolean;
  onClear: () => void;
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

export function SettlementsBulkToolbar({
  selectedIds,
  selectedSettlements,
  professionals,
  canApprove,
  canSubmitForReview,
  canPay,
  currency = 'ARS',
  openCashSessionId = null,
  canPostCashEgreso = false,
  onClear,
  onComplete,
}: SettlementsBulkToolbarProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [failedRows, setFailedRows] = useState<BulkSettlementActionResult['failed']>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, run] = usePendingAction();

  if (selectedIds.length === 0) return null;

  const handleBulk = (mode: 'approve' | 'review') => {
    if (mode === 'approve') {
      const confirmed = window.confirm(
        `¿Aprobar ${selectedIds.length} liquidación${selectedIds.length !== 1 ? 'es' : ''} seleccionada${selectedIds.length !== 1 ? 's' : ''}?`
      );
      if (!confirmed) return;
    }
    setMessage(null);
    setFailedRows([]);
    void run(async () => {
      const result =
        mode === 'approve'
          ? await bulkApproveSettlements(selectedIds)
          : await bulkSubmitSettlementsForReview(selectedIds);
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudo completar la acción');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      const ok = data.succeeded.length;
      const fail = data.failed.length;
      setFailedRows(data.failed);
      setMessage(
        fail > 0
          ? `${ok} OK · ${fail} con error`
          : `${ok} liquidacion${ok !== 1 ? 'es' : ''} procesada${ok !== 1 ? 's' : ''}`
      );
      if (fail === 0) {
        onClear();
        onComplete();
      }
    });
  };

  const payableSettlements = selectedSettlements.filter(
    (row) =>
      (row.status === 'approved' || row.status === 'partially_paid') && row.balance_due > 0
  );

  const settlementById = new Map(selectedSettlements.map((row) => [row.id, row]));

  return (
    <>
      <div className="flex w-full flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{selectedIds.length} seleccionada(s)</span>
          {canSubmitForReview ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => handleBulk('review')}>
              Enviar a revisión
            </Button>
          ) : null}
          {canApprove ? (
            <Button size="sm" disabled={pending} onClick={() => handleBulk('approve')}>
              Aprobar
            </Button>
          ) : null}
          {canPay && payableSettlements.length > 0 ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPayOpen(true)}>
              Pagar saldo
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={pending} onClick={onClear}>
            Limpiar
          </Button>
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        </div>

        {failedRows.length > 0 ? (
          <ul className="space-y-1 text-xs text-destructive">
            {failedRows.map((row) => {
              const settlement = settlementById.get(row.id);
              return (
                <li key={row.id}>
                  <Link href={`/liquidaciones/${row.id}`} className="underline underline-offset-2">
                    {settlement
                      ? settlementLabel(settlement, professionals)
                      : row.id.slice(0, 8)}
                  </Link>
                  {': '}
                  {row.error}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <SettlementsBulkPayDialog
        open={payOpen}
        selectedSettlements={payableSettlements}
        professionals={professionals}
        currency={currency}
        openCashSessionId={openCashSessionId}
        canPostCashEgreso={canPostCashEgreso}
        onClose={() => setPayOpen(false)}
        onComplete={() => {
          onClear();
          onComplete();
        }}
      />
    </>
  );
}
