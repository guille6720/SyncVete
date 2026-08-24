'use client';

import Link from 'next/link';
import { useState } from 'react';
import { exportSuperadminRecommendationAssigneeWorkloadCsv } from '@/actions/superadmin';
import type { RecommendationAssigneeWorkload } from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

export function SuperadminRecommendationAssigneeWorkload({
  workload,
}: {
  workload: RecommendationAssigneeWorkload | null;
}) {
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!workload) return null;

  const rows = [
    ...workload.assignees.map((row) => ({
      key: row.assigneeUserId ?? row.assigneeEmail ?? 'assignee',
      label: row.assigneeEmail ?? 'Sin email',
      href: row.assigneeUserId
        ? `/superadmin?assignee=${encodeURIComponent(row.assigneeUserId)}#seguimientos-comerciales`
        : undefined,
      row,
    })),
    ...(workload.unassigned
      ? [
          {
            key: 'unassigned',
            label: 'Sin responsable',
            href: '/superadmin?assignee=unassigned#seguimientos-comerciales',
            row: workload.unassigned,
          },
        ]
      : []),
  ];

  if (rows.length === 0) return null;

  async function downloadCsv() {
    setMessage(null);
    const result = await run(() => exportSuperadminRecommendationAssigneeWorkloadCsv());
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-assignee-workload-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <Card id="carga-responsables">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Carga por responsable</CardTitle>
            <CardDescription>
              Pipeline abierto activo y presión de prioridad (usa pesos configurados). No cambia
              planes.
              {workload.generatedAt
                ? ` · ${new Date(workload.generatedAt).toLocaleString('es-AR')}`
                : ''}
            </CardDescription>
          </div>
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
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Responsable</th>
              <th className="py-2 pr-3 font-medium">Activas</th>
              <th className="py-2 pr-3 font-medium">Critical</th>
              <th className="py-2 pr-3 font-medium">Vencidos</th>
              <th className="py-2 pr-3 font-medium">31+</th>
              <th className="py-2 pr-3 font-medium">Sin contacto</th>
              <th className="py-2 pr-3 font-medium">Σ prioridad</th>
              <th className="py-2 font-medium">Avg prioridad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, href, row }) => (
              <tr key={key} className="border-b last:border-0">
                <td className="py-2.5 pr-3 font-medium">
                  {href ? (
                    <Link href={href} className="underline-offset-2 hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  {row.frozenOpen > 0 ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      · {row.frozenOpen} frozen
                    </span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3">
                  {row.openActive}
                  <span className="text-muted-foreground"> / {row.openPipeline}</span>
                </td>
                <td className="py-2.5 pr-3">{row.criticalOpen}</td>
                <td className="py-2.5 pr-3">{row.overdueFollowUp}</td>
                <td className="py-2.5 pr-3">{row.aging31Plus}</td>
                <td className="py-2.5 pr-3">{row.neverContacted}</td>
                <td className="py-2.5 pr-3">{row.prioritySum}</td>
                <td className="py-2.5">{row.avgPriority ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
