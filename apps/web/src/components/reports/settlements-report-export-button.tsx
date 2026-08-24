'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { buildSettlementsReportCsv, SETTLEMENT_STATUS_LABELS, type ClinicReport } from '@sincvete/shared';
import { Button } from '@/components/ui/button';

interface SettlementsReportExportButtonProps {
  report: ClinicReport;
}

export function SettlementsReportExportButton({ report }: SettlementsReportExportButtonProps) {
  const [message, setMessage] = useState<string | null>(null);

  if (!report.professionalsSettlements) return null;

  const handleExport = () => {
    const csv = buildSettlementsReportCsv(
      report.from,
      report.to,
      report.professionalsSettlements!,
      SETTLEMENT_STATUS_LABELS
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `liquidaciones-profesionales-${report.from}_${report.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(
      report.professionalsSettlements!.settlementsInPeriod > 0
        ? `Exportado · ${report.professionalsSettlements!.settlementsInPeriod} liquidaciones`
        : 'Exportado · sin liquidaciones en el período'
    );
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" onClick={handleExport}>
        <Download className="h-4 w-4" />
        Exportar liquidaciones
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
