'use client';

import { useState } from 'react';
import {
  exportMySettlementsHistoryCsv,
  exportSettlementsAccountingCsv,
  exportSettlementsHistoryCsv,
} from '@/actions/professional-settlements';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import { SETTLEMENT_EXPORT_MAX_ROWS } from '@sincvete/shared';

interface SettlementsExportButtonProps {
  professionalId?: string;
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
  /** Portal "mis liquidaciones" — only operational CSV for the linked professional. */
  scope?: 'org' | 'mine';
}

export function SettlementsExportButton({
  professionalId,
  status,
  pendingReview,
  unpaid,
  paidInMonth,
  periodStart,
  periodEnd,
  branchId,
  scope = 'org',
}: SettlementsExportButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = usePendingAction();

  const filters = {
    professionalId: professionalId || undefined,
    status: pendingReview || unpaid || paidInMonth ? undefined : status || undefined,
    pendingReview: pendingReview || undefined,
    unpaid: unpaid || undefined,
    paidInMonth: paidInMonth || undefined,
    periodStart: paidInMonth ? undefined : periodStart || undefined,
    periodEnd: paidInMonth ? undefined : periodEnd || undefined,
    branchId: branchId || undefined,
  };

  async function downloadCsv(mode: 'operational' | 'accounting') {
    setMessage(null);
    const result = await run(async () => {
      if (scope === 'mine') {
        return exportMySettlementsHistoryCsv({
          status: filters.status,
          pendingReview: filters.pendingReview,
          unpaid: filters.unpaid,
          paidInMonth: filters.paidInMonth,
          periodStart: filters.periodStart,
          periodEnd: filters.periodEnd,
        });
      }
      return mode === 'accounting'
        ? exportSettlementsAccountingCsv(filters)
        : exportSettlementsHistoryCsv(filters);
    });
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      scope === 'mine'
        ? `mis-liquidaciones-${new Date().toISOString().slice(0, 10)}.csv`
        : mode === 'accounting'
          ? `liquidaciones-contabilidad-${new Date().toISOString().slice(0, 10)}.csv`
          : `liquidaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    const { rowCount, total, truncated } = result.data;
    const truncateHint = paidInMonth
      ? 'filtrá estado o profesional'
      : 'filtrá período';
    setMessage(
      truncated
        ? `${rowCount} de ${total} exportadas (tope ${SETTLEMENT_EXPORT_MAX_ROWS} — ${truncateHint})`
        : `${rowCount} liquidaciones exportadas`
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => void downloadCsv('operational')}>
        {pending ? 'Exportando...' : 'Exportar CSV'}
      </Button>
      {scope === 'org' ? (
        <div className="flex flex-col gap-0.5">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void downloadCsv('accounting')}>
            {pending ? 'Exportando...' : 'Export contable'}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            CSV operativo (no comprobante fiscal)
          </span>
        </div>
      ) : null}
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
