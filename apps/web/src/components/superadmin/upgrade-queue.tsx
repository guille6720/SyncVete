'use client';

import Link from 'next/link';
import type { SuperadminOrgRecommendationRow } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SuperadminUpgradeQueue({
  rows,
  total,
}: {
  rows: SuperadminOrgRecommendationRow[];
  total: number;
}) {
  if (total === 0 && rows.length === 0) return null;

  return (
    <Card id="cola-upgrades">
      <CardHeader>
        <CardTitle>Cola de upgrades recomendados</CardTitle>
        <CardDescription>
          Solo avisos comerciales. El plan no cambia solo.{' '}
          <Link href="/superadmin?upgrade=upgrade_recommended" className="underline">
            Ver todos ({total})
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No hay upgrades recomendados persistidos.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
            >
              <div>
                <Link
                  href={`/superadmin/organizaciones/${row.id}`}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.planKey ?? 'sin plan'}
                  {row.recommendation.recommendedPlan
                    ? ` → ${row.recommendation.recommendedPlan}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="warning">
                  {Math.round(Math.min(row.recommendation.usageLevel, 1) * 100)}%
                </Badge>
                <Badge>{row.recommendation.severity}</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
