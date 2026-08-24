'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  APPOINTMENT_TYPE_LABELS,
  SPECIES_EMOJI,
  formatAppointmentDateTime,
  type WaitingRoomCheckInPreview,
} from '@sincvete/shared';
import { redeemAppointmentCheckIn } from '@/actions/waiting-room';
import { BrandLogo } from '@/components/brand/syncvete-logo';
import { Button } from '@/components/ui/button';

interface CheckInPublicPageProps {
  token: string;
  preview: WaitingRoomCheckInPreview;
}

export function CheckInPublicPage({ token, preview }: CheckInPublicPageProps) {
  const [done, setDone] = useState(false);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [patientName, setPatientName] = useState(preview.patient_name ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    });
  };

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
          {!preview.valid && !done ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-semibold">Check-in no disponible</h1>
              <p className="text-sm text-muted-foreground">{reasonMessage}</p>
            </div>
          ) : done ? (
            <div className="space-y-3 text-center">
              <h1 className="text-xl font-semibold text-emerald-800">¡Listo!</h1>
              <p className="text-sm text-muted-foreground">
                {patientName ? `${patientName} ya está` : 'Tu mascota ya está'} en sala de espera
                {queuePosition != null ? ` · lugar #${queuePosition}` : ''}.
              </p>
              <p className="text-sm text-muted-foreground">
                Podés seguir el estado desde el portal del tutor.
              </p>
              <Button asChild className="mt-2 w-full">
                <Link href="/portal/sala-espera">Ir al portal</Link>
              </Button>
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
