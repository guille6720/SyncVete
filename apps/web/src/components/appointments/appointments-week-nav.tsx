'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatDateParam,
  formatDayLabel,
  formatWeekdayLabel,
  getWeekDays,
  getWeekStartDate,
  shiftAgendaDay,
  shiftAgendaMonth,
  shiftAgendaWeek,
} from '@sincvete/shared';
import type { AgendaViewMode } from '@/components/appointments/appointments-calendar-views';
import type { AgendaNavigatePatch } from '@/components/appointments/agenda-types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AppointmentsWeekNavProps {
  weekStart: string;
  selectedDate: string;
  countsByDay: Record<string, number>;
  view?: AgendaViewMode;
  onNavigate: (patch: AgendaNavigatePatch) => void;
}

export function AppointmentsWeekNav({
  weekStart,
  selectedDate,
  countsByDay,
  view = 'day',
  onNavigate,
}: AppointmentsWeekNavProps) {
  const weekDays = getWeekDays(weekStart);
  const today = formatDateParam(new Date());
  const month = selectedDate.slice(0, 7);

  const goPrev = () => {
    if (view === 'month') {
      const prevMonth = shiftAgendaMonth(month, -1);
      onNavigate({
        month: prevMonth,
        selectedDate: `${prevMonth}-01`,
        weekStart: getWeekStartDate(`${prevMonth}-01`),
        view: 'month',
      });
      return;
    }
    if (view === 'week') {
      const prevWeek = shiftAgendaWeek(weekStart, -1);
      onNavigate({
        weekStart: prevWeek,
        selectedDate: prevWeek,
        month: prevWeek.slice(0, 7),
        view: 'week',
      });
      return;
    }
    const prevDay = shiftAgendaDay(selectedDate, -1);
    onNavigate({
      selectedDate: prevDay,
      weekStart: getWeekStartDate(prevDay),
      month: prevDay.slice(0, 7),
      view: 'day',
    });
  };

  const goNext = () => {
    if (view === 'month') {
      const nextMonth = shiftAgendaMonth(month, 1);
      onNavigate({
        month: nextMonth,
        selectedDate: `${nextMonth}-01`,
        weekStart: getWeekStartDate(`${nextMonth}-01`),
        view: 'month',
      });
      return;
    }
    if (view === 'week') {
      const nextWeek = shiftAgendaWeek(weekStart, 1);
      onNavigate({
        weekStart: nextWeek,
        selectedDate: nextWeek,
        month: nextWeek.slice(0, 7),
        view: 'week',
      });
      return;
    }
    const nextDay = shiftAgendaDay(selectedDate, 1);
    onNavigate({
      selectedDate: nextDay,
      weekStart: getWeekStartDate(nextDay),
      month: nextDay.slice(0, 7),
      view: 'day',
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" type="button" onClick={goPrev} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() =>
              onNavigate({
                selectedDate: today,
                weekStart: getWeekStartDate(today),
                month: today.slice(0, 7),
              })
            }
          >
            Hoy
          </Button>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={goNext} aria-label="Siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {view !== 'month' && (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const isSelected = day === selectedDate;
            const isToday = day === today;
            const count = countsByDay[day] ?? 0;

            return (
              <button
                key={day}
                type="button"
                onClick={() =>
                  onNavigate({
                    selectedDate: day,
                    weekStart,
                    view: view === 'week' ? 'week' : 'day',
                  })
                }
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
