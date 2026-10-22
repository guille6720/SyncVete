'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { OwnerProfessionalBooking } from './owner-professional-booking';
import { OwnerPetAvatar } from './owner-pet-avatar';
import type { OwnerProfessionalAvailability } from '@/actions/owner-app';
import {
  APPOINTMENT_STATUS_LABELS,
  formatDashboardDateTime,
  type PortalAppointmentRow,
  type PortalPatientSummary,
} from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function toDateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: `pad-${i}` });
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    cells.push({ date, key: toDateKey(date) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `trail-${cells.length}` });
  }
  return cells;
}

export function OwnerTurnosCalendar({
  availability,
  patients,
  appointments,
  initialProfessionalId,
}: {
  availability: OwnerProfessionalAvailability;
  patients: PortalPatientSummary[];
  appointments: PortalAppointmentRow[];
  initialProfessionalId?: string;
}) {
  const router = useRouter();
  const selected = new Date(`${availability.date}T12:00:00`);
  const [month, setMonth] = useState(() => startOfMonth(selected));

  const apptsByDay = useMemo(() => {
    const map = new Map<string, PortalAppointmentRow[]>();
    for (const appt of appointments) {
      const key = toDateKey(appt.startsAt);
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const petsById = useMemo(
    () => new Map(patients.map((pet) => [pet.id, pet])),
    [patients]
  );

  const minDate = availability.minDate;
  const maxDate = availability.maxDate;
  const cells = buildMonthCells(month);
  const monthLabel = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(month);

  const dayAppointments = apptsByDay.get(availability.date) ?? [];

  const goToDate = (key: string) => {
    const params = new URLSearchParams();
    params.set('date', key);
    if (initialProfessionalId) params.set('professional', initialProfessionalId);
    router.push(`/portal/turnos?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="bg-primary px-4 py-4 text-primary-foreground">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-primary-foreground hover:bg-white/15"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-primary-foreground hover:bg-white/15"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <p className="mt-1 text-center text-xs text-primary-foreground/85">
            Tocá un día para ver o pedir turnos
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1 px-3 pt-3 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 p-3">
          {cells.map((cell) => {
            if (!cell.date) return <div key={cell.key} className="aspect-square" />;
            const key = cell.key;
            const dayAppts = apptsByDay.get(key) ?? [];
            const hasAppt = dayAppts.length > 0;
            const isSelected = key === availability.date;
            const isToday = key === toDateKey(new Date());
            const outOfRange = key < minDate || key > maxDate;

            return (
              <button
                key={cell.key}
                type="button"
                disabled={outOfRange}
                onClick={() => goToDate(key)}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-medium transition',
                  outOfRange && 'cursor-not-allowed opacity-30',
                  !outOfRange && !isSelected && !hasAppt && 'bg-muted/40 hover:bg-primary/10',
                  !outOfRange && !isSelected && hasAppt && 'bg-primary/15 text-primary hover:bg-primary/25',
                  isSelected && 'bg-primary text-primary-foreground shadow-md',
                  isToday && !isSelected && 'ring-2 ring-primary/40'
                )}
              >
                <span>{cell.date.getDate()}</span>
                {hasAppt && (
                  <span
                    className={cn(
                      'mt-0.5 h-1.5 w-1.5 rounded-full',
                      isSelected ? 'bg-primary-foreground' : 'bg-primary'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Con turno
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary/30 ring-2 ring-primary/40" /> Hoy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Día elegido
          </span>
        </div>
      </section>

      {dayAppointments.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold">Tus turnos del día</h3>
          <div className="space-y-2">
            {dayAppointments.map((appt) => {
              const pet = appt.patientId ? petsById.get(appt.patientId) : null;
              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3"
                >
                  <OwnerPetAvatar
                    name={appt.patientName || 'Mascota'}
                    species={pet?.species || 'Otro'}
                    photoUrl={pet?.photoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{appt.patientName || 'Mascota'}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDashboardDateTime(appt.startsAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    {APPOINTMENT_STATUS_LABELS[appt.status]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <OwnerProfessionalBooking
        key={`${availability.date}:${initialProfessionalId || ''}`}
        initialProfessionalId={initialProfessionalId}
        availability={availability}
        patients={patients}
      />
    </div>
  );
}
