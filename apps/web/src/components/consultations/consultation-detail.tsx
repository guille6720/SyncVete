'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cancelConsultation } from '@/actions/consultations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePendingAction } from '@/lib/hooks/use-pending-action';
import {
  CLINICAL_FIELD_LABELS,
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  type ConsultationListRow,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';
import { SettlementSourceBadge } from '@/components/professionals/settlement-source-badge';

interface ConsultationDetailProps {
  consultation: ConsultationListRow;
  canWrite: boolean;
  canWriteBilling?: boolean;
  settlementClaim?: SettlementSourceClaimInfo | null;
  settlementDetailBasePath?: string;
}

export function ConsultationDetail({
  consultation,
  canWrite,
  canWriteBilling = false,
  settlementClaim = null,
  settlementDetailBasePath = '/liquidaciones',
}: ConsultationDetailProps) {
  const router = useRouter();
  const [pending, runPending] = usePendingAction();
  const canCancel =
    canWrite && (consultation.status === 'en_curso' || consultation.status === 'en_espera');

  const handleCancel = () => {
    if (!confirm('¿Cancelar esta consulta?')) return;
    void runPending(async () => {
      const result = await cancelConsultation(consultation.id);
      if (result.success) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/consultas">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a consultas
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {consultation.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${consultation.clinical_entry_id}`}>
                Ver en historia
              </Link>
            </Button>
          )}
          {consultation.appointment_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/agenda/${consultation.appointment_id}`}>Ver cita</Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/internacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Internar
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/vacunacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Vacunar
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/cirugias/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Cirugía
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/laboratorio/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Laboratorio
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/farmacia/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Recetar
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/imagenes/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Imagen
              </Link>
            </Button>
          )}
          {canWriteBilling && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/facturacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
              >
                Facturar
              </Link>
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              isPending={pending}
            >
              {pending ? 'Cancelando...' : 'Cancelar consulta'}
            </Button>
          )}
        </div>
      </div>

      {settlementClaim ? (
        <SettlementSourceBadge
          claim={settlementClaim}
          detailHref={`${settlementDetailBasePath}/${settlementClaim.settlementId}`}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{consultation.title || 'Consulta'}</CardTitle>
            <Badge variant={CONSULTATION_STATUS_VARIANT[consultation.status]}>
              {CONSULTATION_STATUS_LABELS[consultation.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(consultation.started_at)}
            {consultation.veterinarian_name ? ` · ${consultation.veterinarian_name}` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Paciente"
              value={
                <Link
                  href={`/pacientes/${consultation.patient_id}`}
                  className="text-primary hover:underline"
                >
                  {SPECIES_EMOJI[consultation.patient_species]} {consultation.patient_name}
                </Link>
              }
            />
            <DetailField
              label="Propietario"
              value={
                <Link
                  href={`/propietarios/${consultation.owner_id}`}
                  className="text-primary hover:underline"
                >
                  {consultation.owner_full_name}
                </Link>
              }
            />
            <DetailField
              label={CLINICAL_FIELD_LABELS.weightKg}
              value={consultation.weight_kg != null ? String(consultation.weight_kg) : null}
            />
            <DetailField
              label={CLINICAL_FIELD_LABELS.temperatureC}
              value={consultation.temperature_c != null ? String(consultation.temperature_c) : null}
            />
          </div>

          <Section label={CLINICAL_FIELD_LABELS.anamnesis} value={consultation.anamnesis} />
          <Section label={CLINICAL_FIELD_LABELS.physicalExam} value={consultation.physical_exam} />
          <Section label={CLINICAL_FIELD_LABELS.diagnosis} value={consultation.diagnosis} />
          <Section label={CLINICAL_FIELD_LABELS.treatment} value={consultation.treatment} />
          <Section label={CLINICAL_FIELD_LABELS.plan} value={consultation.plan} />
          <Section label="Notas adicionales" value={consultation.notes} />
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

function Section({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
