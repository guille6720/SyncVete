import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { canManageAppointments, canReadAppointments, getAssignableStaff } from '@/actions/appointments';
import {
  listProfessionalSchedules,
  listProfessionalTimeBlocks,
} from '@/actions/appointment-availability';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/lib/session';
import { AppointmentAvailabilityBoard } from '@/components/appointments/appointment-availability-board';
import { Button } from '@/components/ui/button';
import { formatDateParam } from '@sincvete/shared';

export default async function DisponibilidadPage() {
  const canRead = await canReadAppointments();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  const today = formatDateParam(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const toDate = new Date(Date.UTC(year, month - 1, day + 60, 12));
  const to = toDate.toISOString().slice(0, 10);

  const [schedules, blocks, staff, branches, canWrite] = await Promise.all([
    listProfessionalSchedules(),
    listProfessionalTimeBlocks({ from: today, to }),
    getAssignableStaff(),
    getUserBranches(),
    canManageAppointments(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/agenda">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a agenda
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Disponibilidad</h1>
        <p className="text-muted-foreground">
          Horarios semanales y bloqueos de profesionales
        </p>
      </div>

      <AppointmentAvailabilityBoard
        schedules={schedules}
        blocks={blocks}
        staff={staff}
        branches={branches}
        defaultBranchId={session?.branchId}
        canWrite={canWrite}
      />
    </div>
  );
}
