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
import { withListReturn } from '@/lib/list-return';
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_VARIANT,
  SPECIES_EMOJI,
  formatClinicalEntryDateTime,
  formatMoney,
  type InvoiceListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface InvoicesHistoryProps {
  data: PaginatedResult<InvoiceListRow>;
  initialSearch?: string;
  initialStatus?: string;
  branchName?: string | null;
}

export function InvoicesHistory({
  data,
  initialSearch = '',
  initialStatus = '',
  branchName = null,
}: InvoicesHistoryProps) {
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
        <p className="text-sm text-muted-foreground">
          {branchName
            ? `Facturas de la sucursal ${branchName}`
            : 'Facturas de la sucursal de tu sesión'}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, propietario, paciente..."
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
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {INVOICE_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {initialSearch || initialStatus
            ? 'No hay facturas con esos filtros en esta sucursal.'
            : 'No hay facturas en el historial de esta sucursal.'}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((invoice) => (
              <Link
                key={invoice.id}
                href={withListReturn(`/facturacion/${invoice.id}`, searchParams)}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{invoice.number ?? 'Borrador'}</p>
                  <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">
                  {invoice.owner_full_name}
                  {invoice.patient_name
                    ? ` · ${invoice.patient_species ? SPECIES_EMOJI[invoice.patient_species] : ''} ${invoice.patient_name}`
                    : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatClinicalEntryDateTime(invoice.issued_at ?? invoice.created_at)}
                  {' · '}
                  {formatMoney(invoice.total, invoice.currency)}
                  {invoice.status === 'emitida'
                    ? ` · saldo ${formatMoney(invoice.balance, invoice.currency)}`
                    : ''}
                </p>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} factura{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
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
