'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applySoapSuggestion, generateClinicalAi } from '@/actions/clinical-ai';
import { ClinicalAiResult } from '@/components/clinical-ai/clinical-ai-result';
import { Button } from '@/components/ui/button';
import {
  CLINICAL_AI_DISCLAIMER,
  type ClinicalAiSoapAssist,
} from '@sincvete/shared';

interface ClinicalAiSoapPanelProps {
  consultationId: string;
  patientId: string;
  configured: boolean;
}

export function ClinicalAiSoapPanel({
  consultationId,
  patientId,
  configured,
}: ClinicalAiSoapPanelProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(generateClinicalAi, null);
  const [, startTransition] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const soap =
    state?.success && state.data?.kind === 'soap_assist'
      ? (state.data.output as ClinicalAiSoapAssist)
      : null;

  const handleApply = () => {
    if (!soap) return;
    setApplying(true);
    setApplyError(null);
    startTransition(async () => {
      const result = await applySoapSuggestion({
        consultationId,
        diagnosis: soap.diagnosis,
        treatment: soap.treatment,
        plan: soap.plan,
      });
      setApplying(false);
      if (!result.success) {
        setApplyError(result.error ?? 'No se pudo aplicar');
        return;
      }
      router.refresh();
    });
  };

  return (
    <details className="sv-neon rounded-lg bg-card open:pb-3">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span>Asistente SOAP</span>
          <span className="text-xs font-normal text-muted-foreground">Abrir / cerrar</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 pt-3">
        <p className="text-xs text-muted-foreground">{CLINICAL_AI_DISCLAIMER}</p>
        {!configured && (
          <p className="text-sm text-amber-800">
            Configurá <code>OPENAI_API_KEY</code> para generar sugerencias.
          </p>
        )}
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="kind" value="soap_assist" />
          <input type="hidden" name="consultationId" value={consultationId} />
          <Button type="submit" disabled={pending || !configured} size="sm">
            {pending ? 'Generando...' : 'Sugerir diagnóstico y plan'}
          </Button>
        </form>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {soap && state?.data && (
          <div className="space-y-3 rounded-lg border p-3">
            <ClinicalAiResult kind="soap_assist" output={soap} />
            <Button size="sm" onClick={handleApply} disabled={applying}>
              {applying ? 'Aplicando...' : 'Aplicar a la consulta'}
            </Button>
            {applyError && <p className="text-sm text-destructive">{applyError}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
