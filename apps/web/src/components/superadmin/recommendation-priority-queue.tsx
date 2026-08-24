'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  exportSuperadminRecommendationPriorityQueueCsv,
  saveOrganizationPlanRecommendationCommercialSnooze,
} from '@/actions/superadmin';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type { RecommendationPriorityRow } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const SNOOZE_PRESETS = [3, 7, 14] as const;

export function SuperadminRecommendationPriorityQueue({
  rows,
  mineOnly = false,
  includeFrozen = false,
  includeSnoozed = false,
}: {
  rows: RecommendationPriorityRow[];
  mineOnly?: boolean;
  includeFrozen?: boolean;
  includeSnoozed?: boolean;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  function updateParams(next: {
    mineOnly?: boolean;
    includeFrozen?: boolean;
    includeSnoozed?: boolean;
  }) {
    const params = new URLSearchParams(window.location.search);
    const nextMine = next.mineOnly ?? mineOnly;
    const nextFrozen = next.includeFrozen ?? includeFrozen;
    const nextSnoozed = next.includeSnoozed ?? includeSnoozed;
    if (nextMine) params.set('priority', 'me');
    else params.delete('priority');
    if (nextFrozen) params.set('pfrozen', '1');
    else params.delete('pfrozen');
    if (nextSnoozed) params.set('psnooze', '1');
    else params.delete('psnooze');
    const query = params.toString();
    router.push(query ? `/superadmin?${query}#cola-prioridad` : '/superadmin#cola-prioridad');
  }

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    form.set('mineOnly', mineOnly ? 'true' : 'false');
    form.set('includeFrozen', includeFrozen ? 'true' : 'false');
    form.set('includeSnoozed', includeSnoozed ? 'true' : 'false');
    const result = await run(() => exportSuperadminRecommendationPriorityQueueCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-priority-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  async function snooze(organizationId: string, days: number) {
    setMessage(null);
    const form = new FormData();
    form.set('organizationId', organizationId);
    form.set('days', String(days));
    form.set('note', `Snooze comercial ${days}d desde cola de prioridad`);
    const result = await run(() => saveOrganizationPlanRecommendationCommercialSnooze(form));
    if (!result) return;
    if (!result.success) {
      setMessage(result.error ?? 'No se pudo snoozear');
      return;
    }
    setMessage(`Snooze ${days}d aplicado`);
    router.refresh();
  }

  return (
    <Card id="cola-prioridad">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Cola de prioridad</CardTitle>
            <CardDescription>
              Heurística por severidad, uso, antigüedad, contacto y follow-up. Snooze saca del
              digest/prioridad temporalmente. No cambia planes.
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
              variant={includeFrozen ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => updateParams({ includeFrozen: !includeFrozen })}
            >
              {includeFrozen ? 'Con frozen' : 'Sin frozen'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={includeSnoozed ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => updateParams({ includeSnoozed: !includeSnoozed })}
            >
              {includeSnoozed ? 'Con snooze' : 'Sin snooze'}
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
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ítems prioritarios en esta vista.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li key={row.organizationId} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                  <Badge>{row.priority}</Badge>
                  <Link
                    href={`/superadmin/organizaciones/${row.organizationId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {row.organizationName}
                  </Link>
                  {row.severity === 'critical' ? (
                    <Badge variant="destructive">critical</Badge>
                  ) : row.severity ? (
                    <Badge>{row.severity}</Badge>
                  ) : null}
                  {row.isFrozen ? <Badge>frozen</Badge> : null}
                  {row.commercialSnoozeUntil &&
                  new Date(row.commercialSnoozeUntil).getTime() > Date.now() ? (
                    <Badge>snooze</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {row.currentPlanKey ?? 'sin plan'}
                  {row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''}
                  {row.ageDays != null ? ` · ${row.ageDays}d` : ''}
                  {row.assignedEmail ? ` · ${row.assignedEmail}` : ' · sin responsable'}
                  {row.commercialOutcome
                    ? ` · ${COMMERCIAL_OUTCOME_LABELS[row.commercialOutcome]}`
                    : ''}
                </p>
                {row.priorityReasons.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.priorityReasons.map((reason) => (
                      <Badge key={reason}>{reason}</Badge>
                    ))}
                  </div>
                ) : null}
                {row.commercialNote ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {row.commercialNote}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  {SNOOZE_PRESETS.map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => void snooze(row.organizationId, days)}
                    >
                      Snooze {days}d
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
