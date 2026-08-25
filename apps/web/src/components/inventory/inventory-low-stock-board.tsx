'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { withListReturn } from '@/lib/list-return';
import {
  INVENTORY_PRODUCT_CATEGORY_LABELS,
  INVENTORY_UNIT_LABELS,
  type InventoryProductListRow,
} from '@sincvete/shared';

interface InventoryLowStockBoardProps {
  items: InventoryProductListRow[];
  canWrite: boolean;
  listQuery?: string;
}

function formatQty(value: number): string {
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

export function InventoryLowStockBoard({
  items,
  canWrite,
  listQuery = '',
}: InventoryLowStockBoardProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Stock bajo</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} producto{items.length !== 1 ? 's' : ''} en o bajo el mínimo
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href={withListReturn('/inventario/nuevo', listQuery)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No hay productos con stock bajo.</p>
          {canWrite && (
            <Button asChild className="mt-4">
              <Link href={withListReturn('/inventario/nuevo', listQuery)}>Agregar producto</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((product) => (
            <Link
              key={product.id}
              href={withListReturn(`/inventario/${product.id}`, listQuery)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/20"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{product.name}</p>
                  <Badge variant="destructive">Stock bajo</Badge>
                  <Badge variant="default">
                    {INVENTORY_PRODUCT_CATEGORY_LABELS[product.category]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatQty(product.quantity)} / mín. {formatQty(product.min_quantity)}{' '}
                  {INVENTORY_UNIT_LABELS[product.unit]}
                  {product.sku ? ` · SKU ${product.sku}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
