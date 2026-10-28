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

  const listHref =
    party.scope === 'vacunas'
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
      {canWrite ? (
        <PartyForm kind={party.kind} scope={party.scope} party={party} listHref={listHref} />
      ) : (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="text-xl font-semibold">{party.name}</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ['Tipo', party.kind === 'proveedor' ? 'Proveedor' : 'Prestador'],
              ['CUIT', party.cuit],
              ['Contacto', party.contact_name],
              ['Teléfono', party.phone],
              ['Email', party.email],
              ['Notas', party.notes],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
