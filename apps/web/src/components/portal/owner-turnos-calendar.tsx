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
import { ownerAppNeonCard, ownerAppNeonToneAt } from './owner-app-neon';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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
  const startOffset = (first.getDay() + 6) % 7;
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

  const petsById = useMemo(() => new Map(patients.map((pet) => [pet.id, pet])), [patients]);

  const minDate = availability.minDate;
  const maxDate = availability.maxDate;
  const cells = buildMonthCells(month);
  const monthLabel = new Intl.DateTimeFormat('es-AR', {
    month: 'short',
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
    <div className="space-y-4">
      <section
        className={ownerAppNeonCard(
          'cyan',
          'mx-auto w-full max-w-[17.5rem] overflow-hidden rounded-2xl'
        )}
      >
        <div className="bg-primary px-2.5 py-2 text-primary-foreground">
          <div className="flex items-center justify-between gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary-foreground hover:bg-white/15"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary-foreground hover:bg-white/15"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-2 pt-2 text-center text-[10px] font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-0.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 p-2">
          {cells.map((cell) => {
            if (!cell.date) return <div key={cell.key} className="h-7" />;
            const key = cell.key;
            const hasAppt = (apptsByDay.get(key) ?? []).length > 0;
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
                  'relative flex h-7 flex-col items-center justify-center rounded-md text-[11px] font-medium transition',
                  outOfRange && 'cursor-not-allowed opacity-30',
                  !outOfRange &&
                    !isSelected &&
                    !hasAppt &&
                    'bg-muted/50 hover:bg-primary/10 dark:bg-muted/30',
                  !outOfRange &&
                    !isSelected &&
                    hasAppt &&
                    'bg-primary/15 text-primary hover:bg-primary/25',
                  isSelected && 'bg-primary text-primary-foreground shadow-sm',
                  isToday && !isSelected && 'ring-1 ring-primary/50'
                )}
              >
                <span>{cell.date.getDate()}</span>
                {hasAppt && (
                  <span
                    className={cn(
                      'absolute bottom-0.5 h-1 w-1 rounded-full',
                      isSelected ? 'bg-primary-foreground' : 'bg-primary'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-center gap-3 border-t border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Turno
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full ring-1 ring-primary" /> Hoy
          </span>
        </div>
      </section>

      {dayAppointments.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Tus turnos del día</h3>
          <div className="space-y-2">
            {dayAppointments.map((appt, index) => {
              const pet = appt.patientId ? petsById.get(appt.patientId) : null;
              return (
                <div
                  key={appt.id}
                  className={ownerAppNeonCard(
                    ownerAppNeonToneAt(index + 2),
                    'flex items-center gap-3 rounded-2xl p-3'
                  )}
                >
                  <OwnerPetAvatar
                    name={appt.patientName || 'Mascota'}
                    species={pet?.species || 'Otro'}
                    photoUrl={pet?.photoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{appt.patientName || 'Mascota'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDashboardDateTime(appt.startsAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
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
