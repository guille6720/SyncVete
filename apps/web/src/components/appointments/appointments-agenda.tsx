'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { AppointmentsWeekNav } from '@/components/appointments/appointments-week-nav';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  formatAppointmentTime,
  formatDayLabel,
  formatDateParam,
  SPECIES_EMOJI,
  type AppointmentListRow,
  type AssignableStaffMember,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface AppointmentsAgendaProps {
  appointments: AppointmentListRow[];
  weekStart: string;
  selectedDate: string;
  canWrite: boolean;
  staff: AssignableStaffMember[];
  initialStatus?: string;
  initialAssignedUserId?: string;
  waitingRoomByAppointment?: Record<string, WaitingRoomStatus>;
}

function getDayKey(isoDate: string): string {
  return formatDateParam(new Date(isoDate));
}

export function AppointmentsAgenda({
  appointments,
  weekStart,
  selectedDate,
  canWrite,
  staff,
  initialStatus = '',
  initialAssignedUserId = '',
  waitingRoomByAppointment,
}: AppointmentsAgendaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const countsByDay = appointments.reduce<Record<string, number>>((acc, appointment) => {
    const day = getDayKey(appointment.starts_at);
    acc[day] = (acc[day] ?? 0) + 1;
    return acc;
  }, {});

  const dayAppointments = appointments
    .filter((appointment) => getDayKey(appointment.starts_at) === selectedDate)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const updateFilter = (key: 'status' | 'assigned', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Select
            value={initialStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="w-full sm:w-44"
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
            onChange={(e) => updateFilter('assigned', e.target.value)}
            className="w-full sm:w-48"
          >
            <option value="">Todos los profesionales</option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </Select>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href={`/agenda/nueva?date=${selectedDate}`}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva cita
            </Link>
          </Button>
        )}
      </div>

      <AppointmentsWeekNav
        weekStart={weekStart}
        selectedDate={selectedDate}
        countsByDay={countsByDay}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{formatDayLabel(selectedDate)}</h2>

        {dayAppointments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-muted-foreground">No hay citas para este día.</p>
            {canWrite && (
              <Button asChild className="mt-4">
                <Link href={`/agenda/nueva?date=${selectedDate}`}>Agendar cita</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {dayAppointments.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/agenda/${appointment.id}`}
                className="block rounded-lg border p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {formatAppointmentTime(appointment.starts_at)} ·{' '}
                        {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
                      </p>
                      <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
                        {APPOINTMENT_STATUS_LABELS[appointment.status]}
                      </Badge>
                      {waitingRoomByAppointment?.[appointment.id] && (
                        <Badge
                          variant={
                            WAITING_ROOM_STATUS_VARIANT[waitingRoomByAppointment[appointment.id]]
                          }
                        >
                          {WAITING_ROOM_STATUS_LABELS[waitingRoomByAppointment[appointment.id]]}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}
                      {appointment.title ? ` · ${appointment.title}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {appointment.owner_full_name}
                      {appointment.assigned_user_name
                        ? ` · ${appointment.assigned_user_name}`
                        : ''}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
