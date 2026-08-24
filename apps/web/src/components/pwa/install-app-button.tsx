'use client';

import { Download, Share } from 'lucide-react';
import { useState } from 'react';
import { APP_NAME } from '@sincvete/shared';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { cn } from '@/lib/utils';

type InstallAppButtonProps = {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showIosSteps?: boolean;
  landing?: boolean;
};

export function InstallAppButton({
  variant = 'outline',
  size = 'sm',
  className,
  showIosSteps = true,
  landing = false,
}: InstallAppButtonProps) {
  const { visible, canInstallNative, canShowIosHint, install } = usePwaInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (!visible) return null;

  const handleClick = async () => {
    if (canInstallNative) {
      await install();
      return;
    }
    if (canShowIosHint) {
      setIosOpen((open) => !open);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Button
        type="button"
        variant={landing ? 'outline' : variant}
        size={size}
        className={cn(
          landing &&
            'rounded-none border-[var(--land-ink)]/20 bg-transparent text-[var(--land-ink)] hover:bg-[var(--land-surface)]',
          className
        )}
        aria-label={`Instalar ${APP_NAME}`}
        onClick={() => void handleClick()}
      >
        {canShowIosHint && !canInstallNative ? (
          <Share className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {size === 'icon' ? <span className="sr-only">Instalar {APP_NAME}</span> : `Instalar ${APP_NAME}`}
      </Button>
      {showIosSteps && iosOpen && canShowIosHint && !canInstallNative ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-card p-3 text-left text-xs shadow-lg">
          <p className="font-medium text-foreground">En iPhone (Safari)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Tocá Compartir</li>
            <li>Elegí Agregar a inicio</li>
            <li>Confirmá con Agregar</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
