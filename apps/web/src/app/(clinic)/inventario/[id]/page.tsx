import { notFound, redirect } from 'next/navigation';
import {
  canManageInventory,
  canReadInventory,
  getInventoryProduct,
} from '@/actions/inventory';
import { listPurchasePartyOptions } from '@/actions/purchase-catalog';
import { InventoryProductDetail } from '@/components/inventory/inventory-product-detail';
import { resolveListHref } from '@/lib/list-return';

interface InventarioDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string; from?: string }>;
}

export default async function InventarioDetailPage({
  params,
  searchParams,
}: InventarioDetailPageProps) {
  const canRead = await canReadInventory();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const query = await searchParams;
  const fromCompras = query.from === 'compras';
  const [data, canWrite, suppliers] = await Promise.all([
    getInventoryProduct(id),
    canManageInventory(),
    listPurchasePartyOptions(),
  ]);

  if (!data) notFound();

  return (
    <InventoryProductDetail
      product={data.product}
      movements={data.movements}
      canWrite={canWrite}
      suppliers={suppliers}
      listHref={resolveListHref(fromCompras ? '/compras' : '/inventario', query.return)}
      backLabel={fromCompras ? 'Volver a compras' : 'Volver a inventario'}
    />
  );
}
