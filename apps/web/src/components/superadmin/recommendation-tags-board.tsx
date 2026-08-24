'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type {
  RecommendationTagCatalogItem,
  RecommendationTaggedOrg,
} from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SuperadminRecommendationTagsBoard({
  catalog,
  activeTag = null,
  rows = [],
}: {
  catalog: RecommendationTagCatalogItem[];
  activeTag?: string | null;
  rows?: RecommendationTaggedOrg[];
}) {
  const router = useRouter();

  if (catalog.length === 0 && !activeTag) return null;

  function selectTag(tag: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (tag) params.set('tag', tag);
    else params.delete('tag');
    const query = params.toString();
    router.push(query ? `/superadmin?${query}#etiquetas-comerciales` : '/superadmin#etiquetas-comerciales');
  }

  return (
    <Card id="etiquetas-comerciales">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Etiquetas comerciales</CardTitle>
            <CardDescription>
              Segmentación interna del pipeline. No cambia planes.
            </CardDescription>
          </div>
          {activeTag ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => selectTag(null)}>
              Limpiar filtro
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {catalog.map((item) => (
            <Button
              key={item.tag}
              type="button"
              size="sm"
              variant={activeTag === item.tag ? 'default' : 'outline'}
              onClick={() => selectTag(item.tag)}
            >
              {item.tag}
              <span className="ml-1 text-xs opacity-80">{item.orgCount}</span>
            </Button>
          ))}
        </div>

        {activeTag ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Clínicas con “{activeTag}”</p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin clínicas con esta etiqueta.</p>
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
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.commercialTags.map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
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
