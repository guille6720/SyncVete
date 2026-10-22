'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, QrCode, Search, X } from 'lucide-react';
import {
  checkInAppointment,
  createAppointmentCheckInToken,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { listAppointments } from '@/actions/appointments';
import { Button } from '@/components/ui/button';
import { useWaitingRoomLive } from '@/hooks/use-waiting-room-live';
import { WaitingRoomBranchFilter } from '@/components/waiting-room/waiting-room-branch-filter';
import {
  APP_NAME,
  APPOINTMENT_TYPE_LABELS,
  SPECIES_EMOJI,
  filterAppointmentsByWaitingRoomBranch,
  formatAppointmentTime,
  formatDateParam,
  getWeekStartDate,
  type AppointmentListRow,
} from '@sincvete/shared';

interface WaitingRoomKioskProps {
  initialCandidates: AppointmentListRow[];
  clinicName: string;
  branchName: string | null;
  today: string;
  listBranchId?: string | 'all';
  branchOptions?: Array<{ id: string; name: string }>;
  sessionBranchId?: string | null;
  initialBranchFilter?: string | 'all' | null;
  receptionHref?: string;
}

type KioskView =
  | { kind: 'list' }
  | { kind: 'success'; patientName: string; queuePosition: number | null }
  | {
      kind: 'qr';
      appointment: AppointmentListRow;
      dataUrl: string;
      url: string;
      expiresAt: string;
    };

export function WaitingRoomKiosk({
  initialCandidates,
  clinicName,
  branchName,
  today,
  listBranchId,
  branchOptions = [],
  sessionBranchId = null,
  initialBranchFilter,
  receptionHref = '/sala-espera',
}: WaitingRoomKioskProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<KioskView>({ kind: 'list' });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatClock(new Date()));

  const refresh = useCallback(async () => {
    try {
      const weekStart = getWeekStartDate(today);
      const [entries, weekAppointments] = await Promise.all([
        listWaitingRoom({ date: today, branchId: listBranchId }),
        listAppointments({ weekStart }),
      ]);
      const checkedInIds = new Set(entries.map((row) => row.appointment_id));
      const branchAppointments = filterAppointmentsByWaitingRoomBranch(
        weekAppointments,
        listBranchId
      );
      const next = branchAppointments.filter((appointment) => {
        if (checkedInIds.has(appointment.id)) return false;
        const day = formatDateParam(new Date(appointment.starts_at));
        if (day !== today) return false;
        return (
          appointment.status === 'programada' ||
          appointment.status === 'confirmada' ||
          appointment.status === 'en_curso'
        );
      });
      setCandidates(next);
    } catch (err) {
      console.error('[waiting-room kiosk] refresh failed', err);
    }
  }, [listBranchId, today]);

  useWaitingRoomLive(() => {
    void refresh();
  });

  useEffect(() => {
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (view.kind !== 'list') return;
    const id = window.setInterval(() => {
      void refresh();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [refresh, view.kind]);

  useEffect(() => {
    if (view.kind !== 'success') return;
    const id = window.setTimeout(() => {
      setView({ kind: 'list' });
      setQuery('');
      void refresh();
    }, 6000);
    return () => window.clearTimeout(id);
  }, [view, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...candidates].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );
    if (!q) return sorted;
    return sorted.filter((appointment) => {
      const haystack = [
        appointment.patient_name,
        appointment.owner_full_name,
        APPOINTMENT_TYPE_LABELS[appointment.appointment_type],
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [candidates, query]);

  const doCheckIn = async (appointment: AppointmentListRow) => {
    setError(null);
    setPendingId(appointment.id);
    try {
      const result = await checkInAppointment(appointment.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'No se pudo hacer check-in');
        return;
      }
      setView({
        kind: 'success',
        patientName: appointment.patient_name,
        queuePosition: result.data.queue_position,
      });
      setCandidates((prev) => prev.filter((row) => row.id !== appointment.id));
    } finally {
      setPendingId(null);
    }
  };

  const showQr = async (appointment: AppointmentListRow) => {
    setError(null);
    setPendingId(appointment.id);
    try {
      const result = await createAppointmentCheckInToken(appointment.id);
      if (!result.success || !result.data) {
        setError(result.error ?? 'No se pudo generar el QR');
        return;
      }
      const dataUrl = await QRCode.toDataURL(result.data.url, {
        margin: 1,
        width: 320,
        errorCorrectionLevel: 'M',
      });
      setView({
        kind: 'qr',
        appointment,
        dataUrl,
        url: result.data.url,
        expiresAt: result.data.expires_at,
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--clinic)_18%,transparent),transparent_55%),linear-gradient(180deg,#0b1220_0%,#13241c_50%,#0b1220_100%)] text-slate-50">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 py-5 md:px-10">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-200/80">{APP_NAME}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Check-in
          </h1>
          <p className="mt-1 text-base text-slate-300 md:text-lg">
            {clinicName}
            {branchName ? ` · ${branchName}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl font-semibold tabular-nums md:text-6xl">{clock}</p>
          <Link
            href={receptionHref}
            className="mt-2 inline-block text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
          >
            Volver a recepción
          </Link>
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

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 md:p-10">
        {view.kind === 'success' ? (
          <SuccessPanel
            patientName={view.patientName}
            queuePosition={view.queuePosition}
            onDone={() => {
              setView({ kind: 'list' });
              setQuery('');
              void refresh();
            }}
          />
        ) : view.kind === 'qr' ? (
          <QrPanel
            appointment={view.appointment}
            dataUrl={view.dataUrl}
            url={view.url}
            expiresAt={view.expiresAt}
            onBack={() => setView({ kind: 'list' })}
            onCheckIn={() => void doCheckIn(view.appointment)}
            pending={pendingId === view.appointment.id}
          />
        ) : (
          <>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscá por mascota o tutor…"
                autoComplete="off"
                className="h-16 w-full rounded-2xl border border-white/15 bg-white/10 pl-14 pr-4 text-xl text-white outline-none placeholder:text-slate-400 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-400/30"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-center text-red-100">
                {error}
              </p>
            )}

            {filtered.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-16 text-center">
                <p className="font-display text-3xl text-slate-300">
                  {query.trim()
                    ? 'No hay turnos que coincidan'
                    : 'No hay turnos pendientes de check-in'}
                </p>
                <p className="mt-3 max-w-md text-slate-400">
                  Si ya hiciste check-in, esperá tu llamado en la sala.
                </p>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {filtered.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm backdrop-blur-sm"
                  >
                    <p className="font-display text-2xl font-semibold leading-tight">
                      {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
                    </p>
                    <p className="mt-2 text-lg text-slate-300">{appointment.owner_full_name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]} ·{' '}
                      {formatAppointmentTime(appointment.starts_at)}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        size="lg"
                        className="min-h-12 flex-1 text-base"
                        disabled={pendingId === appointment.id}
                        onClick={() => void doCheckIn(appointment)}
                      >
                        {pendingId === appointment.id ? 'Ingresando…' : 'Estoy aquí'}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="min-h-12 border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
                        disabled={pendingId === appointment.id}
                        onClick={() => void showQr(appointment)}
                      >
                        <QrCode className="h-5 w-5" />
                        QR
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SuccessPanel({
  patientName,
  queuePosition,
  onDone,
}: {
  patientName: string;
  queuePosition: number | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-emerald-300/30 bg-emerald-400/10 px-6 py-16 text-center">
      <CheckCircle2 className="h-16 w-16 text-emerald-300" />
      <h2 className="mt-6 font-display text-4xl font-semibold md:text-5xl">¡Listo!</h2>
      <p className="mt-4 text-2xl text-emerald-50">
        {patientName} ya está en sala de espera
        {queuePosition != null ? ` · lugar #${queuePosition}` : ''}.
      </p>
      <p className="mt-3 text-slate-300">Esperá tu llamado en la pantalla de la sala.</p>
      <Button size="lg" className="mt-8" onClick={onDone}>
        Nuevo check-in
      </Button>
    </div>
  );
}

function QrPanel({
  appointment,
  dataUrl,
  url,
  expiresAt,
  onBack,
  onCheckIn,
  pending,
}: {
  appointment: AppointmentListRow;
  dataUrl: string;
  url: string;
  expiresAt: string;
  onBack: () => void;
  onCheckIn: () => void;
  pending: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-center md:p-10">
      <div className="mb-4 flex w-full items-center justify-between">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">QR check-in</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Volver"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="font-display text-3xl font-semibold">
        {SPECIES_EMOJI[appointment.patient_species]} {appointment.patient_name}
      </p>
      <p className="mt-2 text-slate-300">Escaneá con el celular del tutor</p>
      <div className="mt-6 rounded-2xl bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- local QR data URL */}
        <img src={dataUrl} alt="Código QR de check-in" width={320} height={320} />
      </div>
      <p className="mt-3 break-all text-xs text-slate-500">{url}</p>
      <p className="mt-1 text-xs text-slate-400">
        Válido hasta {new Date(expiresAt).toLocaleString('es-AR')}
      </p>
      <div className="mt-6 flex w-full flex-wrap gap-2">
        <Button
          size="lg"
          className="min-h-12 flex-1"
          disabled={pending}
          onClick={onCheckIn}
        >
          {pending ? 'Ingresando…' : 'Check-in en este equipo'}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-h-12 border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
          onClick={onBack}
        >
          Volver
        </Button>
      </div>
    </div>
  );
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
