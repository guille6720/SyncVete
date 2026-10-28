'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ClinicalHistoryExport } from '@/components/clinical/clinical-history-export';
import {
  CLINICAL_ENTRY_TYPES,
  CLINICAL_ENTRY_TYPE_LABELS,
  CLINICAL_ENTRY_TYPE_VARIANT,
  formatClinicalEntryDateTime,
  SPECIES_EMOJI,
  type ClinicalEntryListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface ClinicalEntriesListProps {
  data: PaginatedResult<ClinicalEntryListRow>;
  canWrite: boolean;
  initialSearch?: string;
  initialEntryType?: string;
  patientId?: string;
  patientName?: string;
  basePath?: string;
  /** Show explicit "Ver anteriores" for patient history pagination. */
  showLoadOlder?: boolean;
}

export function ClinicalEntriesList({
  data,
  canWrite,
  initialSearch = '',
  initialEntryType = '',
  patientId,
  patientName,
  basePath = '/historia-clinica',
  showLoadOlder = false,
}: ClinicalEntriesListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) params.set('search', debouncedSearch);
    else params.delete('search');
    params.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [debouncedSearch, pathname, router, searchParams]);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  const setEntryType = (entryType: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (entryType) params.set('type', entryType);
    else params.delete('type');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const newHref = patientId ? `${basePath}/nuevo?patientId=${patientId}` : `${basePath}/nuevo`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por paciente, diagnóstico, motivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={initialEntryType}
            onChange={(e) => setEntryType(e.target.value)}
            className="w-full sm:w-44"
          >
            <option value="">Todos los tipos</option>
            {CLINICAL_ENTRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {CLINICAL_ENTRY_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href={newHref}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva entrada
            </Link>
          </Button>
        )}
      </div>

      {patientName && (
        <p className="text-sm text-muted-foreground">
          Historia clínica de <span className="font-medium text-foreground">{patientName}</span>
        </p>
      )}

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            {initialSearch || initialEntryType
              ? 'No se encontraron entradas con esos filtros.'
              : patientId
                ? 'Este paciente todavía no tiene entradas clínicas.'
                : 'Todavía no hay entradas clínicas registradas.'}
          </p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href={newHref}>Registrar primera entrada</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div
            className={`space-y-2 transition-opacity ${isPending ? 'opacity-60' : ''}`}
            aria-busy={isPending || undefined}
          >
            {data.data.map((entry) => (
              <article key={entry.id} className="rounded-lg border p-4">
                <Link
                  href={`${basePath}/${entry.id}`}
                  className="block rounded-md transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {SPECIES_EMOJI[entry.patient_species]} {entry.patient_name}
                        </p>
                        <Badge variant={CLINICAL_ENTRY_TYPE_VARIANT[entry.entry_type]}>
                          {CLINICAL_ENTRY_TYPE_LABELS[entry.entry_type]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatClinicalEntryDateTime(entry.entry_date)}
                        {entry.recorded_by_name ? ` · ${entry.recorded_by_name}` : ''}
                      </p>
                      {(entry.title || entry.diagnosis) && (
                        <p className="mt-1 text-sm">{entry.title || entry.diagnosis}</p>
                      )}
                      {!patientId && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tutor: {entry.owner_full_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {entry.weight_kg != null && <p>{entry.weight_kg} kg</p>}
                      {entry.temperature_c != null && <p>{entry.temperature_c} °C</p>}
                    </div>
                  </div>
                </Link>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <Link
                    href={`${basePath}/${entry.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Ver entrada
                  </Link>
                  <ClinicalHistoryExport
                    patientId={entry.patient_id}
                    patientName={entry.patient_name}
                    entryDate={entry.entry_date}
                  />
                </div>
              </article>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} entrada{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
                {data.totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                {showLoadOlder && data.page < data.totalPages && (
                  <Button variant="outline" size="sm" onClick={() => goToPage(data.page + 1)}>
                    Ver anteriores
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
