'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarDays, Clock } from 'lucide-react';
import { listAppointments } from '@/actions/appointments';
import {
  APPOINTMENT_STATUS_LABELS,
  formatDashboardDateTime,
  formatDateParam,
  type AppointmentListRow,
} from '@sincvete/shared';
import { EmptyState, SurfaceCard, SurfaceCardHeader } from '@/components/ui-v2/surface-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const POLL_MS = 12_000;

function isPendingAppointment(row: AppointmentListRow): boolean {
  return row.status !== 'cancelada' && row.status !== 'ausente' && row.status !== 'completada';
}

function filterToday(rows: AppointmentListRow[], today: string): AppointmentListRow[] {
  return rows
    .filter((row) => formatDateParam(new Date(row.starts_at)) === today)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

export function AppointmentsSummaryPanel({
  appointments: initialAppointments,
  todayLabel,
  today,
  weekStart,
  showAlert = false,
}: {
  appointments: AppointmentListRow[];
  todayLabel: string;
  today: string;
  weekStart: string;
  /** Campanita/reloj para usuarios invitados con turnos pendientes. */
  showAlert?: boolean;
}) {
  const [appointments, setAppointments] = useState(initialAppointments);

  useEffect(() => {
    setAppointments(initialAppointments);
  }, [initialAppointments]);

  const refresh = useCallback(async () => {
    try {
      const rows = await listAppointments({ weekStart });
      setAppointments(filterToday(rows, today));
    } catch (error) {
      console.error('[dashboard agenda] refresh failed', error);
    }
  }, [today, weekStart]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const onFocus = () => {
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const upcoming = appointments.slice(0, 6);
  const pendingCount = appointments.filter(isPendingAppointment).length;
  const showBlink = showAlert && pendingCount > 0;
  const alertLabel =
    pendingCount === 1 ? '1 turno pendiente' : `${pendingCount} turnos pendientes`;

  return (
    <SurfaceCard padding="md" className="h-full min-w-0">
      <SurfaceCardHeader
        title="Agenda de hoy"
        description={todayLabel}
        className="min-w-0"
        action={
          <div className="flex shrink-0 items-center gap-2">
            {showBlink ? (
              <Link
                href="/consultas"
                className={cn(
                  'sv-consultas-alert-blink inline-flex items-center gap-1.5 rounded-lg border border-amber-400',
                  'bg-amber-50 px-2.5 py-1.5 text-amber-950',
                  'dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-50'
                )}
                title={alertLabel}
                aria-label={alertLabel}
              >
                <Bell className="h-4 w-4" aria-hidden />
                <span className="text-xs font-bold tabular-nums">{pendingCount}</span>
              </Link>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/agenda">Ver agenda</Link>
            </Button>
          </div>
        }
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Sin turnos para hoy"
          description="Cuando haya citas programadas van a aparecer acá."
          className="py-8"
        />
      ) : (
        <div className="flex min-w-0 items-stretch gap-3">
          <ul className="min-w-0 flex-1 divide-y divide-border">
            {upcoming.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--clinic-soft)] text-primary">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.patient_name}
                    </p>
                    <Badge variant="default" className="text-[10px]">
                      {APPOINTMENT_STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDashboardDateTime(row.starts_at)}
                    {row.owner_full_name ? ` · ${row.owner_full_name}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {showBlink ? (
            <Link
              href="/consultas"
              className={cn(
                'sv-consultas-alert-blink flex w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 self-stretch',
                'rounded-xl border border-amber-400 bg-amber-50 px-2 py-3 text-center text-amber-950',
                'dark:border-amber-400 dark:bg-amber-950/45 dark:text-amber-50',
                'sm:w-28'
              )}
              aria-live="polite"
              aria-label={alertLabel}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50">
                <Clock className="h-5 w-5" aria-hidden />
              </span>
              <Bell className="h-4 w-4" aria-hidden />
              <p className="text-[11px] font-semibold leading-tight">{alertLabel}</p>
            </Link>
          ) : null}
        </div>
      )}
    </SurfaceCard>
  );
}
