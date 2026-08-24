'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Images, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { deleteClinicalEntry } from '@/actions/clinical-entries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  CLINICAL_ENTRY_TYPE_LABELS,
  CLINICAL_ENTRY_TYPE_VARIANT,
  CLINICAL_FIELD_LABELS,
  formatClinicalEntryDateTime,
  SPECIES_EMOJI,
  buildClinicalAiPath,
  type ClinicalEntryListRow,
} from '@sincvete/shared';

interface ClinicalEntryDetailProps {
  entry: ClinicalEntryListRow;
  canWrite: boolean;
}

export function ClinicalEntryDetail({ entry, canWrite }: ClinicalEntryDetailProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();

  const handleDelete = () => {
    if (!confirm('¿Eliminar esta entrada clínica?')) return;
    void runPending(async () => {
      const result = await deleteClinicalEntry(entry.id);
      if (result.success) {
        router.push(`/pacientes/${entry.patient_id}/historia`);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/pacientes/${entry.patient_id}/historia`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a historia
          </Link>
        </Button>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={buildClinicalAiPath({
                  patientId: entry.patient_id,
                  kind: 'owner_instructions',
                  clinicalEntryId: entry.id,
                })}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Indicaciones IA
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/imagenes/nueva?patientId=${entry.patient_id}&clinicalEntryId=${entry.id}`}
              >
                <Images className="mr-2 h-4 w-4" />
                Subir imagen
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${entry.id}/editar`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              isPending={pending}
            >
              {pending ? (
                'Eliminando...'
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {entry.title || CLINICAL_ENTRY_TYPE_LABELS[entry.entry_type]}
            </CardTitle>
            <Badge variant={CLINICAL_ENTRY_TYPE_VARIANT[entry.entry_type]}>
              {CLINICAL_ENTRY_TYPE_LABELS[entry.entry_type]}
            </Badge>
            {entry.source_system || entry.imported_at ? (
              <Badge variant="warning">Importado</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(entry.entry_date)}
            {entry.recorded_by_name ? ` · ${entry.recorded_by_name}` : ''}
          </p>
          {entry.source_system || entry.original_professional_name ? (
            <p className="text-xs text-muted-foreground">
              Procedencia
              {entry.source_system ? ` · Origen: ${entry.source_system}` : ''}
              {entry.original_professional_name
                ? ` · Profesional original: ${entry.original_professional_name}`
                : ''}
              {entry.original_created_at
                ? ` · Fecha original: ${formatClinicalEntryDateTime(entry.original_created_at)}`
                : ''}
              {entry.source_record_id ? ` · ID origen: ${entry.source_record_id}` : ''}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Paciente"
              value={
                <Link
                  href={`/pacientes/${entry.patient_id}`}
                  className="text-primary hover:underline"
                >
                  {SPECIES_EMOJI[entry.patient_species]} {entry.patient_name}
                </Link>
              }
            />
            <DetailField
              label="Propietario"
              value={
                <Link
                  href={`/propietarios/${entry.owner_id}`}
                  className="text-primary hover:underline"
                >
                  {entry.owner_full_name}
                </Link>
              }
            />
            <DetailField
              label={CLINICAL_FIELD_LABELS.weightKg}
              value={entry.weight_kg != null ? String(entry.weight_kg) : null}
            />
            <DetailField
              label={CLINICAL_FIELD_LABELS.temperatureC}
              value={entry.temperature_c != null ? String(entry.temperature_c) : null}
            />
          </div>

          <ClinicalSection label={CLINICAL_FIELD_LABELS.anamnesis} value={entry.anamnesis} />
          <ClinicalSection label={CLINICAL_FIELD_LABELS.physicalExam} value={entry.physical_exam} />
          <ClinicalSection label={CLINICAL_FIELD_LABELS.diagnosis} value={entry.diagnosis} />
          <ClinicalSection label={CLINICAL_FIELD_LABELS.treatment} value={entry.treatment} />
          <ClinicalSection label={CLINICAL_FIELD_LABELS.plan} value={entry.plan} />
          <ClinicalSection label="Notas adicionales" value={entry.notes} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{value || '—'}</div>
    </div>
  );
}

function ClinicalSection({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
