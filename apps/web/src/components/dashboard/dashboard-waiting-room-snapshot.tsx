'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, MonitorPlay, Users } from 'lucide-react';
import { listWaitingRoom } from '@/actions/waiting-room';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import {
  WAITING_ROOM_STATUS_LABELS,
  buildWaitingRoomDashboard,
  formatWaitMinutes,
  type WaitingRoomListRow,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const STATUS_BAR_CLASS = {
  waiting: 'bg-sky-500',
  called: 'bg-amber-500',
  in_consultation: 'bg-teal-500',
  payment_pending: 'bg-orange-500',
  completed: 'bg-emerald-500',
} as const;

interface DashboardWaitingRoomSnapshotProps {
  initialEntries: WaitingRoomListRow[];
  pendingCheckInCount: number;
  today: string;
  listBranchId?: string;
}

export function DashboardWaitingRoomSnapshot({
  initialEntries,
  pendingCheckInCount,
  today,
  listBranchId,
}: DashboardWaitingRoomSnapshotProps) {
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({ date: today, branchId: listBranchId });
      setEntries(next);
    } catch (error) {
      console.error('[dashboard waiting-room] refresh failed', error);
    }
  }, [listBranchId, today]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  const summary = useMemo(
    () => buildWaitingRoomDashboard(entries, { pendingCheckInCount }),
    [entries, pendingCheckInCount]
  );

  const totalForBars = Math.max(summary.totalToday, 1);
  const hasActivity = summary.inFlowCount > 0 || summary.pendingCheckInCount > 0;

  return (
    <section className="rounded-xl border border-teal-200/70 bg-card/95 p-5 text-card-foreground shadow-sm backdrop-blur-sm dark:border-teal-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Sala de espera</h2>
            <p className="text-sm text-muted-foreground">
              {hasActivity
                ? `${summary.inFlowCount} en flujo · ${summary.pendingCheckInCount} sin check-in`
                : 'Sin pacientes en cola hoy'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" size="sm" asChild>
            <Link href="/sala-espera">Gestionar</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/sala-espera/tablero" target="_blank" rel="noreferrer">
              <LayoutDashboard className="h-4 w-4" />
              Tablero
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/sala-espera/pantalla" target="_blank" rel="noreferrer">
              <MonitorPlay className="h-4 w-4" />
              TV
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotMetric label="En flujo" value={String(summary.inFlowCount)} />
        <SnapshotMetric
          label="Espera promedio"
          value={formatWaitMinutes(summary.avgWaitMinutes)}
        />
        <SnapshotMetric label="Llamados" value={String(summary.calledCount)} />
        <SnapshotMetric
          label="Completados"
          value={String(summary.completedCount)}
          hint={`${summary.totalToday} ingresos`}
        />
      </div>

      {summary.totalToday > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {summary.countsByStatus.map((item) =>
              item.count > 0 ? (
                <div
                  key={item.status}
                  className={cn('transition-all', STATUS_BAR_CLASS[item.status])}
                  style={{ width: `${(item.count / totalForBars) * 100}%` }}
                  title={`${WAITING_ROOM_STATUS_LABELS[item.status]}: ${item.count}`}
                />
              ) : null
            )}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summary.countsByStatus
              .filter((item) => item.count > 0)
              .map((item) => (
                <li key={item.status} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      STATUS_BAR_CLASS[item.status]
                    )}
                  />
                  {WAITING_ROOM_STATUS_LABELS[item.status]} {item.count}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SnapshotMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
