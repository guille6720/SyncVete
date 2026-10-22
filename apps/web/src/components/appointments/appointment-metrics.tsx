'use client';

import {
  Calendar,
  CheckCircle2,
  CircleDashed,
  PlayCircle,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import {
  buildAppointmentDayMetrics,
  type AppointmentListRow,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface AppointmentMetricsProps {
  appointments: AppointmentListRow[];
  waitingRoomWaitingCount?: number;
  className?: string;
}

const METRIC_ITEMS = [
  {
    key: 'total' as const,
    label: 'Total',
    icon: Users,
  },
  {
    key: 'programada' as const,
    label: 'Programada',
    icon: CircleDashed,
  },
  {
    key: 'confirmada' as const,
    label: 'Confirmada',
    icon: CheckCircle2,
  },
  {
    key: 'enCurso' as const,
    label: 'En curso',
    icon: PlayCircle,
  },
  {
    key: 'completada' as const,
    label: 'Completada',
    icon: Calendar,
  },
  {
    key: 'inactive' as const,
    label: 'Cancel. / Ausente',
    icon: XCircle,
  },
] as const;

export function AppointmentMetrics({
  appointments,
  waitingRoomWaitingCount,
  className,
}: AppointmentMetricsProps) {
  const metrics = buildAppointmentDayMetrics(appointments);
  const values = {
    total: metrics.total,
    programada: metrics.programada,
    confirmada: metrics.confirmada,
    enCurso: metrics.enCurso,
    completada: metrics.completada,
    inactive: metrics.cancelada + metrics.ausente,
  };

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      role="group"
      aria-label="Métricas del día"
    >
      {METRIC_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className="flex min-w-[7.5rem] shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </p>
              <p className="text-lg font-semibold tabular-nums leading-tight">{values[item.key]}</p>
            </div>
          </div>
        );
      })}
      {typeof waitingRoomWaitingCount === 'number' && (
        <div className="flex min-w-[7.5rem] shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <UserX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              En espera (SE)
            </p>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {waitingRoomWaitingCount}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
