import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Plus, Upload } from 'lucide-react';
import {
  canManageInventory,
  canReadInventory,
  listInventoryProducts,
  listLowStock,
} from '@/actions/inventory';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InventoryLowStockBoard } from '@/components/inventory/inventory-low-stock-board';
import { InventoryList } from '@/components/inventory/inventory-list';
import { Button } from '@/components/ui/button';
import { canPermissionAndFeature } from '@/lib/permissions';
import { buildListQuery } from '@/lib/list-return';
import {
  FEATURES,
  INVENTORY_PRODUCT_CATEGORIES,
  type InventoryProductCategory,
} from '@sincvete/shared';

interface InventarioPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    category?: string;
    lowStock?: string;
  }>;
}

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  const canRead = await canReadInventory();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const categoryParam = params.category?.trim() ?? '';
  const category = INVENTORY_PRODUCT_CATEGORIES.includes(categoryParam as InventoryProductCategory)
    ? (categoryParam as InventoryProductCategory)
    : undefined;
  const lowStock = params.lowStock === '1' || params.lowStock === 'true';

  const [lowStockItems, catalog, canWrite, canImport, session, branches] = await Promise.all([
    listLowStock(),
    listInventoryProducts({
      page,
      pageSize: 25,
      search: search || undefined,
      category,
      lowStock: lowStock || undefined,
    }),
    canManageInventory(),
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    getSessionContext(),
    getUserBranches(),
  ]);

  const branchName =
    branches.find((branch) => branch.id === session?.branchId)?.name ?? null;
  const listQuery = buildListQuery({
    page: page > 1 ? String(page) : undefined,
    search: search || undefined,
    category: category || undefined,
    lowStock: lowStock ? '1' : undefined,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground">
            Stock, mínimos y movimientos de productos
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(canImport || canWrite) && (
            <Button variant="outline" asChild>
              <Link href="/inventario/importar">
                <Upload className="mr-2 h-4 w-4" />
                Importar
              </Link>
            </Button>
          )}
          {canWrite && (
            <Button asChild>
              <Link href="/inventario/nuevo">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Link>
            </Button>
          )}
        </div>
      </div>

      <InventoryLowStockBoard
        items={lowStockItems}
        canWrite={canWrite}
        listQuery={listQuery}
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando catálogo...</div>}>
        <InventoryList
          data={catalog}
          initialSearch={search}
          initialCategory={category ?? ''}
          initialLowStock={lowStock}
          branchName={branchName}
        />
      </Suspense>
    </div>
  );
}
