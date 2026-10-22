import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManageInventory } from '@/actions/inventory';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { InventoryProductForm } from '@/components/inventory/inventory-product-form';
import { Button } from '@/components/ui/button';
import { resolveListHref } from '@/lib/list-return';

interface NuevoInventarioPageProps {
  searchParams: Promise<{ return?: string }>;
}

export default async function NuevoInventarioPage({ searchParams }: NuevoInventarioPageProps) {
  const canWrite = await canManageInventory();
  if (!canWrite) redirect('/inventario');

  const query = await searchParams;
  const listHref = resolveListHref('/inventario', query.return);
  const session = await getSessionContext();
  const branches = await getUserBranches();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a inventario
        </Link>
      </Button>
      <InventoryProductForm
        branches={branches}
        defaultBranchId={session?.branchId}
        listHref={listHref}
      />
    </div>
  );
}
