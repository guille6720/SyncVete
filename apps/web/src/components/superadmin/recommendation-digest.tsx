'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminRecommendationDigestCsv } from '@/actions/superadmin';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type {
  RecommendationDigest,
  RecommendationDigestItem,
} from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function DigestSection({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: RecommendationDigestItem[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        items.map((item) => (
          <div
            key={`${item.kind}-${item.organizationId}`}
            className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
          >
            <div>
              <Link
                href={`/superadmin/organizaciones/${item.organizationId}`}
                className="font-medium hover:underline"
              >
                {item.organizationName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {item.currentPlanKey ?? 'sin plan'}
                {item.recommendedPlanKey ? ` → ${item.recommendedPlanKey}` : ''}
                {item.assignedEmail ? ` · ${item.assignedEmail}` : ' · sin responsable'}
                {item.commercialOutcome
                  ? ` · ${COMMERCIAL_OUTCOME_LABELS[item.commercialOutcome]}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {item.severity === 'critical' ? <Badge variant="destructive">critical</Badge> : null}
              {item.sortAt ? (
                <span className="text-xs text-muted-foreground">
                  {new Date(item.sortAt).toLocaleString('es-AR')}
                </span>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function SuperadminRecommendationDigest({
  digest,
  mineOnly = false,
}: {
  digest: RecommendationDigest | null;
  mineOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!digest) return null;

  const total =
    digest.counts.overdueFollowUps +
    digest.counts.dueToday +
    digest.counts.staleUnassigned +
    digest.counts.criticalUnassigned +
    digest.counts.recentOutcomes +
    digest.counts.neverContacted;

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    form.set('mineOnly', mineOnly ? 'true' : 'false');
    const result = await run(() => exportSuperadminRecommendationDigestCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-digest-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  function setMine(next: boolean) {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set('digest', 'me');
    else params.delete('digest');
    const qs = params.toString();
    router.push(qs ? `/superadmin?${qs}` : '/superadmin');
  }

  return (
    <Card id="digest-comercial">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Digest comercial de hoy</CardTitle>
            <CardDescription>
              Seguimientos vencidos / de hoy, stale, críticos y cierres recientes. No cambia planes.
              {digest.generatedAt
                ? ` · ${new Date(digest.generatedAt).toLocaleString('es-AR')}`
                : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!mineOnly ? 'secondary' : 'ghost'}
              onClick={() => setMine(false)}
            >
              Equipo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? 'secondary' : 'ghost'}
              onClick={() => setMine(true)}
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
        <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
          <span>Vencidos {digest.counts.overdueFollowUps}</span>
          <span>Hoy {digest.counts.dueToday}</span>
          <span>
            {mineOnly ? 'Stale míos' : 'Stale sin dueño'} {digest.counts.staleUnassigned}
          </span>
          <span>
            {mineOnly ? 'Críticos míos' : 'Críticos sin dueño'}{' '}
            {digest.counts.criticalUnassigned}
          </span>
          <span>Cierres 7d {digest.counts.recentOutcomes}</span>
          <span>Sin contacto {digest.counts.neverContacted}</span>
          <span>Total {total}</span>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <DigestSection
          title="Follow-ups vencidos"
          empty="Nada vencido."
          items={digest.overdueFollowUps}
        />
        <DigestSection title="Follow-ups de hoy" empty="Nada para hoy." items={digest.dueToday} />
        <DigestSection
          title={mineOnly ? 'Stale asignados a vos' : 'Stale sin responsable'}
          empty="Sin stale en esta vista."
          items={digest.staleUnassigned}
        />
        <DigestSection
          title={mineOnly ? 'Críticos asignados a vos' : 'Críticos sin responsable'}
          empty="Sin críticos en esta vista."
          items={digest.criticalUnassigned}
        />
        <div className="md:col-span-2">
          <DigestSection
            title="Sin contacto registrado"
            empty="Todas las abiertas ya tienen al menos un contacto."
            items={digest.neverContacted}
          />
        </div>
        <div className="md:col-span-2">
          <DigestSection
            title="Resultados de los últimos 7 días"
            empty="Sin cierres recientes."
            items={digest.recentOutcomes}
          />
        </div>
      </CardContent>
    </Card>
  );
}
