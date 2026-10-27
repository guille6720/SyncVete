import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManagePurchases } from '@/actions/purchases';
import { PartyForm } from '@/components/purchases/party-form';
import { Button } from '@/components/ui/button';
import type { PurchasePartyKind, PurchasePartyScope } from '@sincvete/shared';

interface NuevaPartePageProps {
  searchParams: Promise<{ tipo?: string; ambito?: string }>;
}

export default async function NuevaPartePage({ searchParams }: NuevaPartePageProps) {
  const canWrite = await canManagePurchases();
  if (!canWrite) redirect('/compras');

  const params = await searchParams;
  const kind: PurchasePartyKind = params.tipo === 'prestador' ? 'prestador' : 'proveedor';
  const scope: PurchasePartyScope = params.ambito === 'vacunas' ? 'vacunas' : 'general';
  if (scope === 'vacunas' && kind !== 'proveedor') redirect('/compras?seccion=vacunas');

  const listHref = scope === 'vacunas'
    ? '/compras?seccion=vacunas'
    : kind === 'prestador'
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
      <PartyForm kind={kind} scope={scope} listHref={listHref} />
    </div>
  );
}
