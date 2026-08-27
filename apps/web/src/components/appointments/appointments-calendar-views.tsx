'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
  APPOINTMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  formatAppointmentTime,
  formatDateParam,
  formatDayLabel,
  formatWeekdayLabel,
  getWeekDays,
  getWeekStartDate,
  groupAppointmentsByAssignee,
  type AppointmentListRow,
  type AssignableStaffMember,
  type PaymentMethod,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import type { AgendaNavigatePatch } from '@/components/appointments/agenda-types';

export type AgendaViewMode = 'day' | 'week' | 'month';

interface AppointmentsCalendarViewsProps {
  view: AgendaViewMode;
  appointments: AppointmentListRow[];
  selectedDate: string;
  weekStart: string;
  month: string;
  staff: AssignableStaffMember[];
  canWrite: boolean;
  query?: string;
  waitingRoomByAppointment?: Record<string, WaitingRoomStatus>;
  onSelectAppointment: (appointment: AppointmentListRow) => void;
  onNavigate: (patch: AgendaNavigatePatch) => void;
  onClearSearch?: () => void;
}

const DAY_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08–20

function dayKey(isoDate: string): string {
  return formatDateParam(new Date(isoDate));
}

function hourKey(isoDate: string): number {
  const time = formatAppointmentTime(isoDate);
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : 0;
}

function getMonthDays(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const weekday = first.getUTCDay();
  const leading = weekday === 0 ? 6 : weekday - 1;
  const cells: string[] = [];
  for (let i = leading; i > 0; i -= 1) {
    const d = new Date(Date.UTC(year, m - 1, 1 - i, 12));
    cells.push(d.toISOString().slice(0, 10));
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const [y, mo, d] = last.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo - 1, d + 1, 12));
    cells.push(next.toISOString().slice(0, 10));
  }
  return cells;
}

function AppointmentCard({
  appointment,
  waitingRoomStatus,
  onSelect,
  compact = false,
}: {
  appointment: AppointmentListRow;
  waitingRoomStatus?: WaitingRoomStatus;
  onSelect: () => void;
  compact?: boolean;
}) {
  const paymentMethod =
    appointment.expected_payment_method &&
    appointment.expected_payment_method in PAYMENT_METHOD_LABELS
      ? (appointment.expected_payment_method as PaymentMethod)
      : null;
  const isFree = paymentMethod === 'gratuito';
  // Free appointments should not keep showing waiting-room "Pago pendiente".
  const showWaitingRoom =
    Boolean(waitingRoomStatus) && !(isFree && waitingRoomStatus === 'payment_pending');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border bg-card text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'px-2 py-1.5' : 'p-3'
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
          {formatAppointmentTime(appointment.starts_at)}
          {!compact && (
            <>
              {' '}
              · {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
            </>
          )}
        </span>
        <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]} className="text-[10px]">
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </Badge>
        {paymentMethod && (
          <Badge variant={isFree ? 'success' : 'default'} className="text-[10px]">
            {PAYMENT_METHOD_LABELS[paymentMethod]}
          </Badge>
        )}
        {showWaitingRoom && waitingRoomStatus && (
          <Badge variant={WAITING_ROOM_STATUS_VARIANT[waitingRoomStatus]} className="text-[10px]">
            SE · {WAITING_ROOM_STATUS_LABELS[waitingRoomStatus]}
          </Badge>
        )}
      </div>
      {compact ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}
            {appointment.title ? ` · ${appointment.title}` : ''}
          </p>
          <p className="text-sm text-muted-foreground">
            {appointment.owner_full_name}
            {appointment.assigned_user_name ? ` · ${appointment.assigned_user_name}` : ''}
          </p>
        </>
      )}
    </button>
  );
}

export function AppointmentsCalendarViews({
  view,
  appointments,
  selectedDate,
  weekStart,
  month,
  staff,
  canWrite,
  query = '',
  waitingRoomByAppointment,
  onSelectAppointment,
  onNavigate,
  onClearSearch,
}: AppointmentsCalendarViewsProps) {
  const today = formatDateParam(new Date());
  const searchActive = query.trim().length > 0;

  if (view === 'day') {
    const dayAppointments = appointments
      .filter((a) => dayKey(a.starts_at) === selectedDate)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    const byAssignee = groupAppointmentsByAssignee(dayAppointments);
    const assignedColumns = staff.filter((member) => (byAssignee[member.userId] ?? []).length > 0);
    const useColumns = assignedColumns.length > 1;
    const unassigned = byAssignee.unassigned ?? [];

    if (dayAppointments.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">
            {searchActive
              ? 'No encontramos turnos para esta búsqueda.'
              : 'No hay turnos para este día.'}
          </p>
          {searchActive && onClearSearch ? (
            <Button type="button" variant="outline" className="mt-4" onClick={onClearSearch}>
              Limpiar búsqueda
            </Button>
          ) : canWrite ? (
            <Button asChild className="mt-4">
              <Link href={`/agenda/nueva?date=${selectedDate}`}>Agendar turno</Link>
            </Button>
          ) : null}
        </div>
      );
    }

    if (useColumns) {
      return (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[640px] gap-3"
            style={{
              gridTemplateColumns: `repeat(${assignedColumns.length + (unassigned.length ? 1 : 0)}, minmax(160px, 1fr))`,
            }}
          >
            {assignedColumns.map((member) => (
              <div key={member.userId} className="space-y-2">
                <p className="truncate text-sm font-semibold">{member.fullName}</p>
                {(byAssignee[member.userId] ?? []).map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    waitingRoomStatus={waitingRoomByAppointment?.[appointment.id]}
                    onSelect={() => onSelectAppointment(appointment)}
                    compact
                  />
                ))}
              </div>
            ))}
            {unassigned.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">Sin asignar</p>
                {unassigned.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    waitingRoomStatus={waitingRoomByAppointment?.[appointment.id]}
                    onSelect={() => onSelectAppointment(appointment)}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    const byHour = DAY_HOURS.map((hour) => ({
      hour,
      items: dayAppointments.filter((a) => hourKey(a.starts_at) === hour),
    })).filter((slot) => slot.items.length > 0);

    const otherHours = dayAppointments.filter((a) => {
      const h = hourKey(a.starts_at);
      return h < 8 || h > 20;
    });

    return (
      <div className="space-y-3">
        {byHour.map((slot) => (
          <div key={slot.hour} className="grid gap-2 sm:grid-cols-[4.5rem_1fr]">
            <p className="pt-3 text-sm font-medium tabular-nums text-muted-foreground">
              {String(slot.hour).padStart(2, '0')}:00
            </p>
            <div className="space-y-2">
              {slot.items.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  waitingRoomStatus={waitingRoomByAppointment?.[appointment.id]}
                  onSelect={() => onSelectAppointment(appointment)}
                />
              ))}
            </div>
          </div>
        ))}
        {otherHours.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Fuera de horario habitual</p>
            {otherHours.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                waitingRoomStatus={waitingRoomByAppointment?.[appointment.id]}
                onSelect={() => onSelectAppointment(appointment)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === 'week') {
    const weekDays = getWeekDays(weekStart);
    return (
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayItems = appointments
              .filter((a) => dayKey(a.starts_at) === day)
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const isSelected = day === selectedDate;
            const isToday = day === today;
            return (
              <div
                key={day}
                className={cn(
                  'min-h-[12rem] rounded-lg border p-2',
                  isSelected && 'border-primary bg-primary/5',
                  isToday && !isSelected && 'border-primary/40'
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      selectedDate: day,
                      weekStart,
                      view: 'day',
                    })
                  }
                  className="mb-2 block w-full rounded px-1 py-0.5 text-left hover:bg-muted/40"
                >
                  <p className="text-[11px] uppercase text-muted-foreground">
                    {formatWeekdayLabel(day)}
                  </p>
                  <p className="text-sm font-semibold">{formatDayLabel(day)}</p>
                </button>
                <div className="space-y-1.5">
                  {dayItems.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">—</p>
                  ) : (
                    dayItems.map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        waitingRoomStatus={waitingRoomByAppointment?.[appointment.id]}
                        onSelect={() => onSelectAppointment(appointment)}
                        compact
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const monthDays = getMonthDays(month);
  const countsByDay = appointments.reduce<Record<string, number>>((acc, appointment) => {
    const day = dayKey(appointment.starts_at);
    acc[day] = (acc[day] ?? 0) + 1;
    return acc;
  }, {});
  const [year, monthNum] = month.split('-').map(Number);
  const monthLabel = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNum - 1, 1, 12)));

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-semibold first-letter:uppercase">{monthLabel}</p>
      {searchActive && appointments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No encontramos turnos para esta búsqueda.</p>
          {onClearSearch ? (
            <Button type="button" variant="outline" className="mt-4" onClick={onClearSearch}>
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted-foreground sm:gap-2">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {monthDays.map((day) => {
          const inMonth = day.startsWith(month);
          const count = countsByDay[day] ?? 0;
          const isSelected = day === selectedDate;
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() =>
                onNavigate({
                  selectedDate: day,
                  weekStart: getWeekStartDate(day),
                  month,
                  view: 'day',
                })
              }
              className={cn(
                'flex min-h-[4rem] flex-col rounded-lg border p-1.5 text-left transition-colors hover:bg-muted/30 sm:min-h-[5rem] sm:p-2',
                !inMonth && 'opacity-40',
                isSelected && 'border-primary bg-primary/5',
                isToday && !isSelected && 'border-primary/40'
              )}
            >
              <span className="text-xs font-semibold sm:text-sm">{Number(day.slice(8))}</span>
              {count > 0 && (
                <div className="mt-auto flex flex-wrap items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-foreground/70"
                    aria-hidden
                  />
                  <span className="text-[10px] text-muted-foreground sm:text-xs">
                    {count} cita{count !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
