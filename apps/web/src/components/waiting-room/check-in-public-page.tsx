'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  APPOINTMENT_TYPE_LABELS,
  PORTAL_WAITING_ROOM_STATUS_MESSAGES,
  SPECIES_EMOJI,
  WAITING_ROOM_STATUS_LABELS,
  WAITING_ROOM_STATUS_VARIANT,
  estimatePortalWaitingMinutes,
  formatAppointmentDateTime,
  formatPortalWaitingEta,
  formatWaitMinutes,
  isWaitingRoomStatus,
  minutesBetween,
  type PublicCheckInStatus,
  type WaitingRoomCheckInPreview,
  type WaitingRoomStatus,
} from '@sincvete/shared';
import { getPublicCheckInStatus, redeemAppointmentCheckIn } from '@/actions/waiting-room';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CheckInPublicPageProps {
  token: string;
  preview: WaitingRoomCheckInPreview;
}

export function CheckInPublicPage({ token, preview }: CheckInPublicPageProps) {
  const [liveStatus, setLiveStatus] = useState<PublicCheckInStatus | null>(null);
  const [done, setDone] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [patientName, setPatientName] = useState(preview.patient_name ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getPublicCheckInStatus(token);
      setLiveStatus(next);
      if (next.valid && next.patient_name) {
        setPatientName(next.patient_name);
      }
      if (next.valid && next.queue_position != null) {
        setQueuePosition(next.queue_position);
      }
      if (next.valid) setDone(true);
    } catch (err) {
      console.error('[check-in public] status refresh failed', err);
    }
  }, [token]);

  useEffect(() => {
    if (
      preview.reason === 'already_redeemed' ||
      preview.reason === 'already_checked_in'
    ) {
      void refreshStatus();
    }
  }, [preview.reason, refreshStatus]);

  useEffect(() => {
    if (!done && !liveStatus?.valid) return;
    const pollId = window.setInterval(() => {
      void refreshStatus();
    }, 12_000);
    const clockId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(clockId);
    };
  }, [done, liveStatus?.valid, refreshStatus]);

  const reasonMessage = (() => {
    switch (preview.reason) {
      case 'already_redeemed':
      case 'already_checked_in':
        return 'Este turno ya tiene check-in en sala de espera.';
      case 'expired':
        return 'Este código QR expiró. Pedí uno nuevo en recepción.';
      case 'appointment_closed':
        return 'Esta cita ya no admite check-in.';
      case 'not_found':
      case 'invalid_token':
        return 'Código de check-in inválido.';
      default:
        return 'No se puede usar este código de check-in.';
    }
  })();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await redeemAppointmentCheckIn(token);
      if (!result.success || !result.data) {
        setError(result.error ?? 'No se pudo completar el check-in');
        return;
      }
      setDone(true);
      setQueuePosition(result.data.queue_position);
      setPatientName(result.data.patient_name);
      await refreshStatus();
    });
  };

  const showLive = done || liveStatus?.valid;
  const status = liveStatus?.valid ? liveStatus : null;
  const terminal = status?.terminal || status?.waiting_room_status === 'completed';

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-emerald-50 via-background to-background">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-5">
        <BrandLogo href="/" size="sm" />
        <Link href="/login" className="text-sm text-muted-foreground hover:underline">
          Ingresar
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-10">
        <div className="rounded-2xl border bg-card/95 p-6 shadow-sm">
          {!preview.valid && !showLive ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-semibold">Check-in no disponible</h1>
              <p className="text-sm text-muted-foreground">{reasonMessage}</p>
            </div>
          ) : showLive && status ? (
            <CheckInLiveStatusView
              status={status}
              patientName={patientName}
              queuePosition={queuePosition}
              now={now}
              terminal={terminal}
            />
          ) : showLive ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-semibold text-emerald-800">¡Listo!</h1>
              <p className="text-sm text-muted-foreground">
                {patientName ? `${patientName} ya está` : 'Tu mascota ya está'} en sala de espera
                {queuePosition != null ? ` · lugar #${queuePosition}` : ''}.
              </p>
              <p className="text-sm text-muted-foreground">Actualizando estado…</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {preview.organization_name ?? 'SyncVete'}
                </p>
                <h1 className="text-2xl font-semibold">Confirmar llegada</h1>
                <p className="text-sm text-muted-foreground">
                  Tocá el botón para ingresar a la sala de espera.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-lg font-medium">
                  {preview.patient_species
                    ? `${SPECIES_EMOJI[preview.patient_species]} `
                    : ''}
                  {preview.patient_name ?? 'Paciente'}
                </p>
                {preview.appointment_type && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {APPOINTMENT_TYPE_LABELS[preview.appointment_type]}
                  </p>
                )}
                {preview.appointment_starts_at && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Turno {formatAppointmentDateTime(preview.appointment_starts_at)}
                  </p>
                )}
              </div>

              {error && <p className="text-center text-sm text-destructive">{error}</p>}

              <Button className="w-full" size="lg" disabled={pending} onClick={confirm}>
                {pending ? 'Confirmando…' : 'Estoy aquí · Check-in'}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CheckInLiveStatusView({
  status,
  patientName,
  queuePosition,
  now,
  terminal,
}: {
  status: PublicCheckInStatus;
  patientName: string | null;
  queuePosition: number | null;
  now: Date;
  terminal: boolean;
}) {
  const wrStatus = status.waiting_room_status;
  const statusKey =
    wrStatus && isWaitingRoomStatus(String(wrStatus)) ? (wrStatus as WaitingRoomStatus) : null;
  const message = statusKey
    ? PORTAL_WAITING_ROOM_STATUS_MESSAGES[statusKey]
    : 'Seguimiento de sala de espera';
  const called = statusKey === 'called';
  const paymentPending = statusKey === 'payment_pending';
  const inConsultation = statusKey === 'in_consultation';
  const waiting = statusKey === 'waiting';
  const etaMinutes =
    waiting && status.ahead_count != null
      ? estimatePortalWaitingMinutes(status.ahead_count, {
          minutesPerPatient: status.minutes_per_patient,
        })
      : null;
  const etaLabel = formatPortalWaitingEta(etaMinutes);
  const elapsedWait =
    waiting && status.checked_in_at ? minutesBetween(status.checked_in_at, now) : null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">
          {terminal ? 'Visita finalizada' : 'Seguimiento en vivo'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {status.patient_species ? `${SPECIES_EMOJI[status.patient_species]} ` : ''}
          {patientName ?? status.patient_name ?? 'Tu mascota'}
        </p>
      </div>

      <div
        className={`rounded-xl border p-4 ${
          called
            ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
            : paymentPending
              ? 'border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
              : inConsultation
                ? 'border-teal-400 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/40'
                : ''
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p
            className={`text-sm ${
              called || paymentPending || inConsultation ? 'font-semibold' : ''
            }`}
          >
            {message}
            {called && status.room ? ` · Consultorio ${status.room}` : ''}
          </p>
          {statusKey && (
            <Badge variant={WAITING_ROOM_STATUS_VARIANT[statusKey]}>
              {WAITING_ROOM_STATUS_LABELS[statusKey]}
            </Badge>
          )}
        </div>

        {waiting && (
          <p className="mt-2 text-sm text-muted-foreground">
            {(status.ahead_count ?? 0) === 0
              ? 'Sos el próximo en la cola'
              : status.ahead_count === 1
                ? 'Hay 1 paciente delante'
                : `Hay ${status.ahead_count} pacientes delante`}
            {etaLabel ? ` · ${etaLabel}` : ''}
            {elapsedWait != null ? ` · llevas ${formatWaitMinutes(elapsedWait)} en espera` : ''}
          </p>
        )}

        {(status.queue_position != null || queuePosition != null) && waiting && (
          <p className="mt-1 text-xs text-muted-foreground">
            Lugar #{status.queue_position ?? queuePosition}
          </p>
        )}

        {paymentPending && (
          <p className="mt-2 text-sm text-muted-foreground">
            Acercate a recepción cuando puedas
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Se actualiza automáticamente cada pocos segundos
      </p>

      <Button asChild className="w-full" variant={terminal ? 'default' : 'outline'}>
        <Link href="/portal/sala-espera">
          {terminal ? 'Ir al portal' : 'Ver en el portal del tutor'}
        </Link>
      </Button>
    </div>
  );
}
