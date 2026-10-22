import { redirect } from 'next/navigation';
import { getAgendaBootstrap } from '@/actions/agenda-data';
import { AppointmentsAgenda } from '@/components/appointments/appointments-agenda';
import {
  APPOINTMENT_STATUSES,
  resolveAgendaCalendarRange,
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

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const params = await searchParams;
  const range = resolveAgendaCalendarRange({
    date: params.date,
    week: params.week,
    month: params.month,
    view: params.view,
  });

  const statusParam = params.status?.trim() ?? '';
  const status = APPOINTMENT_STATUSES.includes(statusParam as AppointmentStatus)
    ? statusParam
    : undefined;
  const branchId = params.branch?.trim() || undefined;
  const assignedUserId = params.assigned?.trim() || undefined;
  const query = params.q?.trim() || undefined;

  const bootstrap = await getAgendaBootstrap({
    from: range.from,
    to: range.to,
    weekStart: range.weekStart,
    selectedDate: range.selectedDate,
    branchId,
    status,
    assignedUserId,
    query,
  });
  if (!bootstrap) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground">Calendario de turnos para recepción</p>
      </div>

      <AppointmentsAgenda
        shell={bootstrap.shell}
        initialDynamic={bootstrap.dynamic}
        initialSelectedDate={range.selectedDate}
        initialWeekStart={range.weekStart}
        initialMonth={range.month}
        initialView={range.view}
        initialStatus={status ?? ''}
        initialAssignedUserId={assignedUserId ?? ''}
        initialBranchId={branchId ?? ''}
        initialQuery={query ?? ''}
      />
    </div>
  );
}
