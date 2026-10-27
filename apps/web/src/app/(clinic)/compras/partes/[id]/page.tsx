import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPurchaseParty } from '@/actions/purchase-catalog';
import { canManagePurchases, canReadPurchases } from '@/actions/purchases';
import { PartyForm } from '@/components/purchases/party-form';
import { Button } from '@/components/ui/button';

interface PartePageProps {
  params: Promise<{ id: string }>;
}

export default async function PartePage({ params }: PartePageProps) {
  const canRead = await canReadPurchases();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const [party, canWrite] = await Promise.all([getPurchaseParty(id), canManagePurchases()]);
  if (!party) notFound();
  if (!canWrite) redirect('/compras');

  const listHref = party.scope === 'vacunas'
    ? '/compras?seccion=vacunas'
    : party.kind === 'prestador'
      ? '/compras?seccion=prestadores'
      : '/compras?seccion=proveedores';

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a compras
        </Link>
      </Button>
      <PartyForm kind={party.kind} scope={party.scope} party={party} listHref={listHref} />
    </div>
  );
}
