'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import {
  SPECIES_EMOJI,
  formatVaccinationDate,
  type PaginatedResult,
  type VaccinationListRow,
} from '@sincvete/shared';

interface VaccinationsHistoryProps {
  data: PaginatedResult<VaccinationListRow>;
  initialSearch?: string;
}

export function VaccinationsHistory({ data, initialSearch = '' }: VaccinationsHistoryProps) {
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

  return (
    <div className="space-y-4" data-tour="vacunacion-list">
      <div>
        <h2 className="text-lg font-semibold">Historial</h2>
        <p className="text-sm text-muted-foreground">Vacunas aplicadas en la clínica</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por paciente, vacuna, lote..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No hay vacunaciones en el historial.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((vaccination) => (
              <Link
                key={vaccination.id}
                href={`/vacunacion/${vaccination.id}`}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <p className="font-medium">
                  {SPECIES_EMOJI[vaccination.patient_species]} {vaccination.patient_name}
                  {' · '}
                  {vaccination.vaccine_name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatVaccinationDate(vaccination.administered_at)}
                  {vaccination.lot_number ? ` · Lote ${vaccination.lot_number}` : ''}
                  {vaccination.next_due_at
                    ? ` · Refuerzo ${formatVaccinationDate(vaccination.next_due_at)}`
                    : ''}
                </p>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} vacuna{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
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
