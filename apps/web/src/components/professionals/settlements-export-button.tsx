'use client';

import { useState } from 'react';
import {
  exportSettlementsAccountingCsv,
  exportSettlementsHistoryCsv,
} from '@/actions/professional-settlements';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

interface SettlementsExportButtonProps {
  professionalId?: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
}

export function SettlementsExportButton({
  professionalId,
  status,
  periodStart,
  periodEnd,
  branchId,
}: SettlementsExportButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = usePendingAction();

  const filters = {
    professionalId: professionalId || undefined,
    status: status || undefined,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
    branchId: branchId || undefined,
  };

  async function downloadCsv(mode: 'operational' | 'accounting') {
    setMessage(null);
    const exportFn =
      mode === 'accounting' ? exportSettlementsAccountingCsv : exportSettlementsHistoryCsv;
    const result = await run(() => exportFn(filters));
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
      mode === 'accounting'
        ? `liquidaciones-contabilidad-${new Date().toISOString().slice(0, 10)}.csv`
        : `liquidaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} liquidaciones exportadas`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => void downloadCsv('operational')}>
        {pending ? 'Exportando...' : 'Exportar CSV'}
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => void downloadCsv('accounting')}>
        {pending ? 'Exportando...' : 'Export contable'}
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
