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
  INVENTORY_PRODUCT_CATEGORIES,
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_UNIT_LABELS,
  type InventoryProductListRow,
  type PaginatedResult,
} from '@sincvete/shared';

interface InventoryListProps {
  data: PaginatedResult<InventoryProductListRow>;
  initialSearch?: string;
  initialCategory?: string;
  initialLowStock?: boolean;
  branchName?: string | null;
}

function formatQty(value: number): string {
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

export function InventoryList({
  data,
  initialSearch = '',
  initialCategory = '',
  initialLowStock = false,
  branchName = null,
}: InventoryListProps) {
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

  const setCategory = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) params.set('category', category);
    else params.delete('category');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const setLowStock = (enabled: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (enabled) params.set('lowStock', '1');
    else params.delete('lowStock');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Catálogo</h2>
        <p className="text-sm text-muted-foreground">
          {branchName
            ? `Productos de la sucursal ${branchName}`
            : 'Productos de la sucursal de tu sesión'}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU, fabricante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={initialCategory}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">Todas las categorías</option>
          {INVENTORY_PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {INVENTORY_PRODUCT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant={initialLowStock ? 'default' : 'outline'}
          onClick={() => setLowStock(!initialLowStock)}
        >
          Solo stock bajo
        </Button>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {initialSearch || initialCategory || initialLowStock
            ? 'No hay productos con esos filtros en esta sucursal.'
            : 'No hay productos en el inventario de esta sucursal.'}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((product) => (
              <Link
                key={product.id}
                href={withListReturn(`/inventario/${product.id}`, searchParams)}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{product.name}</p>
                  <Badge variant="default">
                    {INVENTORY_PRODUCT_CATEGORY_LABELS[product.category]}
                  </Badge>
                  {product.is_low_stock && <Badge variant="destructive">Stock bajo</Badge>}
                  {!product.is_active && <Badge variant="warning">Inactivo</Badge>}
                </div>
                <p className="mt-1 text-sm">
                  {formatQty(product.quantity)} {INVENTORY_UNIT_LABELS[product.unit]}
                  <span className="text-muted-foreground">
                    {' '}
                    · mín. {formatQty(product.min_quantity)}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {product.sku ? `SKU ${product.sku}` : 'Sin SKU'}
                  {product.manufacturer ? ` · ${product.manufacturer}` : ''}
                </p>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} producto{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
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
