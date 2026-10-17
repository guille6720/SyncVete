'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  TOUR_TARGETS,
  formatDateParam,
  formatDayLabel,
  formatWeekdayLabel,
  getWeekDays,
  getWeekStartDate,
} from '@sincvete/shared';

interface AppointmentsWeekNavProps {
  weekStart: string;
  selectedDate: string;
  countsByDay: Record<string, number>;
}

function shiftWeek(weekStart: string, weeks: number): string {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function agendaHref(
  pathname: string,
  searchParams: URLSearchParams,
  date: string,
  week?: string
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('date', date);
  if (week) params.set('week', week);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function AppointmentsWeekNav({
  weekStart,
  selectedDate,
  countsByDay,
}: AppointmentsWeekNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekDays = getWeekDays(weekStart);
  const today = formatDateParam(new Date());
  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  return (
    <div className="space-y-3" data-tour={TOUR_TARGETS.AGENDA_WEEK_NAV}>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={agendaHref(pathname, searchParams, selectedDate, prevWeek)}
            prefetch
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={agendaHref(pathname, searchParams, today, getWeekStartDate(today))}
              prefetch
              data-tour={TOUR_TARGETS.AGENDA_WEEK_NAV_TODAY}
            >
              Hoy
            </Link>
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={agendaHref(pathname, searchParams, selectedDate, nextWeek)}
            prefetch
            aria-label="Siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const isSelected = day === selectedDate;
          const isToday = day === today;
          const count = countsByDay[day] ?? 0;

          return (
            <Link
              key={day}
              href={agendaHref(pathname, searchParams, day, weekStart)}
              prefetch
              className={cn(
                'rounded-lg border px-2 py-3 text-center transition-colors hover:bg-accent',
                isSelected && 'border-primary bg-primary/5',
                isToday && !isSelected && 'border-primary/40'
              )}
            >
              <p className="text-xs uppercase text-muted-foreground">{formatWeekdayLabel(day)}</p>
              <p className="text-sm font-semibold">{formatDayLabel(day)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {count} cita{count !== 1 ? 's' : ''}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
