'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { withListReturn } from '@/lib/list-return';
import {
  INVENTORY_PURCHASE_STATUSES,
  INVENTORY_PURCHASE_STATUS_LABELS,
  INVENTORY_PURCHASE_STATUS_VARIANT,
  type InventoryPurchaseListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface PurchasesListProps {
  data: PaginatedResult<InventoryPurchaseListRow>;
  initialSearch?: string;
  initialStatus?: string;
  branchName?: string | null;
}

function formatMoney(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string): string {
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('es-AR');
  } catch {
    return value;
  }
}

export function PurchasesList({
  data,
  initialSearch = '',
  initialStatus = '',
  branchName = null,
}: PurchasesListProps) {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Compras recientes</h2>
          <p className="text-sm text-muted-foreground">
            Recepciones que ingresaron stock
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Proveedor o factura…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={initialStatus}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Estado"
          >
            <option value="">Todos los estados</option>
            {INVENTORY_PURCHASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {INVENTORY_PURCHASE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay compras registradas.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {data.data.map((purchase) => (
            <Link
              key={purchase.id}
              href={withListReturn(`/compras/${purchase.id}`, searchParams)}
              className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{purchase.supplier_name}</p>
                  <Badge variant={INVENTORY_PURCHASE_STATUS_VARIANT[purchase.status]}>
                    {INVENTORY_PURCHASE_STATUS_LABELS[purchase.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(purchase.purchased_at)}
                  {purchase.invoice_number ? ` · ${purchase.invoice_number}` : ''}
                  {` · ${purchase.item_count} ítem${purchase.item_count === 1 ? '' : 's'}`}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium">{formatMoney(purchase.total_cost)}</p>
            </Link>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => goToPage(data.page - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => goToPage(data.page + 1)}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
