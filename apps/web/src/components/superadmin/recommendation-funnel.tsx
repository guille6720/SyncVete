'use client';

import { useState } from 'react';
import { exportSuperadminRecommendationFunnelCsv } from '@/actions/superadmin';
import type { RecommendationFunnel } from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint ? <p className="pt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function fmtPct(value: number | null) {
  return value == null ? '—' : `${value}%`;
}

function fmtDays(value: number | null) {
  return value == null ? '—' : `${value}d`;
}

export function SuperadminRecommendationFunnel({
  funnel,
}: {
  funnel: RecommendationFunnel | null;
}) {
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!funnel) return null;

  async function downloadCsv() {
    setMessage(null);
    const result = await run(() => exportSuperadminRecommendationFunnelCsv());
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-funnel-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Embudo exportado');
  }

  return (
    <Card id="embudo-comercial">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Embudo comercial</CardTitle>
            <CardDescription>
              Tasas y tiempos del pipeline de recomendaciones. No cambia planes.
              {funnel.generatedAt
                ? ` · ${new Date(funnel.generatedAt).toLocaleString('es-AR')}`
                : ''}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void downloadCsv()}
          >
            Exportar CSV
          </Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Pipeline abierto" value={String(funnel.openPipeline)} />
        <Metric
          label="Contactadas (abiertas)"
          value={String(funnel.contactedOpen)}
          hint={`Tasa ${fmtPct(funnel.contactRatePct)}`}
        />
        <Metric label="Con follow-up" value={String(funnel.withFollowUp)} />
        <Metric label="Con responsable" value={String(funnel.withAssignee)} />
        <Metric
          label="Win rate"
          value={fmtPct(funnel.winRatePct)}
          hint={`${funnel.outcomeWon} ganadas / ${funnel.closedDecisions} cerradas`}
        />
        <Metric
          label="Close rate"
          value={fmtPct(funnel.closeRatePct)}
          hint="Cierres / (abiertas + cierres)"
        />
        <Metric
          label="Días a 1.er contacto"
          value={fmtDays(funnel.avgDaysToFirstContact)}
        />
        <Metric label="Días a resultado" value={fmtDays(funnel.avgDaysToOutcome)} />
        <Metric label="Días abiertas (avg)" value={fmtDays(funnel.avgDaysOpen)} />
        <Metric label="Congeladas abiertas" value={String(funnel.frozenOpen)} />
        <Metric
          label="Cierres"
          value={String(funnel.closedDecisions)}
          hint={`G${funnel.outcomeWon} · P${funnel.outcomeLost} · N${funnel.outcomeNotAFit} · D${funnel.outcomeDeferred}`}
        />
        <Metric
          label="Planes aceptados (app)"
          value={String(funnel.acceptedPlanChanges)}
          hint="Cambio de plan explícito en Superadmin"
        />
      </CardContent>
    </Card>
  );
}
