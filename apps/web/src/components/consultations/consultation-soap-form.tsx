'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { completeConsultationAction, saveConsultationDraft } from '@/actions/consultations';
import { ConsultationReferralPanel } from '@/components/consultations/consultation-referral-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  CLINICAL_FIELD_LABELS,
  CONSULTATION_STATUS_LABELS,
  CONSULTATION_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  type AssignableStaffMember,
  type ConsultationListRow,
} from '@sincvete/shared';

interface ConsultationSoapFormProps {
  consultation: ConsultationListRow;
  canWriteBilling?: boolean;
  canRefer?: boolean;
  staff?: AssignableStaffMember[];
}

export function ConsultationSoapForm({
  consultation,
  canWriteBilling = false,
  canRefer = false,
  staff = [],
}: ConsultationSoapFormProps) {
  const saveAction = saveConsultationDraft.bind(null, consultation.id);
  const completeAction = completeConsultationAction.bind(null, consultation.id);
  const [saveState, saveFormAction, savePending] = useActionState(saveAction, null);
  const [completeState, completeFormAction, completePending] = useActionState(completeAction, null);

  const state = completeState ?? saveState;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl leading-tight sm:text-2xl">
            {SPECIES_EMOJI[consultation.patient_species]} {consultation.patient_name}
          </CardTitle>
          <Badge variant={CONSULTATION_STATUS_VARIANT[consultation.status]}>
            {CONSULTATION_STATUS_LABELS[consultation.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {formatClinicalEntryDateTime(consultation.started_at)} · {consultation.owner_full_name}
          {consultation.veterinarian_name ? ` · ${consultation.veterinarian_name}` : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
        <form className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.7fr))]">
            <div className="space-y-1">
              <Label htmlFor="title" className="text-xs sm:text-sm">
                Motivo
              </Label>
              <Input id="title" name="title" defaultValue={consultation.title ?? ''} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="weightKg" className="text-xs sm:text-sm">
                {CLINICAL_FIELD_LABELS.weightKg}
              </Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                step="0.01"
                min="0"
                className="h-9"
                defaultValue={consultation.weight_kg ?? ''}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="temperatureC" className="text-xs sm:text-sm">
                {CLINICAL_FIELD_LABELS.temperatureC}
              </Label>
              <Input
                id="temperatureC"
                name="temperatureC"
                type="number"
                step="0.1"
                min="30"
                max="45"
                className="h-9"
                defaultValue={consultation.temperature_c ?? ''}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SoapField
              id="anamnesis"
              name="anamnesis"
              label={CLINICAL_FIELD_LABELS.anamnesis}
              defaultValue={consultation.anamnesis ?? ''}
            />
            <SoapField
              id="physicalExam"
              name="physicalExam"
              label={CLINICAL_FIELD_LABELS.physicalExam}
              defaultValue={consultation.physical_exam ?? ''}
            />
            <SoapField
              id="diagnosis"
              name="diagnosis"
              label={CLINICAL_FIELD_LABELS.diagnosis}
              defaultValue={consultation.diagnosis ?? ''}
            />
            <SoapField
              id="treatment"
              name="treatment"
              label={CLINICAL_FIELD_LABELS.treatment}
              defaultValue={consultation.treatment ?? ''}
            />
            <SoapField
              id="plan"
              name="plan"
              label={CLINICAL_FIELD_LABELS.plan}
              defaultValue={consultation.plan ?? ''}
            />
            <SoapField
              id="notes"
              name="notes"
              label="Notas adicionales"
              defaultValue={consultation.notes ?? ''}
              rows={2}
            />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {saveState?.success && !completeState?.success && (
            <p className="text-sm text-emerald-600">Borrador guardado</p>
          )}
          {completeState?.success && (
            <p className="text-sm text-emerald-600">Consulta completada e historia actualizada</p>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <Button
                formAction={saveFormAction}
                variant="outline"
                size="sm"
                isPending={savePending}
                disabled={completePending}
              >
                {savePending ? 'Guardando...' : 'Guardar borrador'}
              </Button>
              <Button
                formAction={completeFormAction}
                size="sm"
                isPending={completePending}
                disabled={savePending}
              >
                {completePending ? 'Completando...' : 'Completar consulta'}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/consultas">Volver a la cola</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/internacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Internar
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/vacunacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Vacunar
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/cirugias/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Cirugía
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/laboratorio/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Laboratorio
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/farmacia/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Recetar
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/imagenes/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                >
                  Imagen
                </Link>
              </Button>
              {canWriteBilling && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/facturacion/nueva?patientId=${consultation.patient_id}&consultationId=${consultation.id}`}
                  >
                    Facturar
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </form>

        {canRefer ? (
          <div className="pt-1">
            <ConsultationReferralPanel consultation={consultation} staff={staff} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SoapField({
  id,
  name,
  label,
  defaultValue,
  rows = 2,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs sm:text-sm">
        {label}
      </Label>
      <Textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="min-h-[4.5rem] resize-y text-sm"
      />
    </div>
  );
}
