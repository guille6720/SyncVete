import { agendaMemberKey } from '@sincvete/shared';
import { redirect } from 'next/navigation';
import {
  canManageAppointments,
  canReadAppointments,
  getAssignableStaff,
} from '@/actions/appointments';
import { getSessionContext } from '@/actions/auth';
import { getUserBranches } from '@/actions/settings';
import { TurnosBookingView } from '@/components/appointments/turnos-booking-view';

interface TurnosPageProps {
  searchParams: Promise<{ assigned?: string; branch?: string }>;
}

export default async function TurnosPage({ searchParams }: TurnosPageProps) {
  const canRead = await canReadAppointments();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const session = await getSessionContext();
  const [staff, branches, canWrite] = await Promise.all([
    getAssignableStaff(),
    getUserBranches(),
    canManageAppointments(),
  ]);

  const branchId = params.branch?.trim() || session?.branchId || '';
  const assigned =
    params.assigned && staff.some((member) => agendaMemberKey(member) === params.assigned)
      ? params.assigned
      : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
        <p className="text-muted-foreground">
          Elegí un profesional, revisá su agenda de atención y creá un turno nuevo
        </p>
      </div>

      <TurnosBookingView
        staff={staff}
        branches={branches}
        defaultBranchId={branchId}
        canWrite={canWrite}
        initialAssignedUserId={assigned}
      />
    </div>
  );
}
