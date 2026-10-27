import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManagePurchases } from '@/actions/purchases';
import { listInventoryProducts } from '@/actions/inventory';
import { getPurchaseExchangeRate } from '@/actions/purchase-catalog';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { PurchaseForm } from '@/components/purchases/purchase-form';
import { Button } from '@/components/ui/button';
import { resolveListHref } from '@/lib/list-return';

interface NuevaCompraPageProps {
  searchParams: Promise<{
    return?: string;
  }>;
}

export default async function NuevaCompraPage({ searchParams }: NuevaCompraPageProps) {
  const canWrite = await canManagePurchases();
  if (!canWrite) redirect('/compras');

  const [params, session, branches, catalog, exchangeRate] = await Promise.all([
    searchParams,
    getSessionContext(),
    getUserBranches(),
    listInventoryProducts({ page: 1, pageSize: 100, activeOnly: true }),
    getPurchaseExchangeRate(),
  ]);

  const listHref = resolveListHref('/compras', params.return);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a compras
        </Link>
      </Button>
      <PurchaseForm
        branches={branches}
        products={catalog.data}
        exchangeRate={exchangeRate}
        defaultBranchId={session?.branchId}
        listHref={listHref}
      />
    </div>
  );
}
