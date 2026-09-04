import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getOwner, canReadOwners } from '@/actions/owners';
import { canManagePatients } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/actions/auth';
import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';

interface NuevoPacienteDesdePropietarioPageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoPacienteDesdePropietarioPage({
  params,
}: NuevoPacienteDesdePropietarioPageProps) {
  const canWrite = await canManagePatients();
  if (!canWrite) redirect('/propietarios');

  const canRead = await canReadOwners();
  if (!canRead) redirect('/dashboard');

  const { id: ownerId } = await params;
  const [owner, session, branches] = await Promise.all([
    getOwner(ownerId),
    getSessionContext(),
    getUserBranches(),
  ]);

  if (!owner) notFound();

  const returnTo = `/propietarios/${ownerId}`;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={returnTo}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a {owner.full_name}
        </Link>
      </Button>
      <PatientForm
        branches={branches}
        defaultBranchId={session?.branchId}
        defaultOwnerId={owner.id}
        ownerName={owner.full_name}
        returnTo={returnTo}
      />
    </div>
  );
}
