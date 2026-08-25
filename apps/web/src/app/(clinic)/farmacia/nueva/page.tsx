import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { PrescriptionForm } from '@/components/pharmacy/prescription-form';
import { Button } from '@/components/ui/button';
import { resolveListHref } from '@/lib/list-return';
import { getSessionContext } from '@/lib/session';

interface NuevaRecetaPageProps {
  searchParams: Promise<{
    patientId?: string;
    consultationId?: string;
    return?: string;
  }>;
}

export default async function NuevaRecetaPage({ searchParams }: NuevaRecetaPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.permissions.includes('clinical:write')) redirect('/farmacia');

  const listHref = resolveListHref('/farmacia', params.return);
  const [branches, patient] = await Promise.all([
    getUserBranches(),
    params.patientId ? getPatient(params.patientId) : Promise.resolve(null),
  ]);
  const owner = patient ? await getOwner(patient.owner_id) : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a farmacia
        </Link>
      </Button>
      <PrescriptionForm
        branches={branches}
        defaultBranchId={session.branchId}
        defaultPatientId={patient?.id}
        defaultPatientName={patient?.name}
        defaultOwnerId={patient?.owner_id}
        defaultOwnerName={owner?.full_name}
        defaultConsultationId={params.consultationId}
        listHref={listHref}
      />
    </div>
  );
}
