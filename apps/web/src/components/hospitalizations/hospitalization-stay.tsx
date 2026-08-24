'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { HospitalizationUpdateForm } from '@/components/hospitalizations/hospitalization-update-form';
import { HospitalizationNotes } from '@/components/hospitalizations/hospitalization-notes';
import { HospitalizationDischargeForm } from '@/components/hospitalizations/hospitalization-discharge-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  HOSPITALIZATION_STATUS_LABELS,
  HOSPITALIZATION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  formatHospitalizationStayDays,
  type HospitalizationListRow,
  type HospitalizationNote,
  type SettlementSourceClaimInfo,
} from '@sincvete/shared';

interface HospitalizationStayProps {
  stay: HospitalizationListRow;
  notes: HospitalizationNote[];
  canWrite: boolean;
  settlementClaimsByNoteId?: Record<string, SettlementSourceClaimInfo>;
}

export function HospitalizationStay({
  stay,
  notes,
  canWrite,
  settlementClaimsByNoteId = {},
}: HospitalizationStayProps) {
  const isActive = stay.status === 'internado' || stay.status === 'observacion';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/internacion">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a internación
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {stay.clinical_entry_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/historia-clinica/${stay.clinical_entry_id}`}>Ver en historia</Link>
            </Button>
          )}
          {stay.consultation_id && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/consultas/${stay.consultation_id}`}>Ver consulta</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {SPECIES_EMOJI[stay.patient_species]} {stay.patient_name}
            </CardTitle>
            <Badge variant={HOSPITALIZATION_STATUS_VARIANT[stay.status]}>
              {HOSPITALIZATION_STATUS_LABELS[stay.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatClinicalEntryDateTime(stay.admitted_at)}
            {stay.veterinarian_name ? ` · ${stay.veterinarian_name}` : ''}
            {' · '}
            {formatHospitalizationStayDays(stay.admitted_at, stay.discharged_at)}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Paciente"
            value={
              <Link href={`/pacientes/${stay.patient_id}`} className="text-primary hover:underline">
                {stay.patient_name}
              </Link>
            }
          />
          <DetailField
            label="Propietario"
            value={
              <Link href={`/propietarios/${stay.owner_id}`} className="text-primary hover:underline">
                {stay.owner_full_name}
              </Link>
            }
          />
          <DetailField label="Jaula / box" value={stay.cage} />
          <DetailField label="Motivo" value={stay.reason} />
          {!isActive && (
            <>
              <DetailField
                label="Alta"
                value={stay.discharged_at ? formatClinicalEntryDateTime(stay.discharged_at) : null}
              />
              <DetailField label="Resumen de alta" value={stay.discharge_summary} />
            </>
          )}
          {!isActive && stay.diagnosis && (
            <div className="sm:col-span-2">
              <DetailField label="Diagnóstico" value={stay.diagnosis} />
            </div>
          )}
          {!isActive && stay.treatment_plan && (
            <div className="sm:col-span-2">
              <DetailField label="Plan de tratamiento" value={stay.treatment_plan} />
            </div>
          )}
          {!isActive && stay.notes && (
            <div className="sm:col-span-2">
              <DetailField label="Notas" value={stay.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      {isActive && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Plan de internación</CardTitle>
          </CardHeader>
          <CardContent>
            <HospitalizationUpdateForm stay={stay} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Evoluciones</CardTitle>
        </CardHeader>
        <CardContent>
          <HospitalizationNotes
            hospitalizationId={stay.id}
            notes={notes}
            canWrite={canWrite}
            isActive={isActive}
            settlementClaimsByNoteId={settlementClaimsByNoteId}
          />
        </CardContent>
      </Card>

      {isActive && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>Cerrar internación</CardTitle>
          </CardHeader>
          <CardContent>
            <HospitalizationDischargeForm hospitalizationId={stay.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 whitespace-pre-wrap text-sm">{value || '—'}</div>
    </div>
  );
}
