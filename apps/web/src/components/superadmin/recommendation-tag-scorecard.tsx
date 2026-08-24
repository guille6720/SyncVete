'use client';

import Link from 'next/link';
import { useState } from 'react';
import { exportSuperadminRecommendationTagScorecardCsv } from '@/actions/superadmin';
import type { RecommendationTagScorecard } from '@/lib/plan-recommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function fmtPct(value: number | null) {
  return value == null ? '—' : `${value}%`;
}

function fmtDays(value: number | null) {
  return value == null ? '—' : `${value}d`;
}

export function SuperadminRecommendationTagScorecard({
  scorecard,
}: {
  scorecard: RecommendationTagScorecard | null;
}) {
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);

  if (!scorecard) return null;

  const rows = [
    ...scorecard.tags.map((row) => ({
      key: row.tag ?? 'tag',
      label: row.tag ?? 'Sin tag',
      href: row.tag
        ? `/superadmin?tag=${encodeURIComponent(row.tag)}#etiquetas-comerciales`
        : undefined,
      row,
    })),
    ...(scorecard.untagged
      ? [
          {
            key: 'untagged',
            label: 'Sin etiqueta',
            href: undefined as string | undefined,
            row: scorecard.untagged,
          },
        ]
      : []),
  ];

  if (rows.length === 0) return null;

  async function downloadCsv() {
    setMessage(null);
    const result = await run(() => exportSuperadminRecommendationTagScorecardCsv());
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-tag-scorecard-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <Card id="scorecard-etiquetas">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Scorecard por etiqueta</CardTitle>
            <CardDescription>
              Conversión y pipeline por tag. Una clínica con varias etiquetas cuenta en cada una.
              No cambia planes.
              {scorecard.generatedAt
                ? ` · ${new Date(scorecard.generatedAt).toLocaleString('es-AR')}`
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
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Etiqueta</th>
              <th className="py-2 pr-3 font-medium">Abiertas</th>
              <th className="py-2 pr-3 font-medium">Contacto</th>
              <th className="py-2 pr-3 font-medium">31+ días</th>
              <th className="py-2 pr-3 font-medium">Win rate</th>
              <th className="py-2 pr-3 font-medium">Cierres</th>
              <th className="py-2 font-medium">Días abiertas</th>
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
                </td>
                <td className="py-2.5 pr-3">{row.openPipeline}</td>
                <td className="py-2.5 pr-3">
                  {row.contactedOpen}
                  <span className="text-muted-foreground"> · {fmtPct(row.contactRatePct)}</span>
                </td>
                <td className="py-2.5 pr-3">{row.aging31Plus}</td>
                <td className="py-2.5 pr-3">{fmtPct(row.winRatePct)}</td>
                <td className="py-2.5 pr-3">
                  {row.closedDecisions}
                  <span className="text-muted-foreground">
                    {` · G${row.outcomeWon} P${row.outcomeLost} N${row.outcomeNotAFit} D${row.outcomeDeferred}`}
                  </span>
                </td>
                <td className="py-2.5">{fmtDays(row.avgDaysOpen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
