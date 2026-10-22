'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { listWaitingRoom } from '@/actions/waiting-room';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import {
  playWaitingRoomTvChimesOnRefresh,
  readWaitingRoomTvMuted,
  writeWaitingRoomTvMuted,
} from '@/lib/waiting-room-chime';
import { WaitingRoomBranchFilter } from '@/components/waiting-room/waiting-room-branch-filter';
import {
  APP_NAME,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  formatAppointmentTime,
  formatWaitMinutes,
  minutesBetween,
  type WaitingRoomListRow,
} from '@sincvete/shared';

interface WaitingRoomDisplayProps {
  initialEntries: WaitingRoomListRow[];
  clinicName: string;
  branchName: string | null;
  today: string;
  listBranchId?: string | 'all';
  branchOptions?: Array<{ id: string; name: string }>;
  sessionBranchId?: string | null;
  initialBranchFilter?: string | 'all' | null;
  receptionHref?: string;
}

export function WaitingRoomDisplay({
  initialEntries,
  clinicName,
  branchName,
  today,
  listBranchId,
  branchOptions = [],
  sessionBranchId = null,
  initialBranchFilter,
  receptionHref = '/sala-espera',
}: WaitingRoomDisplayProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashKind, setFlashKind] = useState<'called' | 'payment' | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(readWaitingRoomTvMuted());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listWaitingRoom({ date: today, branchId: listBranchId });
      setEntries((prev) => {
        const transition = playWaitingRoomTvChimesOnRefresh(prev, next);
        if (transition === 'called') {
          const row = next.find(
            (item) =>
              item.waiting_room_status === 'called' &&
              !prev.some(
                (p) =>
                  p.waiting_room_entry_id === item.waiting_room_entry_id &&
                  p.waiting_room_status === 'called'
              )
          );
          if (row) {
            setFlashId(row.waiting_room_entry_id);
            setFlashKind('called');
          }
        } else if (transition === 'payment') {
          const row = next.find(
            (item) =>
              item.waiting_room_status === 'payment_pending' &&
              !prev.some(
                (p) =>
                  p.waiting_room_entry_id === item.waiting_room_entry_id &&
                  p.waiting_room_status === 'payment_pending'
              )
          );
          if (row) {
            setFlashId(row.waiting_room_entry_id);
            setFlashKind('payment');
          }
        }
        return next;
      });
    } catch (error) {
      console.error('[waiting-room display] refresh failed', error);
    }
  }, [listBranchId, today]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = new Date();
      setClock(formatClock(current));
      setNow(current);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const id = window.setTimeout(() => {
      setFlashId(null);
      setFlashKind(null);
    }, 8000);
    return () => window.clearTimeout(id);
  }, [flashId]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeWaitingRoomTvMuted(next);
  };

  const called = useMemo(
    () => entries.filter((row) => row.waiting_room_status === 'called'),
    [entries]
  );
  const waiting = useMemo(
    () => entries.filter((row) => row.waiting_room_status === 'waiting'),
    [entries]
  );
  const inConsultation = useMemo(
    () => entries.filter((row) => row.waiting_room_status === 'in_consultation'),
    [entries]
  );
  const paymentPending = useMemo(
    () => entries.filter((row) => row.waiting_room_status === 'payment_pending'),
    [entries]
  );

  const headline = called[0] ?? null;

  return (
    <div className="waiting-room-display relative flex min-h-dvh flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--clinic)_22%,transparent),transparent_55%),linear-gradient(180deg,#0b1220_0%,#102018_48%,#0b1220_100%)] text-slate-50">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 py-5 md:px-10">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-200/80">{APP_NAME}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            {clinicName}
          </h1>
          <p className="mt-1 text-base text-slate-300 md:text-lg">
            Sala de espera{branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums md:text-6xl">
            {clock}
          </p>
          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
              aria-pressed={muted}
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {muted ? 'Silencio' : 'Sonido'}
            </button>
            <Link
              href={receptionHref}
              className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
            >
              Volver a recepción
            </Link>
          </div>
        </div>
      </header>

      {branchOptions.length > 1 && (
        <div className="flex justify-center border-b border-white/10 px-6 py-3 md:px-10">
          <WaitingRoomBranchFilter
            branchOptions={branchOptions}
            sessionBranchId={sessionBranchId}
            branchFilter={initialBranchFilter}
            variant="dark"
          />
        </div>
      )}

      <main className="grid flex-1 gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:gap-8 md:p-10">
        <section
          className={`flex flex-col justify-center rounded-3xl border px-6 py-10 transition-colors duration-500 md:px-10 ${
            headline
              ? 'border-emerald-300/40 bg-emerald-400/10 shadow-[0_0_80px_-20px_rgba(52,211,153,0.55)]'
              : 'border-white/10 bg-white/5'
          } ${flashId && headline?.waiting_room_entry_id === flashId ? 'animate-pulse' : ''}`}
        >
          <p className="text-sm uppercase tracking-[0.28em] text-emerald-200/90">Ahora llamado</p>
          {headline ? (
            <>
              <p className="mt-4 font-display text-5xl font-semibold leading-tight md:text-7xl">
                {SPECIES_EMOJI[headline.patient_species]} {headline.patient_name}
              </p>
              <p className="mt-4 text-2xl text-slate-200 md:text-3xl">
                {headline.room ? `Consultorio ${headline.room}` : 'Acercate a recepción'}
              </p>
              {called.length > 1 && (
                <ul className="mt-8 space-y-2 text-xl text-slate-300">
                  {called.slice(1).map((row) => (
                    <li key={row.waiting_room_entry_id}>
                      También: {SPECIES_EMOJI[row.patient_species]} {row.patient_name}
                      {row.room ? ` · ${row.room}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-6 font-display text-4xl text-slate-400 md:text-5xl">
              Esperá tu llamado
            </p>
          )}
        </section>

        <section className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 md:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-lg uppercase tracking-[0.18em] text-slate-300">En espera</h2>
              <span className="text-sm text-slate-400">{waiting.length}</span>
            </div>
            {waiting.length === 0 ? (
              <p className="text-xl text-slate-500">Sin pacientes en cola</p>
            ) : (
              <ol className="space-y-3">
                {waiting.slice(0, 8).map((row, index) => (
                  <li
                    key={row.waiting_room_entry_id}
                    className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 text-xl last:border-0"
                  >
                    <span className="tabular-nums text-slate-400">{index + 1}.</span>
                    <span className="flex-1 font-medium">
                      {SPECIES_EMOJI[row.patient_species]} {row.patient_name}
                    </span>
                    <span className="text-right text-base tabular-nums text-slate-400">
                      <span className="block">{formatWaitMinutes(minutesBetween(row.checked_in_at, now))}</span>
                      <span className="block text-xs text-slate-500">
                        turno {formatAppointmentTime(row.appointment_starts_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {inConsultation.length > 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 md:p-6">
              <h2 className="mb-4 text-lg uppercase tracking-[0.18em] text-slate-300">
                En atención
              </h2>
              <ul className="space-y-3 text-xl">
                {inConsultation.slice(0, 6).map((row) => (
                  <li key={row.waiting_room_entry_id} className="flex justify-between gap-3">
                    <span>
                      {SPECIES_EMOJI[row.patient_species]} {row.patient_name}
                    </span>
                    <span className="text-base text-slate-400">
                      {row.room ? row.room : WAITING_ROOM_STATUS_LABELS[row.waiting_room_status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {paymentPending.length > 0 && (
            <div
              className={`rounded-3xl border p-5 md:p-6 ${
                flashKind === 'payment' &&
                paymentPending.some((row) => row.waiting_room_entry_id === flashId)
                  ? 'animate-pulse border-amber-300/50 bg-amber-400/10'
                  : 'border-amber-300/30 bg-amber-400/5'
              }`}
            >
              <h2 className="mb-4 text-lg uppercase tracking-[0.18em] text-amber-200/90">
                Pago pendiente
              </h2>
              <ul className="space-y-3 text-xl">
                {paymentPending.slice(0, 6).map((row) => (
                  <li key={row.waiting_room_entry_id} className="flex justify-between gap-3">
                    <span>
                      {SPECIES_EMOJI[row.patient_species]} {row.patient_name}
                    </span>
                    <span className="text-base text-amber-200/80">
                      {row.room ? row.room : 'Acercate a caja'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
