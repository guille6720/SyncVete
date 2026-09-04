import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getOwner } from '@/actions/owners';
import { canManagePatients } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/actions/auth';
import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';

interface NuevoPacientePageProps {
  searchParams: Promise<{ ownerId?: string; returnTo?: string }>;
}

/** Only allow returning to owner detail pages (open-redirect safe). */
function safeOwnerReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/propietarios/')) return null;
  if (decoded.includes('://') || decoded.includes('//') || decoded.includes('\\')) return null;
  if (decoded.includes('?') || decoded.includes('#')) return null;
  return decoded;
}

export default async function NuevoPacientePage({ searchParams }: NuevoPacientePageProps) {
  const canWrite = await canManagePatients();
  if (!canWrite) redirect('/pacientes');

  const params = await searchParams;
  const session = await getSessionContext();
  const branches = await getUserBranches();
  const returnTo = safeOwnerReturnTo(params.returnTo);

  let ownerName: string | undefined;
  if (params.ownerId) {
    const owner = await getOwner(params.ownerId);
    ownerName = owner?.full_name;
  }

  const backHref = returnTo || '/pacientes';
  const backLabel = returnTo ? 'Volver al propietario' : 'Volver a pacientes';

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
      </Button>
      <PatientForm
        branches={branches}
        defaultBranchId={session?.branchId}
        defaultOwnerId={params.ownerId}
        ownerName={ownerName}
        returnTo={returnTo}
      />
    </div>
  );
}
