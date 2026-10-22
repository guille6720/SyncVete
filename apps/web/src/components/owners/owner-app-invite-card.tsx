'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MessageCircle, Smartphone } from 'lucide-react';
import {
  sendOwnerAppInvite,
  type OwnerAppInviteChannel,
  type OwnerAppInviteResult,
} from '@/actions/owner-app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDashboardDateTime, type PortalAccessStatus } from '@sincvete/shared';

interface OwnerAppInviteCardProps {
  ownerId: string;
  hasWhatsAppPhone: boolean;
  hasEmail: boolean;
  portalStatus?: PortalAccessStatus | null;
}

export function OwnerAppInviteCard({
  ownerId,
  hasWhatsAppPhone,
  hasEmail,
  portalStatus = null,
}: OwnerAppInviteCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<OwnerAppInviteChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OwnerAppInviteResult | null>(null);
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);

  const alreadyInvited =
    portalStatus === 'invited' ||
    portalStatus === 'pending_approval' ||
    portalStatus === 'active';
  const whatsappLabel = alreadyInvited ? 'Reenviar por WhatsApp' : 'Enviar por WhatsApp';
  const emailLabel = alreadyInvited ? 'Reenviar por email' : 'Enviar por email';

  const handleSend = async (channel: OwnerAppInviteChannel) => {
    setPending(channel);
    setError(null);
    setCopied(null);
    const popup =
      channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    const response = await sendOwnerAppInvite(ownerId, channel);
    setPending(null);
    if (!response.success || !response.data) {
      popup?.close();
      setError(response.error ?? 'No se pudo enviar la app');
      return;
    }
    setResult(response.data);
    router.refresh();
    if (channel === 'whatsapp' && response.data.whatsappUrl && popup) {
      popup.location.href = response.data.whatsappUrl;
    } else {
      popup?.close();
    }
  };

  const handleCopy = async (kind: 'link' | 'message') => {
    if (!result) return;
    const value =
      kind === 'link' ? result.activateUrl : (result.whatsappText ?? result.activateUrl);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
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
          Generá un enlace privado y reenvialo por WhatsApp o email. Al reenviar, el enlace
          anterior deja de funcionar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasWhatsAppPhone && (
          <p className="text-sm text-muted-foreground">
            Cargá un teléfono o WhatsApp en la ficha para enviar por WhatsApp.
          </p>
        )}
        {!hasEmail && (
          <p className="text-sm text-muted-foreground">
            Cargá un email en la ficha para enviar por correo.
          </p>
        )}
        {portalStatus === 'pending_approval' && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            El propietario ya creó la cuenta. Activá el acceso en la tarjeta Portal del tutor.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSend('whatsapp')}
            disabled={pending !== null || !hasWhatsAppPhone}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            {pending === 'whatsapp' ? 'Generando…' : whatsappLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSend('email')}
            disabled={pending !== null || !hasEmail}
          >
            <Mail className="mr-2 h-4 w-4" />
            {pending === 'email' ? 'Enviando…' : emailLabel}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            {result.channel === 'whatsapp' && result.whatsappUrl ? (
              <p>
                WhatsApp listo para enviar.{' '}
                <a
                  href={result.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  Abrir WhatsApp
                </a>
              </p>
            ) : (
              <p>
                {result.emailSent
                  ? 'Invitación enviada por email.'
                  : 'No se pudo enviar el email automático. Compartí el enlace de abajo.'}
              </p>
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Enlace privado</p>
              <p className="break-all text-xs">{result.activateUrl}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy('link')}>
                Copiar enlace
              </Button>
              {result.whatsappText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy('message')}
                >
                  Copiar mensaje
                </Button>
              )}
              {copied && (
                <span className="text-xs text-muted-foreground">
                  {copied === 'link' ? 'Enlace copiado.' : 'Mensaje copiado.'}
                </span>
              )}
            </div>
            {result.expiresAt && (
              <p className="text-xs text-muted-foreground">
                El enlace es personal y vence el {formatDashboardDateTime(result.expiresAt)}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
