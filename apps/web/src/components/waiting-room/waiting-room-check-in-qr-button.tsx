'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X } from 'lucide-react';
import { createAppointmentCheckInToken } from '@/actions/waiting-room';
import { Button } from '@/components/ui/button';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

interface WaitingRoomCheckInQrButtonProps {
  appointmentId: string;
  patientName?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
}

export function WaitingRoomCheckInQrButton({
  appointmentId,
  patientName,
  size = 'sm',
  variant = 'outline',
}: WaitingRoomCheckInQrButtonProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [checkInUrl, setCheckInUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, runPending] = usePendingAction();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openQr = () => {
    setError(null);
    setOpen(true);
    void runPending(async () => {
      const result = await createAppointmentCheckInToken(appointmentId);
      if (!result.success || !result.data) {
        setError(result.error ?? 'No se pudo generar el QR');
        setQrDataUrl(null);
        setCheckInUrl(null);
        return;
      }
      setCheckInUrl(result.data.url);
      setExpiresAt(result.data.expires_at);
      const dataUrl = await QRCode.toDataURL(result.data.url, {
        margin: 1,
        width: 280,
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(dataUrl);
    });
  };

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={openQr}>
        <QrCode className="h-4 w-4" />
        QR check-in
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-checkin-title"
            className="relative z-10 w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="qr-checkin-title" className="text-lg font-semibold">
                  Check-in QR
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {patientName
                    ? `Pedile al tutor que escanee el código de ${patientName}.`
                    : 'Pedile al tutor que escanee el código con su celular.'}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {pending && !qrDataUrl && !error ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Generando código…</p>
            ) : error ? (
              <p className="py-6 text-center text-sm text-destructive">{error}</p>
            ) : qrDataUrl ? (
              <div className="space-y-3">
                <div className="mx-auto flex w-fit rounded-lg border bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local QR data URL */}
                  <img src={qrDataUrl} alt="Código QR de check-in" width={280} height={280} />
                </div>
                {checkInUrl && (
                  <p className="break-all text-center text-xs text-muted-foreground">{checkInUrl}</p>
                )}
                {expiresAt && (
                  <p className="text-center text-xs text-muted-foreground">
                    Válido hasta {new Date(expiresAt).toLocaleString('es-AR')}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
