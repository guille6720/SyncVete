'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { exportSuperadminRecommendationNoteSearchCsv } from '@/actions/superadmin';
import { COMMERCIAL_OUTCOME_LABELS } from '@/lib/plan-recommendations/shared';
import type { RecommendationNoteSearchHit } from '@/lib/plan-recommendations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

function matchLabel(value: string) {
  if (value === 'commercial_note') return 'nota';
  if (value === 'outcome_note') return 'resultado';
  if (value === 'contact_note') return 'contacto';
  if (value === 'frozen_note') return 'freeze';
  return value;
}

function snippetFor(row: RecommendationNoteSearchHit) {
  if (row.matchedIn.includes('commercial_note') && row.commercialNote) return row.commercialNote;
  if (row.matchedIn.includes('outcome_note') && row.commercialOutcomeNote) {
    return row.commercialOutcomeNote;
  }
  if (row.matchedIn.includes('contact_note') && row.lastContactNote) return row.lastContactNote;
  if (row.matchedIn.includes('frozen_note') && row.frozenNote) return row.frozenNote;
  return row.commercialNote ?? row.commercialOutcomeNote ?? row.lastContactNote ?? row.frozenNote;
}

export function SuperadminRecommendationNoteSearch({
  query = '',
  rows = [],
}: {
  query?: string;
  rows?: RecommendationNoteSearchHit[];
}) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState(query);

  function submitSearch(nextQuery: string) {
    const trimmed = nextQuery.trim();
    const params = new URLSearchParams(window.location.search);
    if (trimmed) params.set('note', trimmed);
    else params.delete('note');
    const qs = params.toString();
    router.push(qs ? `/superadmin?${qs}#buscar-notas` : '/superadmin#buscar-notas');
  }

  async function downloadCsv() {
    if (query.trim().length < 2) {
      setMessage('Escribí al menos 2 caracteres');
      return;
    }
    setMessage(null);
    const form = new FormData();
    form.set('query', query);
    const result = await run(() => exportSuperadminRecommendationNoteSearchCsv(form));
    if (!result) return;
    if (!result.success || !result.data?.csv) {
      setMessage(result.error ?? 'No se pudo exportar');
      return;
    }
    const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `syncvete-note-search-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${result.data.rowCount} filas exportadas`);
  }

  return (
    <Card id="buscar-notas">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Buscar notas comerciales</CardTitle>
            <CardDescription>
              Busca en nota, resultado, contacto y freeze. No cambia planes.
            </CardDescription>
          </div>
          {query.trim().length >= 2 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void downloadCsv()}
            >
              Exportar CSV
            </Button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(draft);
          }}
        >
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label htmlFor="noteSearch">Texto</Label>
            <Input
              id="noteSearch"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ej. demo, cobro, whatsapp"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Buscar
          </Button>
          {query ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraft('');
                submitSearch('');
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </form>

        {query.trim().length > 0 && query.trim().length < 2 ? (
          <p className="text-sm text-muted-foreground">Escribí al menos 2 caracteres.</p>
        ) : null}

        {query.trim().length >= 2 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Resultados para “{query.trim()}” ({rows.length})
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin coincidencias.</p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.organizationId}
                  className="space-y-1 border-b py-2 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/superadmin/organizaciones/${row.organizationId}`}
                      className="font-medium hover:underline"
                    >
                      {row.organizationName}
                    </Link>
                    {row.matchedIn.map((match) => (
                      <Badge key={match}>{matchLabel(match)}</Badge>
                    ))}
                    {row.severity === 'critical' ? (
                      <Badge variant="destructive">critical</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.currentPlanKey ?? 'sin plan'}
                    {row.recommendedPlanKey ? ` → ${row.recommendedPlanKey}` : ''}
                    {row.assignedEmail ? ` · ${row.assignedEmail}` : ' · sin responsable'}
                    {row.commercialOutcome
                      ? ` · ${COMMERCIAL_OUTCOME_LABELS[row.commercialOutcome]}`
                      : ''}
                  </p>
                  {snippetFor(row) ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">{snippetFor(row)}</p>
                  ) : null}
                  {row.commercialTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.commercialTags.map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
