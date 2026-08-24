'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  deleteSuperadminRecommendationSavedView,
  upsertSuperadminRecommendationSavedView,
} from '@/actions/superadmin';
import {
  commercialSavedViewHref,
  sanitizeCommercialSavedViewParams,
  type CommercialSavedViewParamKey,
  type RecommendationSavedView,
} from '@/lib/plan-recommendations/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const PARAM_LABELS: Record<CommercialSavedViewParamKey, string> = {
  assignee: 'Responsable',
  outcome: 'Outcome',
  digest: 'Digest',
  activity: 'Actividad',
  tag: 'Tag',
  aging: 'Aging',
  note: 'Nota',
  pipeline: 'Pipeline',
  psort: 'Orden pipeline',
  priority: 'Prioridad',
  pfrozen: 'Incl. frozen',
  psnooze: 'Incl. snooze',
  upgrade: 'Upgrade',
  recommended: 'Plan recomendado',
};

function summarizeParams(params: RecommendationSavedView['queryParams']): string {
  const parts = Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => {
      const label = PARAM_LABELS[key as CommercialSavedViewParamKey] ?? key;
      return `${label}=${value}`;
    });
  return parts.length > 0 ? parts.join(' · ') : '(sin filtros comerciales)';
}

export function SuperadminRecommendationSavedViews({
  views,
  currentParams,
}: {
  views: RecommendationSavedView[];
  currentParams: Partial<Record<CommercialSavedViewParamKey, string>>;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);

  const sanitizedCurrent = useMemo(
    () => sanitizeCommercialSavedViewParams(currentParams),
    [currentParams]
  );
  const currentSummary = summarizeParams(sanitizedCurrent);
  const hasFilters = Object.keys(sanitizedCurrent).length > 0;

  async function saveView() {
    setMessage(null);
    const formData = new FormData();
    formData.set('name', name);
    formData.set('isShared', isShared ? '1' : '0');
    formData.set('queryParams', JSON.stringify(sanitizedCurrent));
    const result = await run(() => upsertSuperadminRecommendationSavedView(formData));
    if (!result) return;
    if (!result.success) {
      setMessage(result.error ?? 'No se pudo guardar');
      return;
    }
    setName('');
    setIsShared(false);
    setMessage(`Vista «${result.data?.name ?? ''}» guardada`);
    router.refresh();
  }

  async function removeView(id: string) {
    setMessage(null);
    const formData = new FormData();
    formData.set('id', id);
    const result = await run(() => deleteSuperadminRecommendationSavedView(formData));
    if (!result) return;
    if (!result.success) {
      setMessage(result.error ?? 'No se pudo borrar');
      return;
    }
    setMessage('Vista eliminada');
    router.refresh();
  }

  return (
    <Card id="vistas-guardadas">
      <CardHeader>
        <CardTitle>Vistas comerciales guardadas</CardTitle>
        <CardDescription>
          Atajos a combinaciones de filtros (responsable, tag, aging, pipeline, etc.). No cambian
          planes.
        </CardDescription>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Filtros actuales</p>
          <p className="text-xs text-muted-foreground">{currentSummary}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label htmlFor="savedViewName">Nombre</Label>
              <Input
                id="savedViewName"
                value={name}
                maxLength={60}
                placeholder="Ej. Mis critical 31+"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
              />
              Compartir con otros Superadmin
            </label>
            <Button
              type="button"
              size="sm"
              disabled={pending || !name.trim() || !hasFilters}
              onClick={() => void saveView()}
            >
              Guardar vista
            </Button>
          </div>
          {!hasFilters ? (
            <p className="text-xs text-muted-foreground">
              Aplicá al menos un filtro comercial en la URL para poder guardar.
            </p>
          ) : null}
        </div>

        {views.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay vistas guardadas.</p>
        ) : (
          <ul className="space-y-2">
            {views.map((view) => (
              <li
                key={view.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={commercialSavedViewHref(view.queryParams)}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {view.name}
                    </Link>
                    {view.isShared ? (
                      <span className="text-xs text-muted-foreground">compartida</span>
                    ) : null}
                    {!view.isMine ? (
                      <span className="text-xs text-muted-foreground">
                        de {view.ownerEmail ?? 'otro admin'}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{summarizeParams(view.queryParams)}</p>
                </div>
                {view.isMine ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => void removeView(view.id)}
                  >
                    Borrar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
