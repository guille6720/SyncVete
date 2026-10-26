'use client';

import Link from 'next/link';
import {
  summarizeProfessionalSchedules,
  type ProfessionalSchedule,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface ProfessionalSchedulePanelProps {
  fullName: string;
  specialty?: string | null;
  schedules: ProfessionalSchedule[];
  selectedDate?: string;
  className?: string;
  /** Link to edit hours when none configured. */
  editHref?: string | null;
}

export function ProfessionalSchedulePanel({
  fullName,
  specialty,
  schedules,
  selectedDate,
  className,
  editHref = '/agenda/disponibilidad',
}: ProfessionalSchedulePanelProps) {
  const summary = summarizeProfessionalSchedules(schedules);
  const weekday =
    selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? (() => {
          const [y, m, d] = selectedDate.split('-').map(Number);
          const utc = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
          return utc === 0 ? 7 : utc;
        })()
      : null;
  const todayWindows =
    weekday == null ? [] : summary.filter((row) => row.weekday === weekday);

  return (
    <div
      className={cn(
        'rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm',
        className
      )}
      data-testid="professional-schedule-panel"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-semibold text-foreground">{fullName}</p>
        {specialty ? (
          <p className="text-muted-foreground">· {specialty}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Sin especialidad en la ficha</p>
        )}
      </div>

      {summary.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          No hay días/horarios cargados en la ficha. Cargalos en{' '}
          {editHref ? (
            <Link href={editHref} className="font-medium text-primary underline-offset-2 hover:underline">
              Disponibilidad
            </Link>
          ) : (
            'Disponibilidad'
          )}{' '}
          para restringir turnos a su agenda.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.map((row) => (
              <li
                key={`${row.weekday}-${row.startTime}-${row.endTime}`}
                className={cn(
                  'rounded-md border bg-background px-2.5 py-1 text-xs',
                  weekday === row.weekday
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                <span className="font-medium">{row.label}</span>{' '}
                {row.startTime}–{row.endTime}
                <span className="text-muted-foreground"> · {row.slotDurationMinutes} min</span>
              </li>
            ))}
          </ul>
          {selectedDate && todayWindows.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Ese día no atiende según su ficha. Elegí otro día o otro profesional.
            </p>
          ) : null}
          {selectedDate && todayWindows.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Hoy ({selectedDate}):{' '}
              {todayWindows.map((w) => `${w.startTime}–${w.endTime}`).join(', ')}. Solo se pueden
              dar turnos dentro de estos rangos.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
