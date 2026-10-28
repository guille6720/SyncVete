'use client';

import { useId, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { ModalShell } from '@/components/ui/modal-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { clinicalDay, historyExportUrl, isClinicalDate } from '@/lib/clinical-history-report';

export function ClinicalHistoryExport({
  patientId,
  patientName,
  entryDate,
}: {
  patientId: string;
  patientName: string;
  entryDate?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('all');
  const [date, setDate] = useState(() => clinicalDay(entryDate));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedDate = scope === 'day' ? date : undefined;
  const valid = scope === 'all' || isClinicalDate(date);
  const download = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(historyExportUrl(patientId, selectedDate), {
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'No se pudo descargar la historia clínica');
      }
      if (!response.headers.get('Content-Type')?.includes('application/pdf')) {
        throw new Error(
          'La sesión venció o la descarga no está disponible. Recargá la pantalla e intentá nuevamente.'
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'historia-clinica.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar la historia clínica');
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Imprimir o descargar historia de ${patientName}`}
      >
        <Printer className="mr-2 h-4 w-4" /> Imprimir / descargar
      </Button>
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        titleId={`${id}-title`}
        title={`Historia clínica de ${patientName}`}
        description="Elegí qué atenciones querés incluir. La historia completa incluye todas las entradas disponibles, aunque no estén en esta página."
      >
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-scope`}>Contenido</Label>
            <Select id={`${id}-scope`} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Historia completa</option>
              <option value="day">Atenciones de una fecha</option>
            </Select>
          </div>
          {scope === 'day' && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-date`}>Fecha de atención</Label>
              <Input
                id={`${id}-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se incluyen todas las atenciones de ese día, en el horario de la clínica.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            <Button variant="outline" disabled={!valid} asChild={valid}>
              {valid ? (
                <a
                  href={historyExportUrl(patientId, selectedDate, true)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </a>
              ) : (
                <span>Imprimir</span>
              )}
            </Button>
            <Button onClick={() => void download()} disabled={!valid} isPending={pending}>
              <Download className="mr-2 h-4 w-4" />
              {pending ? 'Preparando PDF…' : 'Descargar PDF'}
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
