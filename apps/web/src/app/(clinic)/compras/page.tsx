import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Package, Plus, ShoppingCart } from 'lucide-react';
import {
  canManagePurchases,
  canReadPurchases,
  listInventoryPurchases,
} from '@/actions/purchases';
import { listLowStock } from '@/actions/inventory';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InventoryLowStockBoard } from '@/components/inventory/inventory-low-stock-board';
import { PurchasesList } from '@/components/purchases/purchases-list';
import { Button } from '@/components/ui/button';
import { buildListQuery } from '@/lib/list-return';
import {
  INVENTORY_PURCHASE_STATUSES,
  type InventoryPurchaseStatus,
} from '@sincvete/shared';

interface ComprasPageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
  }>;
}

export default async function ComprasPage({ searchParams }: ComprasPageProps) {
  const canRead = await canReadPurchases();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = INVENTORY_PURCHASE_STATUSES.includes(statusParam as InventoryPurchaseStatus)
    ? (statusParam as InventoryPurchaseStatus)
    : undefined;

  const [purchases, lowStockItems, canWrite, session, branches] = await Promise.all([
    listInventoryPurchases({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    listLowStock(),
    canManagePurchases(),
    getSessionContext(),
    getUserBranches(),
  ]);

  const branchName =
    branches.find((branch) => branch.id === session?.branchId)?.name ?? null;
  const listQuery = buildListQuery({
    page: page > 1 ? String(page) : undefined,
    search: search || undefined,
    status: status || undefined,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-muted-foreground">
            Adquirí productos y actualizá el stock
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventario">
              <Package className="mr-2 h-4 w-4" />
              Inventario
            </Link>
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href="/compras/nueva">
                <Plus className="mr-2 h-4 w-4" />
                Nueva compra
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Al recibir una compra se genera una entrada de stock por cada producto. El stock bajo
            aparece abajo para reponer rápido.
          </p>
        </div>
      </div>

      <InventoryLowStockBoard
        items={lowStockItems}
        canWrite={canWrite}
        listQuery={listQuery}
        createHref="/compras/nueva"
        createLabel="Nueva compra"
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando compras…</div>}>
        <PurchasesList
          data={purchases}
          initialSearch={search}
          initialStatus={status ?? ''}
          branchName={branchName}
        />
      </Suspense>
    </div>
  );
}
