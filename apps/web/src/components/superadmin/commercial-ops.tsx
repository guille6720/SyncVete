'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  refreshSuperadminPlanRecommendations,
  runSuperadminCommercialLifecycle,
  type SuperadminCommercialSummary,
} from '@/actions/superadmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export function SuperadminCommercialOps({ summary }: { summary: SuperadminCommercialSummary }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, run] = usePendingAction();

  async function runLifecycle() {
    setMessage(null);
    const result = await run(() => runSuperadminCommercialLifecycle());
    if (!result) return;
    if (result.success && result.data) {
      const rec =
        result.data.recommendationsScanned != null
          ? ` Recomendaciones: ${result.data.recommendationsScanned} clínicas, ${result.data.recommendationsActive ?? 0} activas, ${result.data.recommendationsCleared ?? 0} limpiadas.`
          : '';
      setMessage(
        `Ciclo comercial: ${result.data.expired} vencidas, ${result.data.notices} avisos.${rec} Sin cambio automático de plan.`
      );
      router.refresh();
      return;
    }
    setMessage(result.error ?? 'No se pudo ejecutar el ciclo');
  }

  async function runRecommendationRefresh() {
    setMessage(null);
    const result = await run(() => refreshSuperadminPlanRecommendations());
    if (!result) return;
    if (result.success && result.data) {
      setMessage(
        `Recomendaciones: ${result.data.scanned} clínicas, ${result.data.recommended} activas, ${result.data.cleared} limpiadas. Sin cambio automático de plan.`
      );
      router.refresh();
      return;
    }
    setMessage(result.error ?? 'No se pudieron actualizar las recomendaciones');
  }

  const cards: Array<{ label: string; value: number; href?: string }> = [
    { label: 'Clínicas', value: summary.organizations },
    { label: 'Trial', value: summary.trialing },
    { label: 'Activas', value: summary.active },
    { label: 'Pago pendiente', value: summary.pastDue },
    { label: 'Vencidas', value: summary.expired },
    { label: 'Canceladas', value: summary.cancelled },
    { label: 'Planes por vencer', value: summary.plansEndingSoon, href: '#planes-por-vencer' },
    { label: 'Extras activos', value: summary.addonsActive },
    { label: 'Extras por vencer', value: summary.addonsEndingSoon, href: '#extras-por-vencer' },
    { label: 'Sobre cupos', value: summary.orgsOverSeats, href: '#sobre-cupos' },
    { label: 'Webhooks pendientes', value: summary.billingEventsPending, href: '#webhooks-pendientes' },
    { label: 'Pagos en curso', value: summary.checkoutIntentsOpen, href: '#pagos-en-curso' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {card.href && card.value > 0 ? (
                <a href={card.href} className="text-2xl font-semibold hover:underline">
                  {card.value}
                </a>
              ) : (
                <p className="text-2xl font-semibold">{card.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void runLifecycle()}>
          Vencer planes/extras y enviar avisos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void runRecommendationRefresh()}
        >
          Actualizar recomendaciones
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
