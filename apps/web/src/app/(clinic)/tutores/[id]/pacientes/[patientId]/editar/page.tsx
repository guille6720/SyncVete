import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getOwner, canReadOwners } from '@/actions/owners';
import { getPatient, canManagePatients } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { PatientForm } from '@/components/patients/patient-form';
import { Button } from '@/components/ui/button';

interface EditarPacienteDesdeTutorPageProps {
  params: Promise<{ id: string; patientId: string }>;
}

export default async function EditarPacienteDesdeTutorPage({
  params,
}: EditarPacienteDesdeTutorPageProps) {
  const canWrite = await canManagePatients();
  if (!canWrite) redirect('/tutores');

  const canRead = await canReadOwners();
  if (!canRead) redirect('/dashboard');

  const { id: ownerId, patientId } = await params;
  const [owner, patient, branches] = await Promise.all([
    getOwner(ownerId),
    getPatient(patientId),
    getUserBranches(),
  ]);

  if (!owner || !patient) notFound();
  if (patient.owner_id !== owner.id) notFound();

  const returnTo = `/tutores/${ownerId}`;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={returnTo}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a {owner.full_name}
        </Link>
      </Button>
      <PatientForm
        patient={patient}
        ownerName={owner.full_name}
        branches={branches}
        returnTo={returnTo}
      />
    </div>
  );
}
