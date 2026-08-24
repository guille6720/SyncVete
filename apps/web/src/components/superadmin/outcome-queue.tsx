'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminOutcomesCsv } from '@/actions/superadmin';
import {
  COMMERCIAL_OUTCOME_LABELS,
  type CommercialRecommendationOutcome,
} from '@/lib/plan-recommendations/shared';
import type { RecommendationOutcomeRow } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function outcomeBadgeVariant(
  outcome: CommercialRecommendationOutcome
): 'success' | 'destructive' | 'warning' | 'default' {
  if (outcome === 'won') return 'success';
  if (outcome === 'lost' || outcome === 'not_a_fit') return 'destructive';
  if (outcome === 'deferred') return 'warning';
  return 'default';
}

export function SuperadminOutcomeQueue({
  rows,
  outcomeFilter = '',
}: {
  rows: RecommendationOutcomeRow[];
  outcomeFilter?: string;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (rows.length === 0 && !outcomeFilter) return null;

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    form.set('outcomeFilter', outcomeFilter);
    const result = await run(() => exportSuperadminOutcomesCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-outcomes-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} resultados exportados`);
  }

  function setFilter(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set('outcome', next);
    else params.delete('outcome');
    const qs = params.toString();
    router.push(qs ? `/superadmin?${qs}` : '/superadmin');
  }

  return (
    <Card id="resultados-comerciales">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Resultados comerciales</CardTitle>
            <CardDescription>
              Cierre CRM-lite de la recomendación. No cambia el plan (incluso “Ganada”).
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
        <div className="flex flex-wrap gap-2 pt-1">
          {(
            [
              ['', 'Todos'],
              ['won', 'Ganadas'],
              ['lost', 'Perdidas'],
              ['deferred', 'Diferidas'],
              ['not_a_fit', 'No encaja'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value || 'all'}
              type="button"
              size="sm"
              variant={outcomeFilter === value ? 'secondary' : 'ghost'}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No hay resultados con este filtro.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.organizationId}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
            >
              <div>
                <Link
                  href={`/superadmin/organizaciones/${row.organizationId}`}
                  className="font-medium hover:underline"
                >
                  {row.organizationName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.currentPlanKey ?? 'sin plan'}
                  {row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''}
                  {row.assignedEmail ? ` · ${row.assignedEmail}` : ''}
                  {row.commercialOutcomeNote
                    ? ` · ${row.commercialOutcomeNote.slice(0, 60)}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={outcomeBadgeVariant(row.commercialOutcome)}>
                  {COMMERCIAL_OUTCOME_LABELS[row.commercialOutcome]}
                </Badge>
                {row.commercialOutcomeAt ? (
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.commercialOutcomeAt).toLocaleString('es-AR')}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
