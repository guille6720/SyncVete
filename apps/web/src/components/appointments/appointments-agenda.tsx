'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarClock, ClipboardList, Plus, Search } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AppointmentMetrics } from '@/components/appointments/appointment-metrics';
import { AppointmentSidePanel } from '@/components/appointments/appointment-side-panel';
import {
  AppointmentsCalendarViews,
  type AgendaViewMode,
} from '@/components/appointments/appointments-calendar-views';
import { AppointmentsWeekNav } from '@/components/appointments/appointments-week-nav';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  formatDateParam,
  formatDayLabel,
  type AppointmentListRow,
  type AssignableStaffMember,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface AppointmentsAgendaProps {
  appointments: AppointmentListRow[];
  weekStart: string;
  selectedDate: string;
  month: string;
  view: AgendaViewMode;
  canWrite: boolean;
  staff: AssignableStaffMember[];
  branches: Array<{ id: string; name: string }>;
  initialStatus?: string;
  initialAssignedUserId?: string;
  initialBranchId?: string;
  initialQuery?: string;
  waitingRoomByAppointment?: Record<string, WaitingRoomStatus>;
  waitingRoomWaitingCount?: number;
  canStartConsultation?: boolean;
  canCheckInWaitingRoom?: boolean;
  canBilling?: boolean;
  canVaccination?: boolean;
}

function getDayKey(isoDate: string): string {
  return formatDateParam(new Date(isoDate));
}

const VIEW_OPTIONS: { value: AgendaViewMode; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

export function AppointmentsAgenda({
  appointments,
  weekStart,
  selectedDate,
  month,
  view,
  canWrite,
  staff,
  branches,
  initialStatus = '',
  initialAssignedUserId = '',
  initialBranchId = '',
  initialQuery = '',
  waitingRoomByAppointment,
  waitingRoomWaitingCount,
  canStartConsultation = false,
  canCheckInWaitingRoom = false,
  canBilling = false,
  canVaccination = false,
}: AppointmentsAgendaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [queryDraft, setQueryDraft] = useState(initialQuery);
  const [selected, setSelected] = useState<AppointmentListRow | null>(null);

  const countsByDay = useMemo(
    () =>
      appointments.reduce<Record<string, number>>((acc, appointment) => {
        const day = getDayKey(appointment.starts_at);
        acc[day] = (acc[day] ?? 0) + 1;
        return acc;
      }, {}),
    [appointments]
  );

  const dayAppointments = useMemo(
    () => appointments.filter((appointment) => getDayKey(appointment.starts_at) === selectedDate),
    [appointments, selectedDate]
  );

  const selectedWaitingStatus = selected
    ? waitingRoomByAppointment?.[selected.id] ?? null
    : null;

  const pushParams = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    pushParams({ q: queryDraft.trim() || null });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <form onSubmit={submitSearch} className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                placeholder="Buscar paciente o tutor..."
                className="pl-8"
                aria-label="Buscar citas"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              Buscar
            </Button>
          </form>

          <Select
            value={initialStatus}
            onChange={(e) => pushParams({ status: e.target.value || null })}
            className="w-full sm:w-44"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            {APPOINTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {APPOINTMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>

          <Select
            value={initialAssignedUserId}
            onChange={(e) => pushParams({ assigned: e.target.value || null })}
            className="w-full sm:w-48"
            aria-label="Filtrar por profesional"
          >
            <option value="">Todos los profesionales</option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>

          {branches.length > 1 && (
            <Select
              value={initialBranchId}
              onChange={(e) => pushParams({ branch: e.target.value || null })}
              className="w-full sm:w-48"
              aria-label="Filtrar por sucursal"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <div
            className="inline-flex rounded-lg border p-0.5"
            role="group"
            aria-label="Vista de agenda"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  view === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
                onClick={() => pushParams({ view: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/agenda/lista-espera">
              <ClipboardList className="mr-2 h-4 w-4" />
              Lista de espera
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/agenda/disponibilidad">
              <CalendarClock className="mr-2 h-4 w-4" />
              Disponibilidad
            </Link>
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href={`/agenda/nueva?date=${selectedDate}`}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva cita
              </Link>
            </Button>
          )}
        </div>
      </div>

      <AppointmentMetrics
        appointments={dayAppointments}
        waitingRoomWaitingCount={waitingRoomWaitingCount}
      />

      <AppointmentsWeekNav
        weekStart={weekStart}
        selectedDate={selectedDate}
        countsByDay={countsByDay}
        view={view}
      />

      {view === 'day' && (
        <h2 className="text-lg font-semibold">{formatDayLabel(selectedDate)}</h2>
      )}

      <AppointmentsCalendarViews
        view={view}
        appointments={appointments}
        selectedDate={selectedDate}
        weekStart={weekStart}
        month={month}
        staff={staff}
        canWrite={canWrite}
        waitingRoomByAppointment={waitingRoomByAppointment}
        onSelectAppointment={setSelected}
      />

      <AppointmentSidePanel
        appointment={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        canWrite={canWrite}
        canStartConsultation={canStartConsultation}
        canCheckInWaitingRoom={canCheckInWaitingRoom}
        canBilling={canBilling}
        canVaccination={canVaccination}
        waitingRoomStatus={selectedWaitingStatus}
      />
    </div>
  );
}
