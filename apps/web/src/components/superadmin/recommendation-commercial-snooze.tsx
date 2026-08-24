'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveOrganizationPlanRecommendationCommercialSnooze } from '@/actions/superadmin';
import type { RecommendationCommercialSnoozeRow } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export function SuperadminRecommendationCommercialSnoozeBoard({
  rows,
}: {
  rows: RecommendationCommercialSnoozeRow[];
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (rows.length === 0) return null;

  async function clearSnooze(organizationId: string) {
    setMessage(null);
    const form = new FormData();
    form.set('organizationId', organizationId);
    form.set('clear', '1');
    const result = await run(() => saveOrganizationPlanRecommendationCommercialSnooze(form));
    if (!result) return;
    if (!result.success) {
      setMessage(result.error ?? 'No se pudo quitar el snooze');
      return;
    }
    setMessage('Snooze comercial quitado');
    router.refresh();
  }

  return (
    <Card id="snooze-comercial">
      <CardHeader>
        <CardTitle>Snooze comercial activo</CardTitle>
        <CardDescription>
          Ítems aparcados fuera de prioridad y digest hasta la fecha. No cambia planes.
        </CardDescription>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.organizationId} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                  </div>
                  <p className="text-muted-foreground">
                    Hasta{' '}
                    {row.commercialSnoozeUntil
                      ? new Date(row.commercialSnoozeUntil).toLocaleString('es-AR')
                      : '—'}
                    {row.snoozedByEmail ? ` · por ${row.snoozedByEmail}` : ''}
                    {row.assignedEmail ? ` · ${row.assignedEmail}` : ' · sin responsable'}
                  </p>
                  {row.commercialSnoozeNote ? (
                    <p className="text-xs text-muted-foreground">{row.commercialSnoozeNote}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void clearSnooze(row.organizationId)}
                >
                  Despertar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
