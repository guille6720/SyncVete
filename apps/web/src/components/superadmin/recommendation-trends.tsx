'use client';

import { useState } from 'react';
import { exportSuperadminRecommendationTrendsCsv } from '@/actions/superadmin';
import type {
  RecommendationTrendWindow,
  RecommendationTrends,
} from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function fmtPct(value: number | null) {
  return value == null ? '—' : `${value}%`;
}

function delta(current: number, previous: number) {
  const diff = current - previous;
  if (diff === 0) return '0';
  return diff > 0 ? `+${diff}` : String(diff);
}

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

function WindowBlock({
  title,
  window,
  compare,
}: {
  title: string;
  window: RecommendationTrendWindow;
  compare?: RecommendationTrendWindow;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Contactos"
          value={String(window.contacted)}
          hint={compare ? `vs prev ${delta(window.contacted, compare.contacted)}` : undefined}
        />
        <Metric
          label="Asignaciones"
          value={String(window.assigned)}
          hint={compare ? `vs prev ${delta(window.assigned, compare.assigned)}` : undefined}
        />
        <Metric
          label="Win rate"
          value={fmtPct(window.winRatePct)}
          hint={`${window.outcomeWon} ganadas / ${window.closedDecisions} cerradas`}
        />
        <Metric
          label="Cierres"
          value={String(window.closedDecisions)}
          hint={`G${window.outcomeWon} · P${window.outcomeLost} · N${window.outcomeNotAFit} · D${window.outcomeDeferred}`}
        />
        <Metric label="Notas" value={String(window.noted)} />
        <Metric label="Tags +" value={String(window.tagged)} />
        <Metric label="Follow-ups" value={String(window.followUpSet)} />
        <Metric
          label="Freeze"
          value={`${window.frozen}/${window.unfrozen}`}
          hint="congeladas / descongeladas"
        />
      </div>
    </div>
  );
}

export function SuperadminRecommendationTrends({
  trends,
}: {
  trends: RecommendationTrends | null;
}) {
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!trends) return null;

  async function downloadCsv() {
    setMessage(null);
    const result = await run(() => exportSuperadminRecommendationTrendsCsv());
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-trends-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Tendencias exportadas');
  }

  return (
    <Card id="tendencias-comerciales">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Tendencias comerciales</CardTitle>
            <CardDescription>
              Flujo de actividad (7d vs 7d previos, y 30d). No cambia planes.
              {trends.generatedAt
                ? ` · ${new Date(trends.generatedAt).toLocaleString('es-AR')}`
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
      <CardContent className="space-y-6">
        <WindowBlock title="Últimos 7 días" window={trends.d7} compare={trends.d7Prev} />
        <WindowBlock title="Últimos 30 días" window={trends.d30} />
      </CardContent>
    </Card>
  );
}
