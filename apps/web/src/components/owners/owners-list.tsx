'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OwnerPortalListActions } from '@/components/owners/owner-portal-list-actions';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import type { Owner, PaginatedResult } from '@sincvete/shared';

interface OwnersListProps {
  data: PaginatedResult<Owner>;
  canWrite: boolean;
  initialSearch?: string;
}

export function OwnersList({ data, canWrite, initialSearch = '' }: OwnersListProps) {
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
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1" data-tour="tutores-search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono, DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canWrite && (
          <div data-tour="tutores-new">
            <Button asChild>
              <Link href="/tutores/nuevo">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo tutor
              </Link>
            </Button>
          </div>
        )}
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center" data-tour="tutores-list">
          <p className="text-muted-foreground">
            {initialSearch
              ? 'No se encontraron tutores con esa búsqueda.'
              : 'Todavía no hay tutores registrados.'}
          </p>
          {canWrite && !initialSearch && (
            <Button asChild className="mt-4">
              <Link href="/tutores/nuevo">Registrar primer tutor</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border" data-tour="tutores-list">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Nombre</th>
                  <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Contacto</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Documento</th>
                  <th className="px-4 py-3 text-left font-medium">App</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((owner) => (
                  <tr key={owner.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/tutores/${owner.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {owner.full_name}
                      </Link>
                      {owner.city && (
                        <p className="text-xs text-muted-foreground">{owner.city}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p>{owner.phone ?? '—'}</p>
                      {owner.email && (
                        <p className="text-xs text-muted-foreground">{owner.email}</p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {owner.document_number
                        ? `${owner.document_type} ${owner.document_number}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <OwnerPortalListActions
                        ownerId={owner.id}
                        ownerName={owner.full_name}
                        portalUserId={owner.portal_user_id}
                        portalPendingUserId={owner.portal_pending_user_id ?? null}
                        canWrite={canWrite}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={owner.is_active ? 'success' : 'destructive'}>
                        {owner.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} tutor{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
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
