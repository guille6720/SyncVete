'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  SPECIES_EMOJI,
  SURGERY_STATUSES,
  SURGERY_STATUS_LABELS,
  SURGERY_STATUS_VARIANT,
  formatClinicalEntryDateTime,
  type PaginatedResult,
  type SurgeryListRow,
} from '@sincvete/shared';

interface SurgeriesHistoryProps {
  data: PaginatedResult<SurgeryListRow>;
  initialSearch?: string;
  initialStatus?: string;
}

export function SurgeriesHistory({
  data,
  initialSearch = '',
  initialStatus = '',
}: SurgeriesHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search);
  const [, startTransition] = useTransition();

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

  const setStatus = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status);
    else params.delete('status');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="text-sm text-muted-foreground">Cirugías de la clínica</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1" data-tour="cirugias-search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por paciente, procedimiento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={initialStatus}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">Todos los estados</option>
          {SURGERY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SURGERY_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay cirugías en el historial.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((surgery) => (
              <Link
                key={surgery.id}
                href={`/cirugias/${surgery.id}`}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {SPECIES_EMOJI[surgery.patient_species]} {surgery.patient_name}
                  </p>
                  <Badge variant={SURGERY_STATUS_VARIANT[surgery.status]}>
                    {SURGERY_STATUS_LABELS[surgery.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{surgery.procedure_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatClinicalEntryDateTime(surgery.scheduled_at)}
                  {surgery.surgeon_name ? ` · ${surgery.surgeon_name}` : ''}
                </p>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} cirugía{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
                {data.totalPages}
              </p>
              <div className="flex gap-2">
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
