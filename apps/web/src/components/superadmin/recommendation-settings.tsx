'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveSuperadminRecommendationSettings,
  type SuperadminCommercialSummary,
} from '@/actions/superadmin';
import {
  DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS,
  type RecommendationPriorityWeights,
  type RecommendationSettings,
} from '@/lib/plan-recommendations/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const WEIGHT_FIELDS: Array<{ key: keyof RecommendationPriorityWeights; label: string }> = [
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
  { key: 'usage100', label: 'Uso ≥100%' },
  { key: 'usage90', label: 'Uso ≥90%' },
  { key: 'usage80', label: 'Uso ≥80%' },
  { key: 'age31', label: 'Edad 31+' },
  { key: 'age15', label: 'Edad 15–30' },
  { key: 'age8', label: 'Edad 8–14' },
  { key: 'neverContacted', label: 'Sin contacto' },
  { key: 'overdueFollowUp', label: 'Follow-up vencido' },
  { key: 'unassigned', label: 'Sin responsable' },
  { key: 'frozenPenalty', label: 'Penalidad frozen' },
];

export function SuperadminRecommendationSettingsCard({
  settings,
}: {
  settings: RecommendationSettings | null;
  summary?: SuperadminCommercialSummary;
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState(String(settings?.thresholdInfo ?? 0.7));
  const [warning, setWarning] = useState(String(settings?.thresholdWarning ?? 0.85));
  const [critical, setCritical] = useState(String(settings?.thresholdCritical ?? 1));
  const [snoozeDays, setSnoozeDays] = useState(String(settings?.clinicSnoozeDays ?? 14));
  const [staleDays, setStaleDays] = useState(String(settings?.staleDays ?? 14));
  const [weights, setWeights] = useState<RecommendationPriorityWeights>(
    settings?.priorityWeights ?? DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS
  );

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Umbrales de recomendación</CardTitle>
          <CardDescription>
            Aplicá phase 36+ en Supabase para editar umbrales, snooze, stale y pesos de prioridad.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="umbrales-recomendacion">
      <CardHeader>
        <CardTitle>Umbrales de recomendación</CardTitle>
        <CardDescription>
          Valores centralizados del motor y de la cola de prioridad. No cambian planes
          automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="thInfo">Info (ej. 0.70)</Label>
            <Input id="thInfo" value={info} onChange={(e) => setInfo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="thWarn">Warning (ej. 0.85)</Label>
            <Input id="thWarn" value={warning} onChange={(e) => setWarning(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="thCrit">Critical (ej. 1.00)</Label>
            <Input id="thCrit" value={critical} onChange={(e) => setCritical(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="snooze">Snooze clínica (días)</Label>
            <Input
              id="snooze"
              type="number"
              min={1}
              max={90}
              value={snoozeDays}
              onChange={(e) => setSnoozeDays(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stale">Stale (días)</Label>
            <Input
              id="stale"
              type="number"
              min={1}
              max={180}
              value={staleDays}
              onChange={(e) => setStaleDays(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Pesos de prioridad (0–200)</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WEIGHT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`pw_${field.key}`}>{field.label}</Label>
                <Input
                  id={`pw_${field.key}`}
                  type="number"
                  min={0}
                  max={200}
                  value={String(weights[field.key])}
                  onChange={(event) =>
                    setWeights((prev) => ({
                      ...prev,
                      [field.key]: Number(event.target.value),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              const form = new FormData();
              form.set('thresholdInfo', info);
              form.set('thresholdWarning', warning);
              form.set('thresholdCritical', critical);
              form.set('clinicSnoozeDays', snoozeDays);
              form.set('staleDays', staleDays);
              for (const field of WEIGHT_FIELDS) {
                form.set(`pw_${field.key}`, String(weights[field.key]));
              }
              void run(async () => {
                const result = await saveSuperadminRecommendationSettings(form);
                setMessage(
                  result.success ? 'Umbrales guardados' : result.error ?? 'No se pudo guardar'
                );
                if (result.success) router.refresh();
                return result;
              });
            }}
          >
            Guardar umbrales
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setWeights(DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS)}
          >
            Reset pesos
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
