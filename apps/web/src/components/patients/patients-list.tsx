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
import {
  PATIENT_SPECIES,
  SPECIES_EMOJI,
  type PaginatedResult,
  type PatientListRow,
} from '@sincvete/shared';

interface PatientsListProps {
  data: PaginatedResult<PatientListRow>;
  canWrite: boolean;
  initialSearch?: string;
  initialSpecies?: string;
}

export function PatientsList({
  data,
  canWrite,
  initialSearch = '',
  initialSpecies = '',
}: PatientsListProps) {
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
    if (debouncedSearch) {
      params.set('search', debouncedSearch);
    } else {
      params.delete('search');
    }
    params.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [debouncedSearch, pathname, router, searchParams]);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const setSpecies = (species: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (species) {
      params.set('species', species);
    } else {
      params.delete('species');
    }
    params.delete('page');
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, microchip, tutor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={initialSpecies}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="">Todas las especies</option>
            {PATIENT_SPECIES.map((species) => (
              <option key={species} value={species}>
                {SPECIES_EMOJI[species]} {species}
              </option>
            ))}
          </Select>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/pacientes/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo paciente
            </Link>
          </Button>
        )}
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            {initialSearch || initialSpecies
              ? 'No se encontraron pacientes con esos filtros.'
              : 'Todavía no hay pacientes registrados.'}
          </p>
          {canWrite && !initialSearch && !initialSpecies && (
            <Button asChild className="mt-4">
              <Link href="/pacientes/nuevo">Registrar primer paciente</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div
            className={`overflow-hidden rounded-lg border transition-opacity ${isPending ? 'opacity-60' : ''}`}
            aria-busy={isPending || undefined}
          >
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Paciente</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Tutor</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Especie / Raza</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((patient) => (
                  <tr key={patient.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pacientes/${patient.id}`}
                        className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
                      >
                        {patient.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={patient.photo_url}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base">
                            {SPECIES_EMOJI[patient.species]}
                          </span>
                        )}
                        <span>
                          {patient.name}
                          {patient.microchip && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              Chip: {patient.microchip}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Link
                        href={`/tutores/${patient.owner_id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {patient.owner_full_name}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <p>{patient.species}</p>
                      {patient.breed && (
                        <p className="text-xs text-muted-foreground">{patient.breed}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {patient.is_deceased ? (
                        <Badge variant="destructive">Fallecido</Badge>
                      ) : (
                        <Badge variant={patient.is_active ? 'success' : 'destructive'}>
                          {patient.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} paciente{data.total !== 1 ? 's' : ''}
                {data.totalPages > 1
                  ? ` · Página ${data.page} de ${data.totalPages}`
                  : ` · ${data.pageSize} por página`}
              </p>
              {data.totalPages > 1 && (
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
              )}
            </div>
        </>
      )}
    </div>
  );
}
