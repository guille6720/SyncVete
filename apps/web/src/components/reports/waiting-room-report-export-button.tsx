'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { getWaitingRoomReportEntries } from '@/actions/reports';
import { buildFullWaitingRoomReportCsv, type ClinicReport } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

interface WaitingRoomReportExportButtonProps {
  report: ClinicReport;
}

export function WaitingRoomReportExportButton({ report }: WaitingRoomReportExportButtonProps) {
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!report.waitingRoom) return null;

  const handleExport = () => {
    setMessage(null);
    void run(async () => {
      const entries = await getWaitingRoomReportEntries({
        from: report.from,
        to: report.to,
      });
      const csv = buildFullWaitingRoomReportCsv(
        report.from,
        report.to,
        report.waitingRoom!,
        entries
      );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sala-espera-${report.from}_${report.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return entries;
    }).then((entries) => {
      if (entries == null) return;
      setMessage(
        entries.length > 0
          ? `Exportado · ${entries.length} ingresos`
          : 'Exportado · sin ingresos en el período'
      );
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" isPending={pending} onClick={handleExport}>
        <Download className="h-4 w-4" />
        {pending ? 'Exportando…' : 'Exportar CSV'}
      </Button>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
