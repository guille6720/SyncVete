'use client';

import type { PlanRecommendationHistoryEvent } from '@/lib/plan-recommendations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function eventLabel(eventType: string) {
  if (eventType === 'recommended') return 'Recomendación';
  if (eventType === 'reviewed') return 'Revisada';
  if (eventType === 'dismissed') return 'Dismiss Superadmin';
  if (eventType === 'accepted') return 'Aceptada (cambio de plan)';
  if (eventType === 'reopened') return 'Reabierta';
  if (eventType === 'clinic_dismissed') return 'Dismiss clínica';
  if (eventType === 'clinic_viewed') return 'Vista clínica';
  if (eventType === 'cleared') return 'Limpiada';
  if (eventType === 'noted') return 'Nota comercial';
  if (eventType === 'follow_up_set') return 'Seguimiento';
  if (eventType === 'follow_up_cleared') return 'Seguimiento quitado';
  if (eventType === 'frozen') return 'Congelada';
  if (eventType === 'unfrozen') return 'Descongelada';
  if (eventType === 'assigned') return 'Asignada';
  if (eventType === 'unassigned') return 'Sin responsable';
  if (eventType === 'outcome_set') return 'Resultado comercial';
  if (eventType === 'outcome_cleared') return 'Resultado quitado';
  if (eventType === 'contacted') return 'Contacto comercial';
  if (eventType === 'tagged') return 'Etiquetada';
  if (eventType === 'untagged') return 'Etiqueta quitada';
  return eventType;
}

export function SuperadminRecommendationHistory({
  events,
}: {
  events: PlanRecommendationHistoryEvent[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de recomendaciones</CardTitle>
        <CardDescription>
          Línea de tiempo comercial. No incluye datos clínicos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay eventos.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{eventLabel(event.eventType)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString('es-AR')}
                  </span>
                  <span className="text-xs text-muted-foreground">· {event.actorKind}</span>
                </div>
                <p className="mt-1">
                  {event.currentPlanKey ?? '—'}
                  {event.recommendedPlanKey ? ` → ${event.recommendedPlanKey}` : ''}
                </p>
                {event.reasons.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {event.reasons.slice(0, 4).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {event.note ? <p className="mt-1 text-xs text-muted-foreground">{event.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
