'use client';

import { Download, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { APP_NAME } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export function InstallAppPrompt() {
  const { visible, canInstallNative, canShowIosHint, dismiss, install } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (!visible) return null;

  const handlePrimary = async () => {
    if (canInstallNative) {
      await install();
      return;
    }
    setIosOpen((open) => !open);
  };

  return (
    <div className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[65] p-3 sm:p-4">
      <div className="pointer-events-auto mx-auto flex max-w-xl flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: 'var(--clinic, #3f6b4a)' }}
          >
            {canInstallNative ? <Download className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Instalá {APP_NAME} en tu celular</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {canInstallNative
                ? 'Accedé más rápido, pantalla completa y el logo de SyncVete en tu inicio.'
                : 'Agregá un acceso directo con el logo de SyncVete desde Safari.'}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {iosOpen && canShowIosHint && !canInstallNative ? (
          <ol className="list-decimal space-y-1 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            <li>Abrí el menú Compartir de Safari</li>
            <li>Tocá Agregar a inicio</li>
            <li>Confirmá con Agregar</li>
          </ol>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" className="flex-1" onClick={() => void handlePrimary()}>
            {canInstallNative ? 'Instalar app' : 'Ver cómo instalar'}
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss}>
            Ahora no
          </Button>
        </div>
      </div>
    </div>
  );
}
