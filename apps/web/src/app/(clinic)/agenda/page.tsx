import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  listAppointments,
  listAppointmentsCalendar,
  getAssignableStaff,
} from '@/actions/appointments';
import { canManageConsultations } from '@/actions/consultations';
import { canReadBilling } from '@/actions/billing';
import { canReadVaccinations } from '@/actions/vaccinations';
import { canManageWaitingRoom, canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import { getUserBranches } from '@/actions/settings';
import { AppointmentsAgenda } from '@/components/appointments/appointments-agenda';
import type { AgendaViewMode } from '@/components/appointments/appointments-calendar-views';
import { getSessionContext } from '@/lib/session';
import {
  APPOINTMENT_STATUSES,
  getWeekDays,
  getWeekStartDate,
  mapWaitingRoomByAppointmentId,
  parseDateParam,
  type AppointmentListRow,
  type AppointmentStatus,
} from '@sincvete/shared';

interface AgendaPageProps {
  searchParams: Promise<{
    date?: string;
    week?: string;
    month?: string;
    view?: string;
    status?: string;
    assigned?: string;
    branch?: string;
    q?: string;
  }>;
}

function parseView(value?: string): AgendaViewMode {
  if (value === 'week' || value === 'month' || value === 'day') return value;
  return 'day';
}

function shiftDay(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthBounds(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function loadCalendarAppointments(input: {
  from: string;
  to: string;
  weekStart: string;
  branchId?: string;
  status?: AppointmentStatus;
  assignedUserId?: string;
  query?: string;
}): Promise<AppointmentListRow[]> {
  try {
    return await listAppointmentsCalendar({
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      status: input.status,
      assignedUserId: input.assignedUserId,
      query: input.query,
    });
  } catch {
    return listAppointments({
      weekStart: input.weekStart,
      branchId: input.branchId,
      status: input.status,
      assignedUserId: input.assignedUserId,
    });
  }
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.permissions.includes('appointments:read')) redirect('/dashboard');

  const selectedDate = parseDateParam(params.date);
  const weekStart = params.week ?? getWeekStartDate(selectedDate);
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : selectedDate.slice(0, 7);
  const view = parseView(params.view);
  const statusParam = params.status?.trim() ?? '';
  const status = APPOINTMENT_STATUSES.includes(statusParam as AppointmentStatus)
    ? (statusParam as AppointmentStatus)
    : undefined;
  const branchId = params.branch?.trim() || undefined;
  const assignedUserId = params.assigned?.trim() || undefined;
  const query = params.q?.trim() || undefined;

  let from = weekStart;
  let to = getWeekDays(weekStart)[6] ?? weekStart;
  if (view === 'day') {
    from = selectedDate;
    to = selectedDate;
  } else if (view === 'month') {
    const bounds = monthBounds(month);
    from = bounds.from;
    to = bounds.to;
  } else if (view === 'week') {
    from = weekStart;
    to = shiftDay(weekStart, 6);
  }

  const [
    appointments,
    staff,
    branches,
    canReadWr,
    canCheckIn,
    canStart,
    canBilling,
    canVaccination,
  ] = await Promise.all([
    loadCalendarAppointments({
      from,
      to,
      weekStart,
      branchId,
      status,
      assignedUserId,
      query,
    }),
    getAssignableStaff(),
    getUserBranches(),
    canReadWaitingRoom(),
    canManageWaitingRoom(),
    canManageConsultations(),
    canReadBilling(),
    canReadVaccinations(),
  ]);

  const waitingRoomEntries =
    canReadWr && selectedDate ? await listWaitingRoom({ date: selectedDate }) : [];
  const waitingRoomByAppointment =
    waitingRoomEntries.length > 0
      ? mapWaitingRoomByAppointmentId(waitingRoomEntries)
      : undefined;
  const waitingRoomWaitingCount = canReadWr
    ? waitingRoomEntries.filter((entry) => entry.waiting_room_status === 'waiting').length
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground">Calendario de citas para recepción</p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <AppointmentsAgenda
          appointments={appointments}
          weekStart={weekStart}
          selectedDate={selectedDate}
          month={month}
          view={view}
          canWrite={session.permissions.includes('appointments:write')}
          staff={staff}
          branches={branches}
          initialStatus={status ?? ''}
          initialAssignedUserId={assignedUserId ?? ''}
          initialBranchId={branchId ?? ''}
          initialQuery={query ?? ''}
          waitingRoomByAppointment={waitingRoomByAppointment}
          waitingRoomWaitingCount={waitingRoomWaitingCount}
          canStartConsultation={canStart}
          canCheckInWaitingRoom={canCheckIn}
          canBilling={canBilling}
          canVaccination={canVaccination}
        />
      </Suspense>
    </div>
  );
}
