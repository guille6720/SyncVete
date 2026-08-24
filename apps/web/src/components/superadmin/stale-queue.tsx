'use client';

import Link from 'next/link';
import type { RecommendationStaleRow } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SuperadminStaleQueue({ rows }: { rows: RecommendationStaleRow[] }) {
  if (rows.length === 0) return null;

  const staleDays = rows[0]?.staleDays ?? 14;

  return (
    <Card id="recomendaciones-stale">
      <CardHeader>
        <CardTitle>Recomendaciones sin movimiento</CardTitle>
        <CardDescription>
          Abiertas hace más de {staleDays} días sin refresh. No cambian el plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map((row) => (
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
              </p>
            </div>
            <Badge variant="warning">
              {row.lastTouchAt
                ? `Desde ${new Date(row.lastTouchAt).toLocaleDateString('es-AR')}`
                : 'Sin fecha'}
            </Badge>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          <Link href="/superadmin?upgrade=stale" className="underline">
            Ver en listado
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
