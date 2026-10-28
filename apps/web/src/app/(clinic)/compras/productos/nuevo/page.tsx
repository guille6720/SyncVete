import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManagePurchases } from '@/actions/purchases';
import {
  listPurchasePartyOptions,
  listPurchaseCategories,
  getPurchaseExchangeRate,
} from '@/actions/purchase-catalog';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InventoryProductForm } from '@/components/inventory/inventory-product-form';
import { Button } from '@/components/ui/button';
import { INVENTORY_PRODUCT_CATEGORIES, type InventoryProductCategory } from '@sincvete/shared';

interface NuevoProductoComprasPageProps {
  searchParams: Promise<{ categoria?: string; lock?: string }>;
}

export default async function NuevoProductoComprasPage({
  searchParams,
}: NuevoProductoComprasPageProps) {
  const canWrite = await canManagePurchases();
  if (!canWrite) redirect('/compras');

  const params = await searchParams;
  const category = INVENTORY_PRODUCT_CATEGORIES.includes(
    params.categoria as InventoryProductCategory
  )
    ? (params.categoria as InventoryProductCategory)
    : 'medicamento';
  const lockedVaccine = category === 'vacuna' && params.lock === '1';
  const listHref =
    category === 'vacuna'
      ? '/compras?seccion=vacunas'
      : category === 'medicamento'
        ? '/compras?seccion=productos'
        : `/compras?seccion=productos&categoria=${category}`;

  const [session, branches, suppliers, categories, exchangeRate] = await Promise.all([
    getSessionContext(),
    getUserBranches(),
    listPurchasePartyOptions(),
    listPurchaseCategories(),
    getPurchaseExchangeRate(),
  ]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a compras
        </Link>
      </Button>
      <InventoryProductForm
        branches={branches}
        defaultBranchId={session?.branchId}
        listHref={listHref}
        defaultCategory={category}
        lockCategory={lockedVaccine}
        suppliers={suppliers}
        categories={categories}
        exchangeRate={exchangeRate}
        afterCreate={{
          seccion: category === 'vacuna' ? 'vacunas' : 'productos',
          categoria: category === 'vacuna' ? undefined : category,
        }}
      />
    </div>
  );
}
