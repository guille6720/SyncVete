'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listWaitingRoom } from '@/actions/waiting-room';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import {
  WAITING_ROOM_STATUS_LABELS,
  buildWaitingRoomDashboard,
  formatWaitMinutes,
  type WaitingRoomListRow,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

const STATUS_BAR_CLASS: Record<WaitingRoomStatus, string> = {
  waiting: 'bg-sky-500',
  called: 'bg-amber-500',
  in_consultation: 'bg-teal-500',
  payment_pending: 'bg-orange-500',
  completed: 'bg-emerald-500',
};

interface WaitingRoomOpsDashboardProps {
  entries: WaitingRoomListRow[];
  pendingCheckInCount: number;
  today?: string;
  variant?: 'light' | 'dark';
  showTitle?: boolean;
  mineOnly?: boolean;
  assignedUserId?: string | null;
  listBranchId?: string | 'all';
}

export function WaitingRoomOpsDashboard({
  entries: initialEntries,
  pendingCheckInCount,
  today,
  variant = 'light',
  showTitle = true,
  mineOnly = false,
  assignedUserId = null,
  listBranchId,
}: WaitingRoomOpsDashboardProps) {
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const filterEntries = useCallback(
    (rows: WaitingRoomListRow[]) =>
      mineOnly && assignedUserId
        ? rows.filter((row) => row.assigned_user_id === assignedUserId)
        : rows,
    [assignedUserId, mineOnly]
  );

  const refresh = useCallback(async () => {
    if (!today) return;
    try {
      const next = await listWaitingRoom({ date: today, branchId: listBranchId });
      setEntries(filterEntries(next));
    } catch (error) {
      console.error('[waiting-room ops dashboard] refresh failed', error);
    }
  }, [filterEntries, listBranchId, today]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  const summary = useMemo(
    () => buildWaitingRoomDashboard(entries, { pendingCheckInCount }),
    [entries, pendingCheckInCount]
  );

  const totalForBars = Math.max(summary.totalToday, 1);
  const dark = variant === 'dark';

  return (
    <section
      className={cn(
        'space-y-5',
        !dark &&
          showTitle &&
          'rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/80 via-background to-sky-50/50 p-5 dark:border-teal-900 dark:from-teal-950/40 dark:via-background dark:to-sky-950/20'
      )}
    >
      {showTitle && (
        <div>
          <h2
            className={cn(
              'text-lg font-semibold tracking-tight',
              dark && 'font-display text-2xl text-white md:text-3xl'
            )}
          >
            Tablero del día
          </h2>
          <p className={cn('text-sm', dark ? 'text-slate-300' : 'text-muted-foreground')}>
            Vista operativa de la cola · tiempos y estados en vivo
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          dark={dark}
          label="En flujo"
          value={String(summary.inFlowCount)}
          hint={`${summary.pendingCheckInCount} pendientes de check-in`}
        />
        <Metric
          dark={dark}
          label="Espera promedio"
          value={formatWaitMinutes(summary.avgWaitMinutes)}
          hint={
            summary.longestWaitPatientName
              ? `Más tiempo: ${summary.longestWaitPatientName} (${formatWaitMinutes(summary.longestWaitMinutes)})`
              : 'Sin pacientes en espera'
          }
        />
        <Metric
          dark={dark}
          label="Hasta el llamado"
          value={formatWaitMinutes(summary.avgTimeToCallMinutes)}
          hint="Promedio check-in → llamado"
        />
        <Metric
          dark={dark}
          label="Completados"
          value={String(summary.completedCount)}
          hint={`${summary.totalToday} ingresos hoy`}
        />
      </div>

      <div className="space-y-3">
        <div
          className={cn(
            'flex h-3 overflow-hidden rounded-full',
            dark ? 'bg-white/10' : 'bg-muted'
          )}
        >
          {summary.countsByStatus.map((item) =>
            item.count > 0 ? (
              <div
                key={item.status}
                className={`${STATUS_BAR_CLASS[item.status]} transition-all`}
                style={{ width: `${(item.count / totalForBars) * 100}%` }}
                title={`${WAITING_ROOM_STATUS_LABELS[item.status]}: ${item.count}`}
              />
            ) : null
          )}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {summary.countsByStatus.map((item) => (
            <li
              key={item.status}
              className={cn(
                'flex items-center gap-2',
                dark ? 'text-slate-300' : 'text-muted-foreground'
              )}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_BAR_CLASS[item.status]}`}
              />
              <span>
                {WAITING_ROOM_STATUS_LABELS[item.status]}{' '}
                <span className={cn('font-medium', dark ? 'text-white' : 'text-foreground')}>
                  {item.count}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  dark,
}: {
  label: string;
  value: string;
  hint: string;
  dark: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3',
        dark ? 'border-white/10 bg-white/10' : 'bg-card/80'
      )}
    >
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-wide',
          dark ? 'text-slate-400' : 'text-muted-foreground'
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tracking-tight tabular-nums',
          dark ? 'text-white md:text-4xl' : undefined
        )}
      >
        {value}
      </p>
      <p className={cn('mt-1 text-xs', dark ? 'text-slate-400' : 'text-muted-foreground')}>
        {hint}
      </p>
    </div>
  );
}
