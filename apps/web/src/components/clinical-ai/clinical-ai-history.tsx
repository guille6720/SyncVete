import Link from 'next/link';
import { ClinicalAiResult } from '@/components/clinical-ai/clinical-ai-result';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CLINICAL_AI_KIND_LABELS,
  formatDashboardDateTime,
  parseClinicalAiOutput,
  type ClinicalAiKind,
  type PaginatedResult,
  type ClinicalAiSuggestionListRow,
} from '@sincvete/shared';

interface ClinicalAiHistoryProps {
  data: PaginatedResult<ClinicalAiSuggestionListRow>;
}

export function ClinicalAiHistory({ data }: ClinicalAiHistoryProps) {
  return (
    <Card data-tour="ia-clinica-review">
      <CardHeader>
        <CardTitle>Historial</CardTitle>
        <CardDescription>
          {data.total} sugerencia{data.total !== 1 ? 's' : ''} generada
          {data.total !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay sugerencias.</p>
        ) : (
          data.data.map((item) => {
            const output = parseClinicalAiOutput(item.kind, item.output);
            return (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{CLINICAL_AI_KIND_LABELS[item.kind]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDashboardDateTime(item.created_at)}
                    {item.created_by_name ? ` · ${item.created_by_name}` : ''}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Link href={`/pacientes/${item.patient_id}`} className="hover:underline">
                    {item.patient_name}
                  </Link>
                  {' · '}
                  {item.owner_full_name}
                </p>
                {output && (
                  <div className="mt-3">
                    <ClinicalAiResult kind={item.kind as ClinicalAiKind} output={output} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
