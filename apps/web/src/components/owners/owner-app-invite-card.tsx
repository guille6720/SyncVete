'use client';

import { useState } from 'react';
import { MessageCircle, Smartphone } from 'lucide-react';
import { sendOwnerAppInvite, type OwnerAppInviteResult } from '@/actions/owner-app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDashboardDateTime } from '@sincvete/shared';

interface OwnerAppInviteCardProps {
  ownerId: string;
  hasWhatsAppPhone: boolean;
}

export function OwnerAppInviteCard({ ownerId, hasWhatsAppPhone }: OwnerAppInviteCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OwnerAppInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSend = async () => {
    setPending(true);
    setError(null);
    setCopied(false);
    // Opened synchronously so the browser does not block it as a popup.
    const popup = window.open('about:blank', '_blank');
    const response = await sendOwnerAppInvite(ownerId);
    setPending(false);
    if (!response.success || !response.data) {
      popup?.close();
      setError(response.error ?? 'No se pudo enviar la app');
      return;
    }
    setResult(response.data);
    if (popup) popup.location.href = response.data.whatsappUrl;
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.whatsappText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Smartphone className="h-5 w-5" />
          App del propietario
        </CardTitle>
        <CardDescription>
          Enviale por WhatsApp el enlace privado para descargar la app: vacunas, tratamientos y turnos desde su
          celular.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasWhatsAppPhone && (
          <p className="text-sm text-muted-foreground">
            Cargá un teléfono o WhatsApp en la ficha para poder enviarle la app.
          </p>
        )}

        <Button type="button" size="sm" onClick={() => void handleSend()} disabled={pending || !hasWhatsAppPhone}>
          <MessageCircle className="mr-2 h-4 w-4" />
          {pending ? 'Generando enlace…' : result ? 'Reenviar app por WhatsApp' : 'Enviar app por WhatsApp'}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <p>
              WhatsApp listo para enviar.{' '}
              <a href={result.whatsappUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                Abrir WhatsApp
              </a>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy()}>
                Copiar mensaje
              </Button>
              {copied && <span className="text-xs text-muted-foreground">Mensaje copiado.</span>}
            </div>
            {result.expiresAt && (
              <p className="text-xs text-muted-foreground">
                El enlace es personal y vence el {formatDashboardDateTime(result.expiresAt)}. Al reenviar, el
                anterior deja de funcionar.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
