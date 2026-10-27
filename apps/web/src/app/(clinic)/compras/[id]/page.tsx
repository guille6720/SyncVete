import { notFound, redirect } from 'next/navigation';
import {
  canManagePurchases,
  canReadPurchases,
  getInventoryPurchase,
} from '@/actions/purchases';
import { getUserBranches } from '@/actions/settings';
import { PurchaseDetail } from '@/components/purchases/purchase-detail';
import { resolveListHref } from '@/lib/list-return';

interface CompraDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}

export default async function CompraDetailPage({
  params,
  searchParams,
}: CompraDetailPageProps) {
  const canRead = await canReadPurchases();
  if (!canRead) redirect('/dashboard');

  const [{ id }, query, canWrite, branches] = await Promise.all([
    params,
    searchParams,
    canManagePurchases(),
    getUserBranches(),
  ]);

  const purchase = await getInventoryPurchase(id);
  if (!purchase) notFound();

  const branchName = branches.find((branch) => branch.id === purchase.branch_id)?.name ?? null;
  const listHref = resolveListHref('/compras', query.return);

  return (
    <PurchaseDetail
      purchase={purchase}
      canWrite={canWrite}
      branchName={branchName}
      listHref={listHref}
    />
  );
}
