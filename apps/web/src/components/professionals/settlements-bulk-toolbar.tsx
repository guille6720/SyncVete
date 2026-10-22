'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  bulkApproveSettlements,
  bulkCancelSettlements,
  bulkReturnSettlementsToDraft,
  bulkSubmitSettlementsForReview,
  preflightBulkApproveDuplicates,
} from '@/actions/professional-settlements';
import { SettlementsBulkPayDialog } from '@/components/professionals/settlements-bulk-pay-dialog';
import {
  SettlementsBulkReasonDialog,
  type SettlementsBulkReasonMode,
} from '@/components/professionals/settlements-bulk-reason-dialog';
import { SettlementsConfirmDialog } from '@/components/professionals/settlements-confirm-dialog';
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
  const [reasonDialog, setReasonDialog] = useState<{
    mode: SettlementsBulkReasonMode;
    ids: string[];
  } | null>(null);
  const [approveDialog, setApproveDialog] = useState<{
    mode: 'confirm' | 'alert';
    description: string;
  } | null>(null);
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
  const [pending, run] = usePendingAction();

  if (selectedIds.length === 0) return null;

  const draftIds = selectedSettlements
    .filter((row) => row.status === 'draft')
    .map((row) => row.id);

  const applyBulkResult = (data: BulkSettlementActionResult) => {
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
  };

  const runApprove = () => {
    setMessage(null);
    setFailedRows([]);
    void run(async () => {
      const result = await bulkApproveSettlements(selectedIds);
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudo completar la acción');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      applyBulkResult(data);
    });
  };

  const runSubmitForReview = () => {
    setMessage(null);
    setFailedRows([]);
    void run(async () => {
      const result = await bulkSubmitSettlementsForReview(draftIds);
      if (!result?.success || !result.data) {
        throw new Error(result?.error ?? 'No se pudo completar la acción');
      }
      return result.data;
    }).then((data) => {
      if (!data) return;
      applyBulkResult(data);
    });
  };

  const handleBulk = (mode: 'approve' | 'review') => {
    setMessage(null);
    setFailedRows([]);
    if (mode === 'approve') {
      void run(async () => {
        const preflight = await preflightBulkApproveDuplicates(selectedIds);
        if (!preflight?.success || !preflight.data) {
          throw new Error(preflight?.error ?? 'No se pudo validar conflictos');
        }
        return preflight.data;
      }).then((data) => {
        if (!data) return;
        if (data.hardSettlements > 0) {
          setApproveDialog({
            mode: 'alert',
            description: `${data.hardSettlements} liquidación${data.hardSettlements !== 1 ? 'es' : ''} con conflictos duros (${data.hardWarnings} fuente${data.hardWarnings !== 1 ? 's' : ''} ya liquidadas). Revisá u omití antes de aprobar en bloque.`,
          });
          return;
        }
        const softNote =
          data.softSettlements > 0 ? ` ${data.softSettlements} con avisos suaves.` : '';
        setApproveDialog({
          mode: 'confirm',
          description: `¿Aprobar ${selectedIds.length} liquidación${selectedIds.length !== 1 ? 'es' : ''} seleccionada${selectedIds.length !== 1 ? 's' : ''}?${softNote}`,
        });
      });
      return;
    }

    if (draftIds.length === 0) {
      setMessage('Seleccioná liquidaciones en borrador');
      return;
    }
    setReviewConfirmOpen(true);
  };

  const openReturnDialog = () => {
    const reviewIds = selectedSettlements
      .filter((row) => row.status === 'review')
      .map((row) => row.id);
    if (reviewIds.length === 0) {
      setMessage('Seleccioná liquidaciones en revisión');
      return;
    }
    setReasonDialog({ mode: 'return', ids: reviewIds });
  };

  const openCancelDialog = () => {
    const cancelIds = selectedSettlements
      .filter((row) => row.status === 'draft' || row.status === 'review')
      .map((row) => row.id);
    if (cancelIds.length === 0) {
      setMessage('Seleccioná liquidaciones en borrador o revisión');
      return;
    }
    setReasonDialog({ mode: 'cancel', ids: cancelIds });
  };

  const handleReasonConfirm = async (reason: string) => {
    if (!reasonDialog) return;
    setMessage(null);
    setFailedRows([]);
    const result =
      reasonDialog.mode === 'return'
        ? await bulkReturnSettlementsToDraft(reasonDialog.ids, reason)
        : await bulkCancelSettlements(reasonDialog.ids, reason);
    if (!result?.success || !result.data) {
      throw new Error(
        result?.error ??
          (reasonDialog.mode === 'return'
            ? 'No se pudo devolver a borrador'
            : 'No se pudo cancelar')
      );
    }
    applyBulkResult(result.data);
  };

  const payableSettlements = selectedSettlements.filter(
    (row) =>
      (row.status === 'approved' || row.status === 'partially_paid') && row.balance_due > 0
  );
  const returnableCount = selectedSettlements.filter((row) => row.status === 'review').length;
  const cancellableCount = selectedSettlements.filter(
    (row) => row.status === 'draft' || row.status === 'review'
  ).length;

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
          {canApprove && returnableCount > 0 ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={openReturnDialog}>
              Devolver a borrador
            </Button>
          ) : null}
          {canApprove && cancellableCount > 0 ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={openCancelDialog}>
              Cancelar
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

      <SettlementsBulkReasonDialog
        open={Boolean(reasonDialog)}
        mode={reasonDialog?.mode ?? 'return'}
        count={reasonDialog?.ids.length ?? 0}
        onClose={() => setReasonDialog(null)}
        onConfirm={handleReasonConfirm}
      />

      <SettlementsConfirmDialog
        open={Boolean(approveDialog)}
        title={approveDialog?.mode === 'alert' ? 'No se puede aprobar' : 'Aprobar liquidaciones'}
        description={approveDialog?.description ?? ''}
        mode={approveDialog?.mode ?? 'confirm'}
        confirmLabel="Aprobar"
        onClose={() => setApproveDialog(null)}
        onConfirm={runApprove}
      />

      <SettlementsConfirmDialog
        open={reviewConfirmOpen}
        title="Enviar a revisión"
        description={`¿Enviar ${draftIds.length} liquidación${draftIds.length !== 1 ? 'es' : ''} en borrador a revisión?`}
        confirmLabel="Enviar a revisión"
        onClose={() => setReviewConfirmOpen(false)}
        onConfirm={runSubmitForReview}
      />
    </>
  );
}
