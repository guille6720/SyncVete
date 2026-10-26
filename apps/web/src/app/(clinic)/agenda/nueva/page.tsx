import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManageAppointments, getAssignableStaff } from '@/actions/appointments';
import { getSessionContext } from '@/actions/auth';
import { getOwner } from '@/actions/owners';
import { getPatient } from '@/actions/patients';
import { getUserBranches } from '@/actions/settings';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import { Button } from '@/components/ui/button';
import { parseDateParam } from '@sincvete/shared';

interface NuevaCitaPageProps {
  searchParams: Promise<{
    date?: string;
    patientId?: string;
    assigned?: string;
    branch?: string;
  }>;
}

export default async function NuevaCitaPage({ searchParams }: NuevaCitaPageProps) {
  const canWrite = await canManageAppointments();
  if (!canWrite) redirect('/agenda');

  const params = await searchParams;
  const session = await getSessionContext();

  let patient = null;
  let owner = null;
  if (params.patientId) {
    patient = await getPatient(params.patientId);
    if (patient) owner = await getOwner(patient.owner_id);
  }

  const [staff, branches] = await Promise.all([
    getAssignableStaff(),
    getUserBranches(),
  ]);

  const date = parseDateParam(params.date);
  const defaultStartsAt = `${date}T09:00`;
  const defaultBranchId = params.branch || session?.branchId || null;
  const defaultAssignedUserId =
    params.assigned && staff.some((member) => member.userId === params.assigned)
      ? params.assigned
      : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/agenda">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a agenda
        </Link>
      </Button>
      <AppointmentForm
        staff={staff}
        branches={branches}
        defaultBranchId={defaultBranchId}
        defaultPatientId={patient?.id}
        defaultPatientName={patient?.name}
        defaultOwnerId={patient?.owner_id}
        defaultOwnerName={owner?.full_name}
        defaultStartsAt={defaultStartsAt}
        defaultAssignedUserId={defaultAssignedUserId}
      />
    </div>
  );
}
