'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatDateParam,
  formatDayLabel,
  formatWeekdayLabel,
  getWeekDays,
  getWeekStartDate,
} from '@sincvete/shared';
import type { AgendaViewMode } from '@/components/appointments/appointments-calendar-views';

interface AppointmentsWeekNavProps {
  weekStart: string;
  selectedDate: string;
  countsByDay: Record<string, number>;
  view?: AgendaViewMode;
}

function shiftWeek(weekStart: string, weeks: number): string {
  const [year, month, day] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function shiftDay(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function agendaHref(
  pathname: string,
  searchParams: URLSearchParams,
  patch: Record<string, string | null>
): string {
  const params = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function AppointmentsWeekNav({
  weekStart,
  selectedDate,
  countsByDay,
  view = 'day',
}: AppointmentsWeekNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekDays = getWeekDays(weekStart);
  const today = formatDateParam(new Date());
  const month = selectedDate.slice(0, 7);

  let prevHref: string;
  let nextHref: string;
  if (view === 'month') {
    const prevMonth = shiftMonth(month, -1);
    const nextMonth = shiftMonth(month, 1);
    prevHref = agendaHref(pathname, searchParams, {
      month: prevMonth,
      date: `${prevMonth}-01`,
      view: 'month',
    });
    nextHref = agendaHref(pathname, searchParams, {
      month: nextMonth,
      date: `${nextMonth}-01`,
      view: 'month',
    });
  } else if (view === 'week') {
    const prevWeek = shiftWeek(weekStart, -1);
    const nextWeek = shiftWeek(weekStart, 1);
    prevHref = agendaHref(pathname, searchParams, {
      week: prevWeek,
      date: prevWeek,
      view: 'week',
    });
    nextHref = agendaHref(pathname, searchParams, {
      week: nextWeek,
      date: nextWeek,
      view: 'week',
    });
  } else {
    const prevDay = shiftDay(selectedDate, -1);
    const nextDay = shiftDay(selectedDate, 1);
    prevHref = agendaHref(pathname, searchParams, {
      date: prevDay,
      week: getWeekStartDate(prevDay),
      view: 'day',
    });
    nextHref = agendaHref(pathname, searchParams, {
      date: nextDay,
      week: getWeekStartDate(nextDay),
      view: 'day',
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link href={prevHref} prefetch aria-label="Anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={agendaHref(pathname, searchParams, {
                date: today,
                week: getWeekStartDate(today),
                month: today.slice(0, 7),
              })}
              prefetch
            >
              Hoy
            </Link>
          </Button>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={nextHref} prefetch aria-label="Siguiente">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {view !== 'month' && (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const isSelected = day === selectedDate;
            const isToday = day === today;
            const count = countsByDay[day] ?? 0;

            return (
              <Link
                key={day}
                href={agendaHref(pathname, searchParams, {
                  date: day,
                  week: weekStart,
                  view: view === 'week' ? 'week' : 'day',
                })}
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
      )}
    </div>
  );
}
