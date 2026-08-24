import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listAppointments, getAssignableStaff } from '@/actions/appointments';
import { canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import { AppointmentsAgenda } from '@/components/appointments/appointments-agenda';
import { getSessionContext } from '@/lib/session';
import {
  APPOINTMENT_STATUSES,
  getWeekStartDate,
  mapWaitingRoomByAppointmentId,
  parseDateParam,
  type AppointmentStatus,
} from '@sincvete/shared';

interface AgendaPageProps {
  searchParams: Promise<{
    date?: string;
    week?: string;
    status?: string;
    assigned?: string;
  }>;
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.permissions.includes('appointments:read')) redirect('/dashboard');

  const selectedDate = parseDateParam(params.date);
  const weekStart = params.week ?? getWeekStartDate(selectedDate);
  const statusParam = params.status?.trim() ?? '';
  const status = APPOINTMENT_STATUSES.includes(statusParam as AppointmentStatus)
    ? (statusParam as AppointmentStatus)
    : undefined;

  const [appointments, staff, canReadWr] = await Promise.all([
    listAppointments({
      weekStart,
      status,
      assignedUserId: params.assigned,
    }),
    getAssignableStaff(),
    canReadWaitingRoom(),
  ]);

  const waitingRoomByAppointment =
    canReadWr && selectedDate
      ? mapWaitingRoomByAppointmentId(await listWaitingRoom({ date: selectedDate }))
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground">Calendario semanal de citas</p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <AppointmentsAgenda
          appointments={appointments}
          weekStart={weekStart}
          selectedDate={selectedDate}
          canWrite={session.permissions.includes('appointments:write')}
          staff={staff}
          initialStatus={status ?? ''}
          initialAssignedUserId={params.assigned ?? ''}
          waitingRoomByAppointment={waitingRoomByAppointment}
        />
      </Suspense>
    </div>
  );
}
