'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { historyExportUrl } from '@/lib/clinical-history-report';

export function ClinicalHistoryPrintControls({
  patientId,
  date,
  autoPrint,
}: {
  patientId: string;
  date?: string;
  autoPrint: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) window.print();
    });
    return () => {
      active = false;
    };
  }, [autoPrint]);
  return (
    <div className="history-print-controls flex flex-wrap justify-center gap-3 p-4">
      <Button variant="outline" asChild>
        <Link href="/historia-clinica">Volver a historias clínicas</Link>
      </Button>
      <Button variant="outline" asChild>
        <a href={historyExportUrl(patientId, date)}>Descargar PDF</a>
      </Button>
      <Button onClick={() => window.print()}>Imprimir</Button>
    </div>
  );
}
