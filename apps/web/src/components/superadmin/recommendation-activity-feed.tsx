'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminRecommendationActivityCsv } from '@/actions/superadmin';
import type { RecommendationActivityEvent } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function eventLabel(eventType: string) {
  if (eventType === 'noted') return 'Nota';
  if (eventType === 'follow_up_set') return 'Seguimiento';
  if (eventType === 'follow_up_cleared') return 'Sin seguimiento';
  if (eventType === 'frozen') return 'Congelada';
  if (eventType === 'unfrozen') return 'Descongelada';
  if (eventType === 'assigned') return 'Asignada';
  if (eventType === 'unassigned') return 'Sin responsable';
  if (eventType === 'outcome_set') return 'Resultado';
  if (eventType === 'outcome_cleared') return 'Resultado quitado';
  if (eventType === 'contacted') return 'Contacto';
  if (eventType === 'accepted') return 'Plan aceptado';
  if (eventType === 'dismissed') return 'Dismiss';
  if (eventType === 'reopened') return 'Reabierta';
  if (eventType === 'cleared') return 'Limpiada';
  if (eventType === 'tagged') return 'Etiqueta';
  if (eventType === 'untagged') return 'Sin etiqueta';
  return eventType;
}

export function SuperadminRecommendationActivityFeed({
  events,
  mineOnly = false,
}: {
  events: RecommendationActivityEvent[];
  mineOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  async function downloadCsv() {
    setMessage(null);
    const form = new FormData();
    form.set('mineOnly', mineOnly ? 'true' : 'false');
    const result = await run(() => exportSuperadminRecommendationActivityCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  function setScope(nextMineOnly: boolean) {
    const params = new URLSearchParams(window.location.search);
    if (nextMineOnly) params.set('activity', 'me');
    else params.delete('activity');
    const query = params.toString();
    router.push(query ? `/superadmin?${query}#actividad-comercial` : '/superadmin#actividad-comercial');
  }

  return (
    <Card id="actividad-comercial">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Actividad comercial reciente</CardTitle>
            <CardDescription>
              Contactos, asignaciones, resultados y notas del equipo. No cambia planes.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? 'outline' : 'default'}
              disabled={pending}
              onClick={() => setScope(false)}
            >
              Equipo
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mineOnly ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => setScope(true)}
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
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay actividad comercial reciente.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{eventLabel(event.eventType)}</Badge>
                  <Link
                    href={`/superadmin/organizaciones/${event.organizationId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {event.organizationName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString('es-AR')}
                  </span>
                  {event.actorEmail ? (
                    <span className="text-xs text-muted-foreground">· {event.actorEmail}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">· {event.actorKind}</span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {event.currentPlanKey ?? '—'}
                  {event.recommendedPlanKey ? ` → ${event.recommendedPlanKey}` : ''}
                </p>
                {event.note ? <p className="mt-1 text-xs text-muted-foreground">{event.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
