'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminOpenRecommendationPipelineCsv } from '@/actions/superadmin';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type {
  RecommendationOpenPipelineRow,
  RecommendationOpenPipelineSort,
} from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const SORTS: Array<{ key: RecommendationOpenPipelineSort; label: string }> = [
  { key: 'age_desc', label: 'Más viejas' },
  { key: 'age_asc', label: 'Más nuevas' },
  { key: 'severity', label: 'Severidad' },
  { key: 'follow_up', label: 'Follow-up' },
  { key: 'name', label: 'Nombre' },
];

export function SuperadminRecommendationOpenPipeline({
  rows,
  mineOnly = false,
  sort = 'age_desc',
}: {
  rows: RecommendationOpenPipelineRow[];
  mineOnly?: boolean;
  sort?: RecommendationOpenPipelineSort;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  function updateParams(next: { mineOnly?: boolean; sort?: RecommendationOpenPipelineSort }) {
    const params = new URLSearchParams(window.location.search);
    const nextMine = next.mineOnly ?? mineOnly;
    const nextSort = next.sort ?? sort;
    if (nextMine) params.set('pipeline', 'me');
    else params.delete('pipeline');
    if (nextSort && nextSort !== 'age_desc') params.set('psort', nextSort);
    else params.delete('psort');
    const query = params.toString();
    router.push(query ? `/superadmin?${query}#pipeline-abierto` : '/superadmin#pipeline-abierto');
  }

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    form.set('mineOnly', mineOnly ? 'true' : 'false');
    form.set('sort', sort);
    const result = await run(() => exportSuperadminOpenRecommendationPipelineCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-open-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <Card id="pipeline-abierto">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Pipeline abierto</CardTitle>
            <CardDescription>
              Todas las recomendaciones activas con meta comercial. No cambia planes.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? 'outline' : 'default'}
              disabled={pending}
              onClick={() => updateParams({ mineOnly: false })}
            >
              Equipo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => updateParams({ mineOnly: true })}
            >
              Mío
            </Button>
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
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {SORTS.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={sort === item.key ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => updateParams({ sort: item.key })}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay pipeline abierto en esta vista.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Clínica</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Edad</th>
                  <th className="py-2 pr-3 font-medium">Responsable</th>
                  <th className="py-2 pr-3 font-medium">Tags</th>
                  <th className="py-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.organizationId} className="border-b align-top last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/superadmin/organizaciones/${row.organizationId}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {row.organizationName}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.severity === 'critical' ? (
                          <Badge variant="destructive">critical</Badge>
                        ) : row.severity ? (
                          <Badge>{row.severity}</Badge>
                        ) : null}
                        {row.isFrozen ? <Badge>frozen</Badge> : null}
                        {row.commercialOutcome ? (
                          <Badge>{COMMERCIAL_OUTCOME_LABELS[row.commercialOutcome]}</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {row.currentPlanKey ?? '—'}
                      {row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.ageDays == null ? '—' : `${row.ageDays}d`}
                      {row.followUpAt ? (
                        <p className="text-xs text-muted-foreground">
                          FU {new Date(row.followUpAt).toLocaleDateString('es-AR')}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {row.assignedEmail ?? 'Sin asignar'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {row.commercialTags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          row.commercialTags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      <p className="line-clamp-2 max-w-xs">{row.commercialNote || '—'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
