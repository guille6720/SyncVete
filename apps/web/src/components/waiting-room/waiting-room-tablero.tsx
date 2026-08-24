'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listWaitingRoom } from '@/actions/waiting-room';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import { WaitingRoomOpsDashboard } from '@/components/waiting-room/waiting-room-ops-dashboard';
import { APP_NAME, type WaitingRoomListRow } from '@sincvete/shared';

interface WaitingRoomTableroProps {
  initialEntries: WaitingRoomListRow[];
  pendingCheckInCount: number;
  clinicName: string;
  branchName: string | null;
  today: string;
}

export function WaitingRoomTablero({
  initialEntries,
  pendingCheckInCount,
  clinicName,
  branchName,
  today,
}: WaitingRoomTableroProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({ date: today });
      setEntries(next);
    } catch (error) {
      console.error('[waiting-room tablero] refresh failed', error);
    }
  }, [today]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--clinic)_18%,transparent),transparent_55%),linear-gradient(180deg,#0b1220_0%,#13241c_50%,#0b1220_100%)] text-slate-50">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 py-5 md:px-10">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-200/80">{APP_NAME}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Tablero operativo
          </h1>
          <p className="mt-1 text-base text-slate-300 md:text-lg">
            {clinicName}
            {branchName ? ` · ${branchName}` : ''} · {today}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums md:text-6xl">{clock}</p>
          <Link
            href="/sala-espera"
            className="mt-2 inline-block text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
          >
            Volver a recepción
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center p-6 md:p-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
          <WaitingRoomOpsDashboard
            entries={entries}
            pendingCheckInCount={pendingCheckInCount}
            variant="dark"
          />
        </div>
      </main>
    </div>
  );
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
