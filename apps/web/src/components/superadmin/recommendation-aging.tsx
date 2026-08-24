'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminRecommendationAgingCsv } from '@/actions/superadmin';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type {
  RecommendationAging,
  RecommendationAgingBucket,
  RecommendationAgingRow,
} from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const BUCKETS: Array<{ key: RecommendationAgingBucket; label: string }> = [
  { key: '0-7', label: '0–7 días' },
  { key: '8-14', label: '8–14 días' },
  { key: '15-30', label: '15–30 días' },
  { key: '31-plus', label: '31+ días' },
  { key: 'unknown', label: 'Sin touch' },
];

function countFor(aging: RecommendationAging, bucket: RecommendationAgingBucket) {
  if (bucket === '0-7') return aging.bucket07;
  if (bucket === '8-14') return aging.bucket814;
  if (bucket === '15-30') return aging.bucket1530;
  if (bucket === '31-plus') return aging.bucket31Plus;
  return aging.bucketUnknown;
}

export function SuperadminRecommendationAging({
  aging,
  activeBucket = null,
  rows = [],
}: {
  aging: RecommendationAging | null;
  activeBucket?: RecommendationAgingBucket | null;
  rows?: RecommendationAgingRow[];
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!aging) return null;

  function selectBucket(bucket: RecommendationAgingBucket | null) {
    const params = new URLSearchParams(window.location.search);
    if (bucket) params.set('aging', bucket);
    else params.delete('aging');
    const query = params.toString();
    router.push(query ? `/superadmin?${query}#antiguedad-pipeline` : '/superadmin#antiguedad-pipeline');
  }

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    if (activeBucket) form.set('bucket', activeBucket);
    const result = await run(() => exportSuperadminRecommendationAgingCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-aging-${activeBucket ?? 'summary'}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <Card id="antiguedad-pipeline">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Antigüedad del pipeline</CardTitle>
            <CardDescription>
              Días desde el último touch comercial (contacto / refresh). No cambia planes.
              {aging.generatedAt
                ? ` · ${new Date(aging.generatedAt).toLocaleString('es-AR')}`
                : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeBucket ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => selectBucket(null)}>
                Limpiar filtro
              </Button>
            ) : null}
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
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground">Pipeline abierto</p>
            <p className="text-2xl font-semibold">{aging.openPipeline}</p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground">Edad promedio</p>
            <p className="text-2xl font-semibold">
              {aging.avgAgeDays == null ? '—' : `${aging.avgAgeDays}d`}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground">Edad mediana</p>
            <p className="text-2xl font-semibold">
              {aging.medianAgeDays == null ? '—' : `${aging.medianAgeDays}d`}
            </p>
          </div>
          <div className="rounded-lg border bg-card px-3 py-3">
            <p className="text-xs text-muted-foreground">31+ días</p>
            <p className="text-2xl font-semibold">{aging.bucket31Plus}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((bucket) => (
            <Button
              key={bucket.key}
              type="button"
              size="sm"
              variant={activeBucket === bucket.key ? 'default' : 'outline'}
              onClick={() => selectBucket(bucket.key)}
            >
              {bucket.label}
              <span className="ml-1 text-xs opacity-80">{countFor(aging, bucket.key)}</span>
            </Button>
          ))}
        </div>

        {activeBucket ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Clínicas en {BUCKETS.find((b) => b.key === activeBucket)?.label ?? activeBucket}
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin clínicas en este bucket.</p>
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
                      {row.assignedEmail ? ` · ${row.assignedEmail}` : ' · sin responsable'}
                      {row.commercialOutcome
                        ? ` · ${COMMERCIAL_OUTCOME_LABELS[row.commercialOutcome]}`
                        : ''}
                      {row.ageDays != null ? ` · ${row.ageDays}d` : ''}
                    </p>
                    {row.commercialTags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.commercialTags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {row.severity === 'critical' ? (
                    <Badge variant="destructive">critical</Badge>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
