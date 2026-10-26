import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import {
  APPOINTMENT_STATUS_LABELS,
  formatDashboardDateTime,
  type AppointmentListRow,
} from '@sincvete/shared';
import { EmptyState, SurfaceCard, SurfaceCardHeader } from '@/components/ui-v2/surface-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AppointmentsSummaryPanel({
  appointments,
  todayLabel,
}: {
  appointments: AppointmentListRow[];
  todayLabel: string;
}) {
  const upcoming = appointments.slice(0, 6);

  return (
    <SurfaceCard padding="md" className="h-full min-w-0">
      <SurfaceCardHeader
        title="Agenda de hoy"
        description={todayLabel}
        className="min-w-0"
        action={
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link href="/agenda">Ver agenda</Link>
          </Button>
        }
      />

      {upcoming.length === 0 ? (
        <EmptyState
          title="Sin turnos para hoy"
          description="Cuando haya citas programadas van a aparecer acá."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-border">
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
      )}
    </SurfaceCard>
  );
}
