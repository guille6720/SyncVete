'use client';

import { useActionState } from 'react';
import { generateClinicalAi } from '@/actions/clinical-ai';
import { PatientPicker } from '@/components/appointments/patient-picker';
import { ClinicalAiResult } from '@/components/clinical-ai/clinical-ai-result';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CLINICAL_AI_DISCLAIMER,
  CLINICAL_AI_KINDS,
  CLINICAL_AI_KIND_LABELS,
  formatMeteredUsage,
  isQuotaNearLimit,
  type ClinicalAiKind,
  type MeteredUsageMeter,
} from '@sincvete/shared';

interface ClinicalAiGenerateFormProps {
  defaultPatientId?: string;
  defaultPatientName?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  defaultKind?: ClinicalAiKind;
  consultationId?: string;
  clinicalEntryId?: string;
  configured: boolean;
  canGenerate: boolean;
  usage?: MeteredUsageMeter | null;
}

export function ClinicalAiGenerateForm({
  defaultPatientId,
  defaultPatientName,
  defaultOwnerId,
  defaultOwnerName,
  defaultKind = 'patient_summary',
  consultationId,
  clinicalEntryId,
  configured,
  canGenerate,
  usage = null,
}: ClinicalAiGenerateFormProps) {
  const [state, formAction, pending] = useActionState(generateClinicalAi, null);

  return (
    <Card data-tour="ia-clinica-form">
      <CardHeader>
        <CardTitle>Nueva sugerencia</CardTitle>
        <CardDescription>{CLINICAL_AI_DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent>
        {!configured && (
          <p className="mb-4 text-sm text-amber-800">
            Falta configurar <code>OPENAI_API_KEY</code> en el servidor. El historial se puede ver
            igual.
          </p>
        )}
        <form action={formAction} className="grid max-w-2xl gap-4">
          {consultationId && <input type="hidden" name="consultationId" value={consultationId} />}
          {clinicalEntryId && (
            <input type="hidden" name="clinicalEntryId" value={clinicalEntryId} />
          )}
          <PatientPicker
            defaultPatientId={defaultPatientId}
            defaultPatientName={defaultPatientName}
            defaultOwnerId={defaultOwnerId}
            defaultOwnerName={defaultOwnerName}
            error={state?.fieldErrors?.patientId?.[0]}
          />
          <div className="space-y-2">
            <Label htmlFor="kind">Tipo</Label>
            <Select id="kind" name="kind" defaultValue={defaultKind}>
              {CLINICAL_AI_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {CLINICAL_AI_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas para la IA (opcional)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              placeholder="Hallazgos extra, duda clínica, tono para el tutor..."
            />
          </div>
          {usage ? (
            <p className={isQuotaNearLimit(usage) ? 'text-sm text-amber-700' : 'text-sm text-muted-foreground'}>
              Uso del mes: {formatMeteredUsage(usage)}
            </p>
          ) : null}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending || !canGenerate || !configured} data-tour="ia-clinica-generate">
            {pending ? 'Generando...' : 'Generar sugerencia'}
          </Button>
        </form>
        {state?.success && state.data && (
          <div className="mt-6 rounded-lg border p-4">
            <p className="mb-3 text-sm font-medium">
              {CLINICAL_AI_KIND_LABELS[state.data.kind]}
            </p>
            <ClinicalAiResult kind={state.data.kind} output={state.data.output} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
